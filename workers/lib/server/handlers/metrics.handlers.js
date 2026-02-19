'use strict'

const {
  WORKER_TYPES,
  AGGR_FIELDS,
  RPC_METHODS
} = require('../../constants')
const {
  requestRpcEachLimit,
  getStartOfDay,
  safeDiv
} = require('../../utils')

// ==================== Hashrate ====================

async function getHashrate (ctx, req) {
  const start = Number(req.query.start)
  const end = Number(req.query.end)

  if (!start || !end) {
    throw new Error('ERR_MISSING_START_END')
  }

  if (start >= end) {
    throw new Error('ERR_INVALID_DATE_RANGE')
  }

  const startDate = new Date(start).toISOString()
  const endDate = new Date(end).toISOString()

  const results = await requestRpcEachLimit(ctx, RPC_METHODS.TAIL_LOG_RANGE_AGGR, {
    keys: [{
      type: WORKER_TYPES.MINER,
      startDate,
      endDate,
      fields: { [AGGR_FIELDS.HASHRATE_SUM]: 1 },
      shouldReturnDailyData: 1
    }]
  })

  const daily = processHashrateData(results)
  const log = Object.keys(daily).sort().map(dayTs => ({
    ts: Number(dayTs),
    hashrateMhs: daily[dayTs]
  }))

  const summary = calculateHashrateSummary(log)

  return { log, summary }
}

function processHashrateData (results) {
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
          const val = item.val || item
          daily[ts] = (daily[ts] || 0) + (val[AGGR_FIELDS.HASHRATE_SUM] || 0)
        }
      } else if (typeof items === 'object') {
        for (const [key, val] of Object.entries(items)) {
          const ts = getStartOfDay(Number(key))
          if (!ts) continue
          const hashrate = typeof val === 'object' ? (val[AGGR_FIELDS.HASHRATE_SUM] || 0) : (Number(val) || 0)
          daily[ts] = (daily[ts] || 0) + hashrate
        }
      }
    }
  }
  return daily
}

function calculateHashrateSummary (log) {
  if (!log.length) {
    return {
      avgHashrateMhs: null,
      totalHashrateMhs: 0
    }
  }

  const total = log.reduce((sum, entry) => sum + (entry.hashrateMhs || 0), 0)

  return {
    avgHashrateMhs: safeDiv(total, log.length),
    totalHashrateMhs: total
  }
}

// ==================== Consumption ====================

async function getConsumption (ctx, req) {
  const start = Number(req.query.start)
  const end = Number(req.query.end)

  if (!start || !end) {
    throw new Error('ERR_MISSING_START_END')
  }

  if (start >= end) {
    throw new Error('ERR_INVALID_DATE_RANGE')
  }

  const startDate = new Date(start).toISOString()
  const endDate = new Date(end).toISOString()

  const results = await requestRpcEachLimit(ctx, RPC_METHODS.TAIL_LOG_RANGE_AGGR, {
    keys: [{
      type: WORKER_TYPES.POWERMETER,
      startDate,
      endDate,
      fields: { [AGGR_FIELDS.SITE_POWER]: 1 },
      shouldReturnDailyData: 1
    }]
  })

  const daily = processConsumptionData(results)
  const log = Object.keys(daily).sort().map(dayTs => {
    const powerW = daily[dayTs]
    return {
      ts: Number(dayTs),
      powerW,
      consumptionMWh: (powerW * 24) / 1000000
    }
  })

  const summary = calculateConsumptionSummary(log)

  return { log, summary }
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
          const val = item.val || item
          daily[ts] = (daily[ts] || 0) + (val[AGGR_FIELDS.SITE_POWER] || val.site_power_w || 0)
        }
      } else if (typeof items === 'object') {
        for (const [key, val] of Object.entries(items)) {
          const ts = getStartOfDay(Number(key))
          if (!ts) continue
          const power = typeof val === 'object' ? (val[AGGR_FIELDS.SITE_POWER] || val.site_power_w || 0) : (Number(val) || 0)
          daily[ts] = (daily[ts] || 0) + power
        }
      }
    }
  }
  return daily
}

function calculateConsumptionSummary (log) {
  if (!log.length) {
    return {
      avgPowerW: null,
      totalConsumptionMWh: 0
    }
  }

  const totalPower = log.reduce((sum, entry) => sum + (entry.powerW || 0), 0)
  const totalConsumption = log.reduce((sum, entry) => sum + (entry.consumptionMWh || 0), 0)

  return {
    avgPowerW: safeDiv(totalPower, log.length),
    totalConsumptionMWh: totalConsumption
  }
}

module.exports = {
  getHashrate,
  processHashrateData,
  calculateHashrateSummary,
  getConsumption,
  processConsumptionData,
  calculateConsumptionSummary
}
