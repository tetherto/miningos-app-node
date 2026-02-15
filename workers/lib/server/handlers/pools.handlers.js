'use strict'

const mingo = require('mingo')
const {
  RPC_METHODS,
  MINERPOOL_EXT_DATA_KEYS
} = require('../../constants')
const {
  requestRpcMapLimit,
  parseJsonQueryParam
} = require('../../utils')

async function getPools (ctx, req) {
  const filter = req.query.query ? parseJsonQueryParam(req.query.query, 'ERR_QUERY_INVALID_JSON') : null
  const sort = req.query.sort ? parseJsonQueryParam(req.query.sort, 'ERR_SORT_INVALID_JSON') : null
  const fields = req.query.fields ? parseJsonQueryParam(req.query.fields, 'ERR_FIELDS_INVALID_JSON') : null

  const statsResults = await requestRpcMapLimit(ctx, RPC_METHODS.GET_WRK_EXT_DATA, {
    type: 'minerpool',
    query: { key: MINERPOOL_EXT_DATA_KEYS.STATS }
  })

  const pools = flattenPoolStats(statsResults)

  const query = new mingo.Query(filter || {})
  let cursor = query.find(pools, fields || {})
  if (sort) cursor = cursor.sort(sort)
  const result = cursor.all()

  const summary = calculatePoolsSummary(pools)

  return { pools: result, summary }
}

function flattenPoolStats (results) {
  const pools = []
  const seen = new Set()
  if (!Array.isArray(results)) return pools

  for (const orkResult of results) {
    if (!orkResult || orkResult.error) continue
    const items = Array.isArray(orkResult) ? orkResult : (orkResult.data || orkResult.result || [])
    if (!Array.isArray(items)) continue

    for (const item of items) {
      if (!item) continue
      const stats = item.stats || item.data || []
      if (!Array.isArray(stats)) continue

      for (const stat of stats) {
        if (!stat) continue
        const poolKey = `${stat.poolType}:${stat.username}`
        if (seen.has(poolKey)) continue
        seen.add(poolKey)

        pools.push({
          name: stat.username || stat.poolType,
          pool: stat.poolType,
          account: stat.username,
          status: 'active',
          hashrate: stat.hashrate || 0,
          hashrate1h: stat.hashrate_1h || 0,
          hashrate24h: stat.hashrate_24h || 0,
          workerCount: stat.worker_count || 0,
          activeWorkerCount: stat.active_workers_count || 0,
          balance: stat.balance || 0,
          unsettled: stat.unsettled || 0,
          revenue24h: stat.revenue_24h || stat.estimated_today_income || 0,
          yearlyBalances: stat.yearlyBalances || [],
          lastUpdated: stat.timestamp || null
        })
      }
    }
  }

  return pools
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
  flattenPoolStats,
  calculatePoolsSummary
}
