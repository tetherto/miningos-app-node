'use strict'

const {
  LOG_KEYS,
  WORKER_TYPES,
  WORKER_TAGS
} = require('../../constants')

function parseContainers (req) {
  const raw = req.query.containers
  if (!raw) return undefined
  return raw.split(',').map(c => c.trim()).filter(Boolean)
}

function sumGroupedField (grouped, containers) {
  if (!grouped || typeof grouped !== 'object') return 0
  let total = 0
  for (const id of containers) {
    total += grouped[id] || 0
  }
  return total
}

async function getGroupStats (ctx, req) {
  const containers = parseContainers(req)
  if (!containers || !containers.length) {
    throw new Error('ERR_MISSING_CONTAINERS')
  }

  const tailLogPayload = {
    keys: [
      { key: LOG_KEYS.STAT_RTD, type: WORKER_TYPES.MINER, tag: WORKER_TAGS.MINER }
    ],
    limit: 1,
    aggrFields: {
      hashrate_mhs_1m_container_group_sum_aggr: 1,
      power_w_container_group_sum_aggr: 1,
      power_mode_low_cnt: 1,
      power_mode_normal_cnt: 1,
      power_mode_high_cnt: 1,
      offline_cnt: 1,
      error_cnt: 1,
      not_mining_cnt: 1,
      power_mode_sleep_cnt: 1
    }
  }

  const results = await ctx.dataProxy.requestDataMap('tailLogMulti', tailLogPayload)
  return composeGroupStats(results, containers)
}

function composeGroupStats (results, containers) {
  let hashrateMhs = 0
  let powerW = 0
  let onlineCount = 0
  let minerCount = 0

  for (const orkResult of results) {
    const minerEntry = extractKeyEntry(orkResult, 0)
    if (!minerEntry) continue

    hashrateMhs += sumGroupedField(minerEntry.hashrate_mhs_1m_container_group_sum_aggr, containers)
    powerW += sumGroupedField(minerEntry.power_w_container_group_sum_aggr, containers)

    const low = sumGroupedField(minerEntry.power_mode_low_cnt, containers)
    const normal = sumGroupedField(minerEntry.power_mode_normal_cnt, containers)
    const high = sumGroupedField(minerEntry.power_mode_high_cnt, containers)
    const offline = sumGroupedField(minerEntry.offline_cnt, containers)
    const error = sumGroupedField(minerEntry.error_cnt, containers)
    const notMining = sumGroupedField(minerEntry.not_mining_cnt, containers)
    const sleep = sumGroupedField(minerEntry.power_mode_sleep_cnt, containers)

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

function extractKeyEntry (orkResult, keyIndex) {
  if (!Array.isArray(orkResult)) return null
  const keyResult = orkResult[keyIndex]
  if (!Array.isArray(keyResult) || keyResult.length === 0) return null
  return keyResult[0] || null
}

module.exports = {
  getGroupStats,
  composeGroupStats,
  extractKeyEntry,
  sumGroupedField
}
