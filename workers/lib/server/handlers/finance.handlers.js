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

async function getEbitda (ctx, req) {
  const start = Number(req.query.start)
  const end = Number(req.query.end)
  const period = req.query.period || PERIOD_TYPES.MONTHLY
  const site = req.query.site

  if (!start || !end) {
    throw new Error('ERR_MISSING_START_END')
  }

  if (start >= end) {
    throw new Error('ERR_INVALID_DATE_RANGE')
  }

  const startDate = new Date(start).toISOString()
  const endDate = new Date(end).toISOString()

  const [transactionResults, tailLogResults, priceResults, currentPriceResults, productionCosts] = await runParallel([
    (cb) => requestRpcEachLimit(ctx, RPC_METHODS.GET_WRK_EXT_DATA, {
      type: WORKER_TYPES.MINERPOOL,
      query: { key: MINERPOOL_EXT_DATA_KEYS.TRANSACTIONS, start, end }
    }).then(r => cb(null, r)).catch(cb),

    (cb) => requestRpcEachLimit(ctx, RPC_METHODS.TAIL_LOG_RANGE_AGGR, {
      keys: [
        {
          type: WORKER_TYPES.POWERMETER,
          startDate,
          endDate,
          fields: { [AGGR_FIELDS.SITE_POWER]: 1 },
          shouldReturnDailyData: 1
        },
        {
          type: WORKER_TYPES.MINER,
          startDate,
          endDate,
          fields: { [AGGR_FIELDS.HASHRATE_SUM]: 1 },
          shouldReturnDailyData: 1
        }
      ]
    }).then(r => cb(null, r)).catch(cb),

    (cb) => requestRpcEachLimit(ctx, RPC_METHODS.GET_WRK_EXT_DATA, {
      type: WORKER_TYPES.MEMPOOL,
      query: { key: 'prices', start, end }
    }).then(r => cb(null, r)).catch(cb),

    (cb) => requestRpcEachLimit(ctx, RPC_METHODS.GET_WRK_EXT_DATA, {
      type: WORKER_TYPES.MEMPOOL,
      query: { key: 'current_price' }
    }).then(r => cb(null, r)).catch(cb),

    (cb) => getProductionCosts(ctx, site, start, end)
      .then(r => cb(null, r)).catch(cb)
  ])

  const dailyTransactions = processTransactionData(transactionResults)
  const dailyTailLog = processTailLogData(tailLogResults)
  const dailyPrices = processPriceData(priceResults)
  const currentBtcPrice = extractCurrentPrice(currentPriceResults)
  const costsByMonth = processCostsData(productionCosts)

  const allDays = new Set([
    ...Object.keys(dailyTransactions),
    ...Object.keys(dailyTailLog)
  ])

  const log = []
  for (const dayTs of [...allDays].sort()) {
    const ts = Number(dayTs)
    const transactions = dailyTransactions[dayTs] || {}
    const tailLog = dailyTailLog[dayTs] || {}
    const btcPrice = dailyPrices[dayTs] || currentBtcPrice || 0

    const revenueBTC = transactions.revenueBTC || 0
    const revenueUSD = revenueBTC * btcPrice
    const powerW = tailLog.powerW || 0
    const hashrateMhs = tailLog.hashrateMhs || 0
    const powerMWh = (powerW * 24) / 1000000

    const monthKey = `${new Date(ts).getFullYear()}-${String(new Date(ts).getMonth() + 1).padStart(2, '0')}`
    const costs = costsByMonth[monthKey] || {}
    const energyCostsUSD = costs.energyCostPerDay || 0
    const operationalCostsUSD = costs.operationalCostPerDay || 0
    const totalCostsUSD = energyCostsUSD + operationalCostsUSD

    const ebitdaSelling = revenueUSD - totalCostsUSD
    const ebitdaHodl = (revenueBTC * currentBtcPrice) - totalCostsUSD
    const btcProductionCost = safeDiv(totalCostsUSD, revenueBTC)

    log.push({
      ts,
      revenueBTC,
      revenueUSD,
      btcPrice,
      powerW,
      hashrateMhs,
      consumptionMWh: powerMWh,
      energyCostsUSD,
      operationalCostsUSD,
      totalCostsUSD,
      ebitdaSelling,
      ebitdaHodl,
      btcProductionCost
    })
  }

  const aggregated = aggregateByPeriod(log, period)
  const summary = calculateEbitdaSummary(aggregated, currentBtcPrice)

  return { log: aggregated, summary }
}

function processTailLogData (results) {
  const daily = {}
  for (const res of results) {
    if (res.error || !res) continue
    const data = Array.isArray(res) ? res : (res.data || res.result || [])
    if (!Array.isArray(data)) continue
    for (const entry of data) {
      if (!entry) continue
      const items = entry.data || entry.items || entry
      if (typeof items === 'object' && !Array.isArray(items)) {
        for (const [key, val] of Object.entries(items)) {
          const ts = getStartOfDay(Number(key))
          if (!daily[ts]) daily[ts] = { powerW: 0, hashrateMhs: 0 }
          if (typeof val === 'object') {
            daily[ts].powerW += (val[AGGR_FIELDS.SITE_POWER] || 0)
            daily[ts].hashrateMhs += (val[AGGR_FIELDS.HASHRATE_SUM] || 0)
          }
        }
      } else if (Array.isArray(items)) {
        for (const item of items) {
          const ts = getStartOfDay(item.ts || item.timestamp)
          if (!daily[ts]) daily[ts] = { powerW: 0, hashrateMhs: 0 }
          daily[ts].powerW += (item[AGGR_FIELDS.SITE_POWER] || 0)
          daily[ts].hashrateMhs += (item[AGGR_FIELDS.HASHRATE_SUM] || 0)
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

function calculateEbitdaSummary (log, currentBtcPrice) {
  if (!log.length) {
    return {
      totalRevenueBTC: 0,
      totalRevenueUSD: 0,
      totalCostsUSD: 0,
      totalEbitdaSelling: 0,
      totalEbitdaHodl: 0,
      avgBtcProductionCost: null,
      currentBtcPrice: currentBtcPrice || 0
    }
  }

  const totals = log.reduce((acc, entry) => {
    acc.revenueBTC += entry.revenueBTC || 0
    acc.revenueUSD += entry.revenueUSD || 0
    acc.costsUSD += entry.totalCostsUSD || 0
    acc.ebitdaSelling += entry.ebitdaSelling || 0
    acc.ebitdaHodl += entry.ebitdaHodl || 0
    return acc
  }, { revenueBTC: 0, revenueUSD: 0, costsUSD: 0, ebitdaSelling: 0, ebitdaHodl: 0 })

  return {
    totalRevenueBTC: totals.revenueBTC,
    totalRevenueUSD: totals.revenueUSD,
    totalCostsUSD: totals.costsUSD,
    totalEbitdaSelling: totals.ebitdaSelling,
    totalEbitdaHodl: totals.ebitdaHodl,
    avgBtcProductionCost: safeDiv(totals.costsUSD, totals.revenueBTC),
    currentBtcPrice: currentBtcPrice || 0
  }
}

module.exports = {
  getEbitda,
  processTailLogData,
  processTransactionData,
  processPriceData,
  extractCurrentPrice,
  getProductionCosts,
  processCostsData,
  calculateEbitdaSummary
}
