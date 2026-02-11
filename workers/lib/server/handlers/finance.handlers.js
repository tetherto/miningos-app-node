'use strict'

const {
  WORKER_TYPES,
  AGGR_FIELDS,
  PERIOD_TYPES,
  MINERPOOL_EXT_DATA_KEYS,
  RPC_METHODS,
  BTC_SATS
} = require('../../constants')
const {
  requestRpcEachLimit,
  getStartOfDay,
  safeDiv,
  runParallel
} = require('../../utils')
const { aggregateByPeriod } = require('../../period.utils')

async function getEnergyBalance (ctx, req) {
  const start = Number(req.query.start)
  const end = Number(req.query.end)
  const period = req.query.period || PERIOD_TYPES.DAILY

  if (!start || !end) {
    throw new Error('ERR_MISSING_START_END')
  }

  if (start >= end) {
    throw new Error('ERR_INVALID_DATE_RANGE')
  }

  const startDate = new Date(start).toISOString()
  const endDate = new Date(end).toISOString()
  const startYearMonth = `${new Date(start).getFullYear()}-${String(new Date(start).getMonth() + 1).padStart(2, '0')}`
  const endYearMonth = `${new Date(end).getFullYear()}-${String(new Date(end).getMonth() + 1).padStart(2, '0')}`

  const [consumptionResults, transactionResults, priceResults, currentPriceResults, productionCosts] = await runParallel([
    (cb) => requestRpcEachLimit(ctx, RPC_METHODS.TAIL_LOG_RANGE_AGGR, {
      keys: [{
        type: WORKER_TYPES.POWERMETER,
        startDate,
        endDate,
        fields: { [AGGR_FIELDS.SITE_POWER]: 1 },
        shouldReturnDailyData: 1
      }]
    }).then(r => cb(null, r)).catch(cb),

    (cb) => requestRpcEachLimit(ctx, RPC_METHODS.GET_WRK_EXT_DATA, {
      type: WORKER_TYPES.MINERPOOL,
      query: { key: MINERPOOL_EXT_DATA_KEYS.TRANSACTIONS, start, end }
    }).then(r => cb(null, r)).catch(cb),

    (cb) => requestRpcEachLimit(ctx, RPC_METHODS.GET_WRK_EXT_DATA, {
      type: WORKER_TYPES.MEMPOOL,
      query: { key: 'prices', start, end }
    }).then(r => cb(null, r)).catch(cb),

    (cb) => requestRpcEachLimit(ctx, RPC_METHODS.GET_WRK_EXT_DATA, {
      type: WORKER_TYPES.MEMPOOL,
      query: { key: 'current_price' }
    }).then(r => cb(null, r)).catch(cb),

    (cb) => ctx.globalDataLib.getGlobalData({
      type: 'productionCosts',
      range: { gte: startYearMonth, lte: endYearMonth }
    }).then(r => cb(null, r)).catch(cb)
  ])

  const dailyConsumption = processConsumptionData(consumptionResults)
  const dailyTransactions = processTransactionData(transactionResults)
  const dailyPrices = processPriceData(priceResults)
  const currentBtcPrice = extractCurrentPrice(currentPriceResults)
  const costsByMonth = processCostsData(productionCosts)

  const allDays = new Set([
    ...Object.keys(dailyConsumption),
    ...Object.keys(dailyTransactions)
  ])

  const log = []
  for (const dayTs of [...allDays].sort()) {
    const ts = Number(dayTs)
    const consumption = dailyConsumption[dayTs] || {}
    const transactions = dailyTransactions[dayTs] || {}
    const btcPrice = dailyPrices[dayTs] || currentBtcPrice || 0

    const powerW = consumption.powerW || 0
    const powerMWh = (powerW * 24) / 1000000
    const revenueBTC = transactions.revenueBTC || 0
    const revenueUSD = revenueBTC * btcPrice

    const monthKey = `${new Date(ts).getFullYear()}-${String(new Date(ts).getMonth() + 1).padStart(2, '0')}`
    const costs = costsByMonth[monthKey] || {}
    const energyCostPerMWh = costs.energyCostPerMWh || 0
    const operationalCostPerMWh = costs.operationalCostPerMWh || 0

    const energyCostUSD = powerMWh * energyCostPerMWh
    const totalCostUSD = powerMWh * (energyCostPerMWh + operationalCostPerMWh)

    log.push({
      ts,
      powerW,
      consumptionMWh: powerMWh,
      revenueBTC,
      revenueUSD,
      btcPrice,
      energyCostUSD,
      totalCostUSD,
      energyRevenuePerMWh: safeDiv(revenueUSD, powerMWh),
      allInCostPerMWh: safeDiv(totalCostUSD, powerMWh),
      profitUSD: revenueUSD - totalCostUSD
    })
  }

  const aggregated = aggregateByPeriod(log, period)
  const summary = calculateSummary(aggregated)

  return { log: aggregated, summary }
}

function processConsumptionData (results) {
  const daily = {}
  for (const res of results) {
    if (res.error || !res) continue
    const data = Array.isArray(res) ? res : (res.data || res.result || [])
    if (!Array.isArray(data)) continue
    for (const entry of data) {
      if (!entry) continue
      const items = entry.data || entry.items || entry
      if (Array.isArray(items)) {
        for (const item of items) {
          const ts = getStartOfDay(item.ts || item.timestamp)
          if (!daily[ts]) daily[ts] = { powerW: 0 }
          daily[ts].powerW += (item[AGGR_FIELDS.SITE_POWER] || item.site_power_w || 0)
        }
      } else if (typeof items === 'object') {
        for (const [key, val] of Object.entries(items)) {
          const ts = getStartOfDay(Number(key))
          if (!daily[ts]) daily[ts] = { powerW: 0 }
          const power = typeof val === 'object' ? (val[AGGR_FIELDS.SITE_POWER] || val.site_power_w || 0) : (Number(val) || 0)
          daily[ts].powerW += power
        }
      }
    }
  }
  return daily
}

function processTransactionData (results) {
  const daily = {}
  for (const res of results) {
    if (res.error || !res) continue
    const data = Array.isArray(res) ? res : (res.data || res.result || [])
    if (!Array.isArray(data)) continue
    for (const tx of data) {
      if (!tx) continue
      const txList = tx.data || tx.transactions || tx
      if (!Array.isArray(txList)) continue
      for (const t of txList) {
        if (!t) continue
        const ts = getStartOfDay(t.ts || t.timestamp || t.time)
        if (!ts) continue
        if (!daily[ts]) daily[ts] = { revenueBTC: 0 }
        const amount = t.changed_balance || t.amount || t.value || 0
        daily[ts].revenueBTC += Math.abs(amount) / BTC_SATS
      }
    }
  }
  return daily
}

function processPriceData (results) {
  const daily = {}
  for (const res of results) {
    if (res.error || !res) continue
    const data = Array.isArray(res) ? res : (res.data || res.result || [])
    if (!Array.isArray(data)) continue
    for (const entry of data) {
      if (!entry) continue
      const items = entry.data || entry.prices || entry
      if (Array.isArray(items)) {
        for (const item of items) {
          const ts = getStartOfDay(item.ts || item.timestamp || item.time)
          if (ts && item.price) {
            daily[ts] = item.price
          }
        }
      } else if (typeof items === 'object' && !Array.isArray(items)) {
        for (const [key, val] of Object.entries(items)) {
          const ts = getStartOfDay(Number(key))
          if (ts) {
            daily[ts] = typeof val === 'object' ? (val.USD || val.price || 0) : Number(val) || 0
          }
        }
      }
    }
  }
  return daily
}

function extractCurrentPrice (results) {
  for (const res of results) {
    if (res.error || !res) continue
    const data = Array.isArray(res) ? res[0] : res
    if (!data) continue
    const price = data.data || data.result || data
    if (typeof price === 'number') return price
    if (typeof price === 'object') return price.USD || price.price || price.current_price || 0
  }
  return 0
}

function processCostsData (costs) {
  const byMonth = {}
  if (!Array.isArray(costs)) return byMonth
  for (const entry of costs) {
    if (!entry || !entry.key) continue
    const key = entry.key
    const data = entry.value || entry.data || entry
    byMonth[key] = {
      energyCostPerMWh: data.energyCostPerMWh || data.energy_cost_per_mwh || 0,
      operationalCostPerMWh: data.operationalCostPerMWh || data.operational_cost_per_mwh || 0
    }
  }
  return byMonth
}

function calculateSummary (log) {
  if (!log.length) {
    return { totalRevenueBTC: 0, totalRevenueUSD: 0, totalCostUSD: 0, totalProfitUSD: 0, avgCostPerMWh: null, avgRevenuePerMWh: null, totalConsumptionMWh: 0 }
  }

  const totals = log.reduce((acc, entry) => {
    acc.revenueBTC += entry.revenueBTC || 0
    acc.revenueUSD += entry.revenueUSD || 0
    acc.costUSD += entry.totalCostUSD || 0
    acc.profitUSD += entry.profitUSD || 0
    acc.consumptionMWh += entry.consumptionMWh || 0
    return acc
  }, { revenueBTC: 0, revenueUSD: 0, costUSD: 0, profitUSD: 0, consumptionMWh: 0 })

  return {
    totalRevenueBTC: totals.revenueBTC,
    totalRevenueUSD: totals.revenueUSD,
    totalCostUSD: totals.costUSD,
    totalProfitUSD: totals.profitUSD,
    avgCostPerMWh: safeDiv(totals.costUSD, totals.consumptionMWh),
    avgRevenuePerMWh: safeDiv(totals.revenueUSD, totals.consumptionMWh),
    totalConsumptionMWh: totals.consumptionMWh
  }
}

module.exports = {
  getEnergyBalance,
  processConsumptionData,
  processTransactionData,
  processPriceData,
  extractCurrentPrice,
  processCostsData,
  calculateSummary
}
