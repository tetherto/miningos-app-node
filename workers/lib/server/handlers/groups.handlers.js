'use strict'

const {
  LOG_KEYS,
  WORKER_TYPES,
  WORKER_TAGS,
  AGGR_FIELDS
} = require('../../constants')
const { parseRacks } = require('./metrics.handlers')

async function getGroupStats (ctx, req) {
  const racks = parseRacks(req)
  if (!racks || !racks.length) {
    throw new Error('ERR_MISSING_RACKS')
  }

  const tailLogPayload = {
    keys: [
      { key: LOG_KEYS.STAT_RTD, type: WORKER_TYPES.MINER, tag: WORKER_TAGS.MINER },
      { key: LOG_KEYS.STAT_RTD, type: WORKER_TYPES.POWERMETER, tag: WORKER_TAGS.POWERMETER }
    ],
    limit: 1,
    racks,
    aggrFields: {
      hashrate_mhs_1m_sum_aggr: 1,
      online_or_minor_error_miners_amount_aggr: 1,
      hashrate_mhs_1m_cnt_aggr: 1,
      [AGGR_FIELDS.SITE_POWER]: 1
    }
  }

  const results = await ctx.dataProxy.requestDataMap('tailLogMulti', tailLogPayload)

  return composeGroupStats(results)
}

function extractKeyEntry (orkResult, keyIndex) {
  if (!Array.isArray(orkResult)) return null
  const keyResult = orkResult[keyIndex]
  if (!Array.isArray(keyResult) || keyResult.length === 0) return null
  return keyResult[0] || null
}

function composeGroupStats (results) {
  let hashrateMhs = 0
  let powerW = 0
  let minerCount = 0
  let onlineCount = 0

  for (const orkResult of results) {
    const minerEntry = extractKeyEntry(orkResult, 0)
    if (minerEntry) {
      hashrateMhs += minerEntry.hashrate_mhs_1m_sum_aggr || 0
      onlineCount += minerEntry.online_or_minor_error_miners_amount_aggr || 0
      minerCount += minerEntry.hashrate_mhs_1m_cnt_aggr || 0
    }

    const powerEntry = extractKeyEntry(orkResult, 1)
    if (powerEntry) {
      powerW += powerEntry[AGGR_FIELDS.SITE_POWER] || 0
    }
  }

  const hashrateThs = hashrateMhs / 1000000
  const efficiency = hashrateThs > 0
    ? Math.round((powerW / hashrateThs) * 10) / 10
    : 0

  return {
    efficiency,
    hashrateMhs,
    powerW,
    minerCount,
    onlineCount
  }
}

module.exports = {
  getGroupStats,
  composeGroupStats,
  extractKeyEntry
}
