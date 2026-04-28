'use strict'

const {
  LOG_KEYS,
  WORKER_TYPES,
  WORKER_TAGS,
  AGGR_FIELDS
} = require('../../constants')
const { extractKeyEntry } = require('../../metrics.utils')
const { parseRacks } = require('../lib/queryUtils')

function sumGroupedField (grouped, racks) {
  if (!grouped || typeof grouped !== 'object') return 0
  let total = 0
  for (const id of racks) {
    total += grouped[id] || 0
  }
  return total
}

async function getGroupStats (ctx, req) {
  const racks = parseRacks(req)
  if (!racks || !racks.length) {
    throw new Error('ERR_MISSING_RACKS')
  }

  const tailLogPayload = {
    keys: [
      { key: LOG_KEYS.STAT_RTD, type: WORKER_TYPES.MINER, tag: WORKER_TAGS.MINER }
    ],
    limit: 1,
    aggrFields: {
      [AGGR_FIELDS.HASHRATE_1M_CONTAINER_GROUP_SUM]: 1,
      [AGGR_FIELDS.POWER_W_CONTAINER_GROUP_SUM]: 1,
      [AGGR_FIELDS.POWER_MODE_LOW_CNT]: 1,
      [AGGR_FIELDS.POWER_MODE_NORMAL_CNT]: 1,
      [AGGR_FIELDS.POWER_MODE_HIGH_CNT]: 1,
      [AGGR_FIELDS.OFFLINE_CNT]: 1,
      [AGGR_FIELDS.ERROR_CNT]: 1,
      [AGGR_FIELDS.NOT_MINING_CNT]: 1,
      [AGGR_FIELDS.SLEEP_CNT]: 1
    }
  }

  const results = await ctx.dataProxy.requestDataMap('tailLogMulti', tailLogPayload)
  return composeGroupStats(results, racks)
}

function composeGroupStats (results, racks) {
  let hashrateMhs = 0
  let powerW = 0
  let onlineCount = 0
  let minerCount = 0

  for (const orkResult of results) {
    const minerEntry = extractKeyEntry(orkResult, 0)
    if (!minerEntry) continue

    hashrateMhs += sumGroupedField(minerEntry[AGGR_FIELDS.HASHRATE_1M_CONTAINER_GROUP_SUM], racks)
    powerW += sumGroupedField(minerEntry[AGGR_FIELDS.POWER_W_CONTAINER_GROUP_SUM], racks)

    const low = sumGroupedField(minerEntry[AGGR_FIELDS.POWER_MODE_LOW_CNT], racks)
    const normal = sumGroupedField(minerEntry[AGGR_FIELDS.POWER_MODE_NORMAL_CNT], racks)
    const high = sumGroupedField(minerEntry[AGGR_FIELDS.POWER_MODE_HIGH_CNT], racks)
    const offline = sumGroupedField(minerEntry[AGGR_FIELDS.OFFLINE_CNT], racks)
    const error = sumGroupedField(minerEntry[AGGR_FIELDS.ERROR_CNT], racks)
    const notMining = sumGroupedField(minerEntry[AGGR_FIELDS.NOT_MINING_CNT], racks)
    const sleep = sumGroupedField(minerEntry[AGGR_FIELDS.SLEEP_CNT], racks)

    onlineCount += low + normal + high
    minerCount += low + normal + high + offline + error + notMining + sleep
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
  sumGroupedField
}
