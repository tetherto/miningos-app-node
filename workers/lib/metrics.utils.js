'use strict'

const { getStartOfDay } = require('./period.utils')
const { METRICS_TIME, LOG_KEYS } = require('./constants')

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
  if (!entry) return
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
 * Extract container name from a device key.
 * Strips the last dash-separated segment (assumed to be position/index).
 * e.g. "bitdeer-9a-miner1" -> "bitdeer-9a"
 * NOTE: This is a heuristic based on naming convention in power_mode_group_aggr data.
 * Device keys are identifiers from aggregated data, not auto-generated IDs.
 */
function extractContainerFromMinerKey (deviceKey) {
  const lastDash = deviceKey.lastIndexOf('-')
  return lastDash > 0 ? deviceKey.slice(0, lastDash) : deviceKey
}

function resolveInterval (start, end, requested) {
  if (requested) return requested
  const range = end - start
  if (range <= METRICS_TIME.TWO_DAYS_MS) return '1h'
  if (range <= METRICS_TIME.NINETY_DAYS_MS) return '1d'
  return '1w'
}

function getIntervalConfig (interval) {
  switch (interval) {
    case '1h':
      return { key: LOG_KEYS.STAT_3H, groupRange: null }
    case '1w':
      return { key: LOG_KEYS.STAT_3H, groupRange: '1W' }
    case '1d':
    default:
      return { key: LOG_KEYS.STAT_3H, groupRange: '1D' }
  }
}

module.exports = {
  parseEntryTs,
  validateStartEnd,
  iterateRpcEntries,
  forEachRangeAggrItem,
  sumObjectValues,
  extractContainerFromMinerKey,
  resolveInterval,
  getIntervalConfig
}
