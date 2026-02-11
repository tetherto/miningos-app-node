'use strict'

const mingo = require('mingo')
const {
  RPC_METHODS,
  MINERPOOL_EXT_DATA_KEYS
} = require('../../constants')
const {
  requestRpcMapLimit,
  parseJsonQueryParam,
  runParallel
} = require('../../utils')

async function getPools (ctx, req) {
  const filter = req.query.filter ? parseJsonQueryParam(req.query.filter, 'ERR_FILTER_INVALID_JSON') : null
  const sort = req.query.sort ? parseJsonQueryParam(req.query.sort, 'ERR_SORT_INVALID_JSON') : null
  const fields = req.query.fields ? parseJsonQueryParam(req.query.fields, 'ERR_FIELDS_INVALID_JSON') : null

  const [deviceResults, statsResults] = await runParallel([
    (cb) => requestRpcMapLimit(ctx, RPC_METHODS.LIST_THINGS, {
      query: { tags: { $in: ['t-minerpool'] } },
      status: 1
    }).then(r => cb(null, r)).catch(cb),

    (cb) => requestRpcMapLimit(ctx, RPC_METHODS.GET_WRK_EXT_DATA, {
      type: 'minerpool',
      query: { key: MINERPOOL_EXT_DATA_KEYS.STATS }
    }).then(r => cb(null, r)).catch(cb)
  ])

  const devices = flattenResults(deviceResults)
  const stats = flattenStatsResults(statsResults)

  const pools = mergePoolData(devices, stats)

  let result = pools
  if (filter) {
    const query = new mingo.Query(filter)
    result = query.find(result).all()
  }

  if (sort) {
    const sortKeys = Object.entries(sort)
    result.sort((a, b) => {
      for (const [key, dir] of sortKeys) {
        const aVal = a[key] || 0
        const bVal = b[key] || 0
        if (aVal !== bVal) return dir > 0 ? aVal - bVal : bVal - aVal
      }
      return 0
    })
  }

  if (fields) {
    result = result.map(pool => {
      const filtered = {}
      for (const key of Object.keys(fields)) {
        if (fields[key] && pool[key] !== undefined) {
          filtered[key] = pool[key]
        }
      }
      return filtered
    })
  }

  const summary = calculatePoolsSummary(pools)

  return { pools: result, summary }
}

function flattenResults (results) {
  const flat = []
  if (!Array.isArray(results)) return flat
  for (const orkResult of results) {
    if (!orkResult || orkResult.error) continue
    const items = Array.isArray(orkResult) ? orkResult : (orkResult.data || orkResult.result || [])
    if (Array.isArray(items)) {
      flat.push(...items)
    }
  }
  return flat
}

function flattenStatsResults (results) {
  const statsMap = {}
  if (!Array.isArray(results)) return statsMap
  for (const orkResult of results) {
    if (!orkResult || orkResult.error) continue
    const items = Array.isArray(orkResult) ? orkResult : (orkResult.data || orkResult.result || [])
    if (Array.isArray(items)) {
      for (const item of items) {
        if (!item) continue
        const entries = item.data || item.stats || item
        if (typeof entries === 'object' && !Array.isArray(entries)) {
          for (const [poolId, stat] of Object.entries(entries)) {
            statsMap[poolId] = stat
          }
        }
      }
    }
  }
  return statsMap
}

function mergePoolData (devices, stats) {
  return devices.map(device => {
    const poolId = device.id || device.tag || device.name
    const stat = stats[poolId] || {}

    return {
      id: poolId,
      name: device.name || poolId,
      tag: device.tag,
      status: device.status,
      url: device.url || stat.url,
      hashrate: stat.hashrate || 0,
      workerCount: stat.worker_count || stat.workerCount || 0,
      balance: stat.balance || 0,
      lastUpdated: stat.lastUpdated || stat.last_updated || null,
      ...device,
      ...stat
    }
  })
}

function calculatePoolsSummary (pools) {
  const totals = pools.reduce((acc, pool) => {
    acc.totalHashrate += pool.hashrate || 0
    acc.totalWorkers += pool.workerCount || pool.worker_count || 0
    acc.totalBalance += pool.balance || 0
    return acc
  }, { totalHashrate: 0, totalWorkers: 0, totalBalance: 0 })

  return {
    poolCount: pools.length,
    ...totals
  }
}

module.exports = {
  getPools,
  flattenResults,
  flattenStatsResults,
  mergePoolData,
  calculatePoolsSummary
}
