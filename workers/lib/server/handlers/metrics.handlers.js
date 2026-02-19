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

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000
const NINETY_DAYS_MS = 90 * 24 * 60 * 60 * 1000
const THREE_HOURS_MS = 3 * 60 * 60 * 1000
const ONE_MONTH_MS = 30 * 24 * 60 * 60 * 1000
const DEFAULT_TIMELINE_LIMIT = 10080

// ==================== Shared Utilities ====================

/**
 * Parse timestamp from RPC entry.
 * With groupRange, ts may be a range string like "1770854400000-1771459199999".
 * Extracts the start of the range in that case.
 */
function parseEntryTs (ts) {
  if (typeof ts === 'number') return ts
  if (typeof ts === 'string') {
    const dashIdx = ts.indexOf('-')
    if (dashIdx > 0) return Number(ts.slice(0, dashIdx))
    return Number(ts)
  }
  return null
}

function validateStartEnd (req) {
  const start = Number(req.query.start)
  const end = Number(req.query.end)

  if (!start || !end) {
    throw new Error('ERR_MISSING_START_END')
  }

  if (start >= end) {
    throw new Error('ERR_INVALID_DATE_RANGE')
  }

  return { start, end }
}

function * iterateRpcEntries (results) {
  for (const res of results) {
    if (!res || res.error) continue
    const data = Array.isArray(res) ? res : (res.data || res.result || [])
    if (!Array.isArray(data)) continue
    for (const entry of data) {
      if (!entry || entry.error) continue
      yield entry
    }
  }
}

function forEachRangeAggrItem (entry, callback) {
  const items = entry.data || entry.items || entry
  if (Array.isArray(items)) {
    for (const item of items) {
      const ts = getStartOfDay(parseEntryTs(item.ts || item.timestamp))
      if (!ts) continue
      callback(ts, item.val || item)
    }
  } else if (typeof items === 'object') {
    for (const [key, val] of Object.entries(items)) {
      const ts = getStartOfDay(parseEntryTs(Number(key)))
      if (!ts) continue
      callback(ts, val)
    }
  }
}

function sumObjectValues (obj) {
  if (!obj || typeof obj !== 'object') return 0
  return Object.values(obj).reduce((sum, val) => sum + (Number(val) || 0), 0)
}

/**
 * Extract container name from miner ID.
 * Strips the last dash-separated segment (assumed to be position/index).
 * e.g. "bitdeer-9a-miner1" -> "bitdeer-9a"
 * NOTE: Unverified against real power_mode_group_aggr data.
 */
function extractContainerFromMinerId (minerId) {
  const lastDash = minerId.lastIndexOf('-')
  return lastDash > 0 ? minerId.slice(0, lastDash) : minerId
}

// ==================== Shared Interval Utils ====================

function resolveInterval (start, end, requested) {
  if (requested) return requested
  const range = end - start
  if (range <= TWO_DAYS_MS) return '1h'
  if (range <= NINETY_DAYS_MS) return '1d'
  return '1w'
}

function getIntervalConfig (interval) {
  switch (interval) {
    case '1h':
      return { key: 'stat-3h', groupRange: null, divisorMs: THREE_HOURS_MS }
    case '1d':
      return { key: 'stat-3h', groupRange: '1D', divisorMs: 24 * 60 * 60 * 1000 }
    case '1w':
      return { key: 'stat-3h', groupRange: '1W', divisorMs: 7 * 24 * 60 * 60 * 1000 }
    default:
      return { key: 'stat-3h', groupRange: '1D', divisorMs: 24 * 60 * 60 * 1000 }
  }
}

// ==================== Hashrate ====================

async function getHashrate (ctx, req) {
  const { start, end } = validateStartEnd(req)

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
  for (const entry of iterateRpcEntries(results)) {
    forEachRangeAggrItem(entry, (ts, val) => {
      const v = typeof val === 'object' ? (val[AGGR_FIELDS.HASHRATE_SUM] || 0) : (Number(val) || 0)
      daily[ts] = (daily[ts] || 0) + v
    })
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
  const { start, end } = validateStartEnd(req)

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
  for (const entry of iterateRpcEntries(results)) {
    forEachRangeAggrItem(entry, (ts, val) => {
      const v = typeof val === 'object' ? (val[AGGR_FIELDS.SITE_POWER] || 0) : (Number(val) || 0)
      daily[ts] = (daily[ts] || 0) + v
    })
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

// ==================== Efficiency ====================

async function getEfficiency (ctx, req) {
  const { start, end } = validateStartEnd(req)

  const startDate = new Date(start).toISOString()
  const endDate = new Date(end).toISOString()

  const results = await requestRpcEachLimit(ctx, RPC_METHODS.TAIL_LOG_RANGE_AGGR, {
    keys: [{
      type: WORKER_TYPES.MINER,
      startDate,
      endDate,
      fields: { [AGGR_FIELDS.EFFICIENCY]: 1 },
      shouldReturnDailyData: 1
    }]
  })

  const daily = processEfficiencyData(results)
  const log = Object.keys(daily).sort().map(dayTs => ({
    ts: Number(dayTs),
    efficiencyWThs: daily[dayTs].total / daily[dayTs].count
  }))

  const summary = calculateEfficiencySummary(log)

  return { log, summary }
}

function processEfficiencyData (results) {
  const daily = {}
  for (const entry of iterateRpcEntries(results)) {
    forEachRangeAggrItem(entry, (ts, val) => {
      const eff = typeof val === 'object' ? (val[AGGR_FIELDS.EFFICIENCY] || 0) : (Number(val) || 0)
      if (!eff) return
      if (!daily[ts]) daily[ts] = { total: 0, count: 0 }
      daily[ts].total += eff
      daily[ts].count += 1
    })
  }
  return daily
}

function calculateEfficiencySummary (log) {
  if (!log.length) {
    return {
      avgEfficiencyWThs: null
    }
  }

  const total = log.reduce((sum, entry) => sum + (entry.efficiencyWThs || 0), 0)

  return {
    avgEfficiencyWThs: safeDiv(total, log.length)
  }
}

// ==================== Miner Status ====================

async function getMinerStatus (ctx, req) {
  const { start, end } = validateStartEnd(req)

  const limit = Math.ceil((end - start) / THREE_HOURS_MS)

  const results = await requestRpcEachLimit(ctx, RPC_METHODS.TAIL_LOG, {
    key: 'stat-3h',
    type: WORKER_TYPES.MINER,
    tag: 't-miner',
    aggrFields: {
      [AGGR_FIELDS.TYPE_CNT]: 1,
      [AGGR_FIELDS.OFFLINE_CNT]: 1,
      [AGGR_FIELDS.SLEEP_CNT]: 1,
      [AGGR_FIELDS.MAINTENANCE_CNT]: 1
    },
    groupRange: '1D',
    shouldCalculateAvg: true,
    limit
  })

  const daily = processMinerStatusData(results)
  const log = Object.keys(daily).sort().map(dayTs => ({
    ts: Number(dayTs),
    ...daily[dayTs]
  }))

  const summary = calculateMinerStatusSummary(log)

  return { log, summary }
}

function processMinerStatusData (results) {
  const daily = {}
  for (const entry of iterateRpcEntries(results)) {
    const rawTs = parseEntryTs(entry.ts || entry.timestamp)
    const ts = rawTs ? getStartOfDay(rawTs) : null
    if (!ts) continue
    if (!daily[ts]) {
      daily[ts] = { online: 0, offline: 0, sleep: 0, maintenance: 0 }
    }

    const offlineCnt = sumObjectValues(entry[AGGR_FIELDS.OFFLINE_CNT] || entry.aggrFields?.[AGGR_FIELDS.OFFLINE_CNT])
    const sleepCnt = sumObjectValues(entry[AGGR_FIELDS.SLEEP_CNT] || entry.aggrFields?.[AGGR_FIELDS.SLEEP_CNT])
    const maintenanceCnt = sumObjectValues(entry[AGGR_FIELDS.MAINTENANCE_CNT] || entry.aggrFields?.[AGGR_FIELDS.MAINTENANCE_CNT])

    daily[ts].offline += offlineCnt
    daily[ts].sleep += sleepCnt
    daily[ts].maintenance += maintenanceCnt

    const totalCount = sumObjectValues(entry[AGGR_FIELDS.TYPE_CNT]) || entry.total_cnt || entry.count || 0
    if (totalCount > 0) {
      daily[ts].online += Math.max(0, totalCount - offlineCnt - sleepCnt - maintenanceCnt)
    }
  }
  return daily
}

function calculateMinerStatusSummary (log) {
  if (!log.length) {
    return {
      avgOnline: null,
      avgOffline: null,
      avgSleep: null,
      avgMaintenance: null
    }
  }

  const totals = log.reduce((acc, entry) => {
    acc.online += entry.online || 0
    acc.offline += entry.offline || 0
    acc.sleep += entry.sleep || 0
    acc.maintenance += entry.maintenance || 0
    return acc
  }, { online: 0, offline: 0, sleep: 0, maintenance: 0 })

  return {
    avgOnline: safeDiv(totals.online, log.length),
    avgOffline: safeDiv(totals.offline, log.length),
    avgSleep: safeDiv(totals.sleep, log.length),
    avgMaintenance: safeDiv(totals.maintenance, log.length)
  }
}

// ==================== Power Mode ====================

async function getPowerMode (ctx, req) {
  const { start, end } = validateStartEnd(req)

  const interval = resolveInterval(start, end, req.query.interval)
  const config = getIntervalConfig(interval)
  const limit = Math.ceil((end - start) / config.divisorMs)

  const rpcPayload = {
    key: config.key,
    type: WORKER_TYPES.MINER,
    tag: 't-miner',
    aggrFields: {
      [AGGR_FIELDS.POWER_MODE_GROUP]: 1,
      [AGGR_FIELDS.STATUS_GROUP]: 1
    },
    shouldCalculateAvg: true,
    limit
  }

  if (config.groupRange) {
    rpcPayload.groupRange = config.groupRange
  }

  const results = await requestRpcEachLimit(ctx, RPC_METHODS.TAIL_LOG, rpcPayload)

  const timePoints = processPowerModeData(results, config.groupRange)
  const log = Object.keys(timePoints).sort().map(ts => ({
    ts: Number(ts),
    ...timePoints[ts]
  }))

  const summary = calculatePowerModeSummary(log)

  return { log, summary }
}

function categorizeMiner (powerMode, status) {
  if (status === 'offline' || status === 'error') return status
  if (status === 'maintenance') return 'maintenance'
  if (status === 'idle' || status === 'stopped') return 'notMining'
  if (powerMode === 'low') return 'low'
  if (powerMode === 'high') return 'high'
  if (powerMode === 'sleep') return 'sleep'
  return 'normal'
}

function processPowerModeData (results, groupRange) {
  const timePoints = {}
  const emptyPoint = () => ({ low: 0, normal: 0, high: 0, sleep: 0, offline: 0, notMining: 0, maintenance: 0, error: 0 })

  for (const entry of iterateRpcEntries(results)) {
    const rawTs = parseEntryTs(entry.ts || entry.timestamp)
    const ts = groupRange && rawTs ? getStartOfDay(rawTs) : rawTs
    if (!ts) continue

    if (!timePoints[ts]) timePoints[ts] = emptyPoint()

    const powerModeObj = entry[AGGR_FIELDS.POWER_MODE_GROUP] || entry.aggrFields?.[AGGR_FIELDS.POWER_MODE_GROUP] || {}
    const statusObj = entry[AGGR_FIELDS.STATUS_GROUP] || entry.aggrFields?.[AGGR_FIELDS.STATUS_GROUP] || {}

    if (typeof powerModeObj === 'object' && powerModeObj !== null) {
      for (const [minerId, mode] of Object.entries(powerModeObj)) {
        const minerStatus = statusObj[minerId] || ''
        const category = categorizeMiner(mode, minerStatus)
        timePoints[ts][category] = (timePoints[ts][category] || 0) + 1
      }
    }
  }
  return timePoints
}

function calculatePowerModeSummary (log) {
  const categories = ['low', 'normal', 'high', 'sleep', 'offline', 'notMining', 'maintenance', 'error']
  if (!log.length) {
    const summary = {}
    for (const cat of categories) {
      summary['avg' + cat.charAt(0).toUpperCase() + cat.slice(1)] = null
    }
    return summary
  }

  const totals = {}
  for (const cat of categories) totals[cat] = 0
  for (const entry of log) {
    for (const cat of categories) {
      totals[cat] += entry[cat] || 0
    }
  }

  const summary = {}
  for (const cat of categories) {
    summary['avg' + cat.charAt(0).toUpperCase() + cat.slice(1)] = safeDiv(totals[cat], log.length)
  }
  return summary
}

// ==================== Power Mode Timeline ====================

async function getPowerModeTimeline (ctx, req) {
  const now = Date.now()
  const start = Number(req.query.start) || (now - ONE_MONTH_MS)
  const end = Number(req.query.end) || now
  const limit = Number(req.query.limit) || DEFAULT_TIMELINE_LIMIT
  const container = req.query.container || null

  if (start >= end) {
    throw new Error('ERR_INVALID_DATE_RANGE')
  }

  const rpcPayload = {
    key: 'stat-3h',
    type: WORKER_TYPES.MINER,
    tag: 't-miner',
    aggrFields: {
      [AGGR_FIELDS.POWER_MODE_GROUP]: 1,
      [AGGR_FIELDS.STATUS_GROUP]: 1
    },
    limit
  }

  const results = await requestRpcEachLimit(ctx, RPC_METHODS.TAIL_LOG, rpcPayload)

  const log = processPowerModeTimelineData(results, container)

  return { log }
}

function processPowerModeTimelineData (results, containerFilter) {
  const minerTimelines = {}

  for (const entry of iterateRpcEntries(results)) {
    const ts = parseEntryTs(entry.ts || entry.timestamp)
    if (!ts) continue

    const powerModeObj = entry[AGGR_FIELDS.POWER_MODE_GROUP] || entry.aggrFields?.[AGGR_FIELDS.POWER_MODE_GROUP] || {}
    const statusObj = entry[AGGR_FIELDS.STATUS_GROUP] || entry.aggrFields?.[AGGR_FIELDS.STATUS_GROUP] || {}

    if (typeof powerModeObj === 'object' && powerModeObj !== null) {
      for (const [minerId, powerMode] of Object.entries(powerModeObj)) {
        if (!minerTimelines[minerId]) minerTimelines[minerId] = []
        minerTimelines[minerId].push({
          ts,
          powerMode: powerMode || 'unknown',
          status: statusObj[minerId] || 'unknown'
        })
      }
    }
  }

  const log = []
  for (const [minerId, entries] of Object.entries(minerTimelines)) {
    entries.sort((a, b) => a.ts - b.ts)

    const container = extractContainerFromMinerId(minerId)

    if (containerFilter && container !== containerFilter) continue

    const segments = []
    let current = null

    for (const entry of entries) {
      if (!current || current.powerMode !== entry.powerMode || current.status !== entry.status) {
        if (current) {
          current.to = entry.ts
          segments.push(current)
        }
        current = { from: entry.ts, to: entry.ts, powerMode: entry.powerMode, status: entry.status }
      } else {
        current.to = entry.ts
      }
    }
    if (current) segments.push(current)

    log.push({ minerId, container, segments })
  }

  return log
}

// ==================== Temperature ====================

async function getTemperature (ctx, req) {
  const { start, end } = validateStartEnd(req)

  const interval = resolveInterval(start, end, req.query.interval)
  const config = getIntervalConfig(interval)
  const limit = Math.ceil((end - start) / config.divisorMs)
  const container = req.query.container || null

  const rpcPayload = {
    key: config.key,
    type: WORKER_TYPES.MINER,
    tag: 't-miner',
    aggrFields: {
      [AGGR_FIELDS.TEMP_MAX]: 1,
      [AGGR_FIELDS.TEMP_AVG]: 1
    },
    shouldCalculateAvg: true,
    limit
  }

  if (config.groupRange) {
    rpcPayload.groupRange = config.groupRange
  }

  const results = await requestRpcEachLimit(ctx, RPC_METHODS.TAIL_LOG, rpcPayload)

  const timePoints = processTemperatureData(results, config.groupRange, container)
  const log = Object.keys(timePoints).sort().map(ts => ({
    ts: Number(ts),
    ...timePoints[ts]
  }))

  const summary = calculateTemperatureSummary(log)

  return { log, summary }
}

function processTemperatureData (results, groupRange, containerFilter) {
  const timePoints = {}
  const avgCounts = {}

  for (const entry of iterateRpcEntries(results)) {
    const rawTs = parseEntryTs(entry.ts || entry.timestamp)
    const ts = groupRange && rawTs ? getStartOfDay(rawTs) : rawTs
    if (!ts) continue

    const maxObj = entry[AGGR_FIELDS.TEMP_MAX] || entry.aggrFields?.[AGGR_FIELDS.TEMP_MAX] || {}
    const avgObj = entry[AGGR_FIELDS.TEMP_AVG] || entry.aggrFields?.[AGGR_FIELDS.TEMP_AVG] || {}

    if (!timePoints[ts]) {
      timePoints[ts] = { containers: {}, siteMaxC: null, siteAvgC: null }
      avgCounts[ts] = {}
    }

    const point = timePoints[ts]

    if (typeof maxObj === 'object' && maxObj !== null) {
      for (const [name, maxVal] of Object.entries(maxObj)) {
        if (containerFilter && name !== containerFilter) continue
        const numMax = Number(maxVal) || 0
        const numAvg = Number(avgObj[name]) || 0

        if (!point.containers[name]) {
          point.containers[name] = { maxC: numMax, avgC: numAvg }
          avgCounts[ts][name] = 1
        } else {
          point.containers[name].maxC = Math.max(point.containers[name].maxC, numMax)
          const count = avgCounts[ts][name]
          point.containers[name].avgC = (point.containers[name].avgC * count + numAvg) / (count + 1)
          avgCounts[ts][name] = count + 1
        }
      }
    }

    const containerVals = Object.values(point.containers)
    if (containerVals.length) {
      point.siteMaxC = Math.max(...containerVals.map(c => c.maxC))
      const avgSum = containerVals.reduce((sum, c) => sum + c.avgC, 0)
      point.siteAvgC = safeDiv(avgSum, containerVals.length)
    }
  }
  return timePoints
}

function calculateTemperatureSummary (log) {
  if (!log.length) {
    return {
      avgMaxTemp: null,
      avgAvgTemp: null,
      peakTemp: null
    }
  }

  const maxTemps = log.filter(e => e.siteMaxC !== null).map(e => e.siteMaxC)
  const avgTemps = log.filter(e => e.siteAvgC !== null).map(e => e.siteAvgC)

  return {
    avgMaxTemp: maxTemps.length ? safeDiv(maxTemps.reduce((a, b) => a + b, 0), maxTemps.length) : null,
    avgAvgTemp: avgTemps.length ? safeDiv(avgTemps.reduce((a, b) => a + b, 0), avgTemps.length) : null,
    peakTemp: maxTemps.length ? Math.max(...maxTemps) : null
  }
}

module.exports = {
  getHashrate,
  processHashrateData,
  calculateHashrateSummary,
  getConsumption,
  processConsumptionData,
  calculateConsumptionSummary,
  getEfficiency,
  processEfficiencyData,
  calculateEfficiencySummary,
  getMinerStatus,
  processMinerStatusData,
  calculateMinerStatusSummary,
  sumObjectValues,
  parseEntryTs,
  resolveInterval,
  getIntervalConfig,
  getPowerMode,
  processPowerModeData,
  calculatePowerModeSummary,
  categorizeMiner,
  getPowerModeTimeline,
  processPowerModeTimelineData,
  getTemperature,
  processTemperatureData,
  calculateTemperatureSummary
}
