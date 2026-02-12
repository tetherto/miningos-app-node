'use strict'

const {
  WORKER_TYPES,
  AGGR_FIELDS,
  PERIOD_TYPES,
  MINERPOOL_EXT_DATA_KEYS,
  RPC_METHODS,
  BTC_SATS,
  GLOBAL_DATA_TYPES
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

  const [
    consumptionResults,
    transactionResults,
    priceResults,
    currentPriceResults,
    productionCosts,
    activeEnergyInResults,
    uteEnergyResults,
    globalConfigResults
  ] = await runParallel([
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
      query: { key: 'HISTORICAL_PRICES', start, end }
    }).then(r => cb(null, r)).catch(cb),

    (cb) => requestRpcEachLimit(ctx, RPC_METHODS.GET_WRK_EXT_DATA, {
      type: WORKER_TYPES.MEMPOOL,
      query: { key: 'current_price' }
    }).then(r => cb(null, r)).catch(cb),

    (cb) => getProductionCosts(ctx, req.query.site, start, end)
      .then(r => cb(null, r)).catch(cb),

    (cb) => requestRpcEachLimit(ctx, RPC_METHODS.GET_WRK_EXT_DATA, {
      type: WORKER_TYPES.ELECTRICITY,
      query: { key: 'stats-history', start, end, groupRange: '1D' }
    }).then(r => cb(null, r)).catch(cb),

    (cb) => requestRpcEachLimit(ctx, RPC_METHODS.GET_WRK_EXT_DATA, {
      type: WORKER_TYPES.ELECTRICITY,
      query: { key: 'stats-history', start, end, groupRange: '1D' }
    }).then(r => cb(null, r)).catch(cb),

    (cb) => requestRpcEachLimit(ctx, RPC_METHODS.GLOBAL_CONFIG, {})
      .then(r => cb(null, r)).catch(cb)
  ])

  const dailyConsumption = processConsumptionData(consumptionResults)
  const dailyTransactions = processTransactionData(transactionResults)
  const dailyPrices = processPriceData(priceResults)
  const currentBtcPrice = extractCurrentPrice(currentPriceResults)
  const costsByMonth = processCostsData(productionCosts)
  const dailyActiveEnergyIn = processEnergyData(activeEnergyInResults, AGGR_FIELDS.ACTIVE_ENERGY_IN)
  const dailyUteEnergy = processEnergyData(uteEnergyResults, AGGR_FIELDS.UTE_ENERGY)
  const nominalPowerMW = extractNominalPower(globalConfigResults)

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
    const energyCostUSD = costs.energyCostPerDay || 0
    const totalCostUSD = energyCostUSD + (costs.operationalCostPerDay || 0)

    const activeEnergyIn = dailyActiveEnergyIn[dayTs] || 0
    const uteEnergy = dailyUteEnergy[dayTs] || 0
    const consumptionMWh = powerMWh

    const curtailmentMWh = activeEnergyIn > 0
      ? activeEnergyIn - consumptionMWh
      : null
    const curtailmentRate = curtailmentMWh !== null
      ? safeDiv(curtailmentMWh, consumptionMWh)
      : null

    const operationalIssuesRate = uteEnergy > 0
      ? safeDiv(uteEnergy - consumptionMWh, uteEnergy)
      : null

    const actualPowerMW = powerW / 1000000
    const powerUtilization = nominalPowerMW > 0
      ? safeDiv(actualPowerMW, nominalPowerMW)
      : null

    log.push({
      ts,
      powerW,
      consumptionMWh,
      revenueBTC,
      revenueUSD,
      btcPrice,
      energyCostUSD,
      totalCostUSD,
      energyRevenuePerMWh: safeDiv(revenueUSD, powerMWh),
      allInCostPerMWh: safeDiv(totalCostUSD, powerMWh),
      profitUSD: revenueUSD - totalCostUSD,
      curtailmentMWh,
      curtailmentRate,
      operationalIssuesRate,
      powerUtilization
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
      if (!entry || entry.error) continue
      const items = entry.data || entry.items || entry
      if (Array.isArray(items)) {
        for (const item of items) {
          const ts = getStartOfDay(item.ts || item.timestamp)
          if (!ts) continue
          if (!daily[ts]) daily[ts] = { powerW: 0 }
          const val = item.val || item
          daily[ts].powerW += (val[AGGR_FIELDS.SITE_POWER] || val.site_power_w || 0)
        }
      } else if (typeof items === 'object') {
        for (const [key, val] of Object.entries(items)) {
          const ts = getStartOfDay(Number(key))
          if (!ts) continue
          if (!daily[ts]) daily[ts] = { powerW: 0 }
          const power = typeof val === 'object' ? (val[AGGR_FIELDS.SITE_POWER] || val.site_power_w || 0) : (Number(val) || 0)
          daily[ts].powerW += power
        }
      }
    }
  }
  return daily
}

function normalizeTimestampMs (ts) {
  if (!ts) return 0
  return ts < 1e12 ? ts * 1000 : ts
}

function processTransactionData (results) {
  const daily = {}
  for (const res of results) {
    if (!res || res.error) continue
    const data = Array.isArray(res) ? res : (res.data || res.result || [])
    if (!Array.isArray(data)) continue
    for (const tx of data) {
      if (!tx) continue
      const txList = tx.data || tx.transactions || tx
      if (!Array.isArray(txList)) continue
      for (const t of txList) {
        if (!t) continue
        const rawTs = t.ts || t.created_at || t.timestamp || t.time
        const ts = getStartOfDay(normalizeTimestampMs(rawTs))
        if (!ts) continue
        const day = daily[ts] ??= { revenueBTC: 0 }
        if (t.satoshis_net_earned) {
          day.revenueBTC += Math.abs(t.satoshis_net_earned) / BTC_SATS
        } else {
          day.revenueBTC += Math.abs(t.changed_balance || t.amount || t.value || 0)
        }
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
      const rawTs = entry.ts || entry.timestamp || entry.time
      const ts = getStartOfDay(normalizeTimestampMs(rawTs))
      const price = entry.priceUSD || entry.price
      if (ts && price) {
        daily[ts] = price
      }
    }
  }
  return daily
}

function extractCurrentPrice (results) {
  for (const res of results) {
    if (res.error || !res) continue
    const data = Array.isArray(res) ? res : [res]
    for (const entry of data) {
      if (!entry) continue
      if (entry.currentPrice) return entry.currentPrice
      if (entry.priceUSD) return entry.priceUSD
      if (entry.price) return entry.price
    }
  }
  return 0
}

function processEnergyData (results, aggrField) {
  const daily = {}
  for (const res of results) {
    if (!res || res.error) continue
    const data = Array.isArray(res) ? res : (res.data || res.result || [])
    if (!Array.isArray(data)) continue
    for (const entry of data) {
      if (!entry) continue
      const items = Array.isArray(entry) ? entry : (entry.data || entry)
      if (Array.isArray(items)) {
        for (const item of items) {
          if (!item) continue
          const ts = getStartOfDay(item.ts || item.timestamp)
          if (!ts) continue
          const energyAggr = item[AGGR_FIELDS.ENERGY_AGGR]
          if (energyAggr && energyAggr[aggrField]) {
            daily[ts] = (daily[ts] || 0) + Number(energyAggr[aggrField])
          }
        }
      }
    }
  }
  return daily
}

function extractNominalPower (results) {
  for (const res of results) {
    if (!res || res.error) continue
    const data = Array.isArray(res) ? res : [res]
    for (const entry of data) {
      if (!entry) continue
      if (entry.nominalPowerAvailability_MW) return entry.nominalPowerAvailability_MW
    }
  }
  return 0
}

async function getProductionCosts (ctx, site, start, end) {
  if (!ctx.globalDataLib) return []
  const costs = await ctx.globalDataLib.getGlobalData({
    type: GLOBAL_DATA_TYPES.PRODUCTION_COSTS
  })
  if (!Array.isArray(costs)) return []

  const startDate = new Date(start)
  const endDate = new Date(end)
  return costs.filter(entry => {
    if (!entry || !entry.year || !entry.month) return false
    if (site && entry.site !== site) return false
    const entryDate = new Date(entry.year, entry.month - 1, 1)
    return entryDate >= startDate && entryDate <= endDate
  })
}

function processCostsData (costs) {
  const byMonth = {}
  if (!Array.isArray(costs)) return byMonth
  for (const entry of costs) {
    if (!entry || !entry.year || !entry.month) continue
    const key = `${entry.year}-${String(entry.month).padStart(2, '0')}`
    const daysInMonth = new Date(entry.year, entry.month, 0).getDate()
    byMonth[key] = {
      energyCostPerDay: (entry.energyCost || entry.energyCostsUSD || 0) / daysInMonth,
      operationalCostPerDay: (entry.operationalCost || entry.operationalCostsUSD || 0) / daysInMonth
    }
  }
  return byMonth
}

function calculateSummary (log) {
  if (!log.length) {
    return {
      totalRevenueBTC: 0,
      totalRevenueUSD: 0,
      totalCostUSD: 0,
      totalProfitUSD: 0,
      avgCostPerMWh: null,
      avgRevenuePerMWh: null,
      totalConsumptionMWh: 0,
      avgCurtailmentRate: null,
      avgOperationalIssuesRate: null,
      avgPowerUtilization: null
    }
  }

  const totals = log.reduce((acc, entry) => {
    acc.revenueBTC += entry.revenueBTC || 0
    acc.revenueUSD += entry.revenueUSD || 0
    acc.costUSD += entry.totalCostUSD || 0
    acc.profitUSD += entry.profitUSD || 0
    acc.consumptionMWh += entry.consumptionMWh || 0
    if (entry.curtailmentRate !== null && entry.curtailmentRate !== undefined) {
      acc.curtailmentRateSum += entry.curtailmentRate
      acc.curtailmentRateCount++
    }
    if (entry.operationalIssuesRate !== null && entry.operationalIssuesRate !== undefined) {
      acc.operationalIssuesRateSum += entry.operationalIssuesRate
      acc.operationalIssuesRateCount++
    }
    if (entry.powerUtilization !== null && entry.powerUtilization !== undefined) {
      acc.powerUtilizationSum += entry.powerUtilization
      acc.powerUtilizationCount++
    }
    return acc
  }, {
    revenueBTC: 0,
    revenueUSD: 0,
    costUSD: 0,
    profitUSD: 0,
    consumptionMWh: 0,
    curtailmentRateSum: 0,
    curtailmentRateCount: 0,
    operationalIssuesRateSum: 0,
    operationalIssuesRateCount: 0,
    powerUtilizationSum: 0,
    powerUtilizationCount: 0
  })

  return {
    totalRevenueBTC: totals.revenueBTC,
    totalRevenueUSD: totals.revenueUSD,
    totalCostUSD: totals.costUSD,
    totalProfitUSD: totals.profitUSD,
    avgCostPerMWh: safeDiv(totals.costUSD, totals.consumptionMWh),
    avgRevenuePerMWh: safeDiv(totals.revenueUSD, totals.consumptionMWh),
    totalConsumptionMWh: totals.consumptionMWh,
    avgCurtailmentRate: safeDiv(totals.curtailmentRateSum, totals.curtailmentRateCount),
    avgOperationalIssuesRate: safeDiv(totals.operationalIssuesRateSum, totals.operationalIssuesRateCount),
    avgPowerUtilization: safeDiv(totals.powerUtilizationSum, totals.powerUtilizationCount)
  }
}

module.exports = {
  getEnergyBalance,
  getProductionCosts,
  processConsumptionData,
  processTransactionData,
  processPriceData,
  extractCurrentPrice,
  processEnergyData,
  extractNominalPower,
  processCostsData,
  calculateSummary
}
