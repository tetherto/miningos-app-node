'use strict'

const {
  WORKER_TYPES,
  AGGR_FIELDS,
  PERIOD_TYPES,
  RPC_METHODS,
  GLOBAL_DATA_TYPES
} = require('../../constants')
const {
  requestRpcEachLimit,
  getStartOfDay,
  safeDiv,
  runParallel
} = require('../../utils')
const { aggregateByPeriod } = require('../../period.utils')

async function getCostSummary (ctx, req) {
  const start = Number(req.query.start)
  const end = Number(req.query.end)
  const period = req.query.period || PERIOD_TYPES.MONTHLY

  if (!start || !end) {
    throw new Error('ERR_MISSING_START_END')
  }

  if (start >= end) {
    throw new Error('ERR_INVALID_DATE_RANGE')
  }

  const startDate = new Date(start).toISOString()
  const endDate = new Date(end).toISOString()

  const [productionCosts, priceResults, consumptionResults] = await runParallel([
    (cb) => getProductionCosts(ctx, null, start, end)
      .then(r => cb(null, r)).catch(cb),

    (cb) => requestRpcEachLimit(ctx, RPC_METHODS.GET_WRK_EXT_DATA, {
      type: WORKER_TYPES.MEMPOOL,
      query: { key: 'prices', start, end }
    }).then(r => cb(null, r)).catch(cb),

    (cb) => requestRpcEachLimit(ctx, RPC_METHODS.TAIL_LOG_RANGE_AGGR, {
      keys: [{
        type: WORKER_TYPES.POWERMETER,
        startDate,
        endDate,
        fields: { [AGGR_FIELDS.SITE_POWER]: 1 },
        shouldReturnDailyData: 1
      }]
    }).then(r => cb(null, r)).catch(cb)
  ])

  const costsByMonth = processCostsData(productionCosts)
  const dailyPrices = processPriceData(priceResults)
  const dailyConsumption = processConsumptionData(consumptionResults)

  const allDays = new Set([
    ...Object.keys(dailyConsumption),
    ...Object.keys(dailyPrices)
  ])

  const log = []
  for (const dayTs of [...allDays].sort()) {
    const ts = Number(dayTs)
    const consumption = dailyConsumption[dayTs] || {}
    const btcPrice = dailyPrices[dayTs] || 0

    const powerW = consumption.powerW || 0
    const consumptionMWh = (powerW * 24) / 1000000

    const monthKey = `${new Date(ts).getFullYear()}-${String(new Date(ts).getMonth() + 1).padStart(2, '0')}`
    const costs = costsByMonth[monthKey] || {}
    const energyCostsUSD = costs.energyCostPerDay || 0
    const operationalCostsUSD = costs.operationalCostPerDay || 0
    const totalCostsUSD = energyCostsUSD + operationalCostsUSD

    log.push({
      ts,
      consumptionMWh,
      energyCostsUSD,
      operationalCostsUSD,
      totalCostsUSD,
      allInCostPerMWh: safeDiv(totalCostsUSD, consumptionMWh),
      energyCostPerMWh: safeDiv(energyCostsUSD, consumptionMWh),
      btcPrice
    })
  }

  const aggregated = aggregateByPeriod(log, period)
  const summary = calculateCostSummary(aggregated)

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

function calculateCostSummary (log) {
  if (!log.length) {
    return {
      totalEnergyCostsUSD: 0,
      totalOperationalCostsUSD: 0,
      totalCostsUSD: 0,
      totalConsumptionMWh: 0,
      avgAllInCostPerMWh: null,
      avgEnergyCostPerMWh: null,
      avgBtcPrice: null
    }
  }

  const totals = log.reduce((acc, entry) => {
    acc.energyCosts += entry.energyCostsUSD || 0
    acc.operationalCosts += entry.operationalCostsUSD || 0
    acc.totalCosts += entry.totalCostsUSD || 0
    acc.consumption += entry.consumptionMWh || 0
    acc.btcPriceSum += entry.btcPrice || 0
    acc.btcPriceCount += entry.btcPrice ? 1 : 0
    return acc
  }, { energyCosts: 0, operationalCosts: 0, totalCosts: 0, consumption: 0, btcPriceSum: 0, btcPriceCount: 0 })

  return {
    totalEnergyCostsUSD: totals.energyCosts,
    totalOperationalCostsUSD: totals.operationalCosts,
    totalCostsUSD: totals.totalCosts,
    totalConsumptionMWh: totals.consumption,
    avgAllInCostPerMWh: safeDiv(totals.totalCosts, totals.consumption),
    avgEnergyCostPerMWh: safeDiv(totals.energyCosts, totals.consumption),
    avgBtcPrice: safeDiv(totals.btcPriceSum, totals.btcPriceCount)
  }
}

module.exports = {
  getCostSummary,
  processConsumptionData,
  processPriceData,
  getProductionCosts,
  processCostsData,
  calculateCostSummary
}
