'use strict'

const mingo = require('mingo')
const {
  RPC_METHODS,
  MINERPOOL_EXT_DATA_KEYS,
  RANGE_BUCKETS
} = require('../../constants')
const {
  requestRpcMapLimit,
  requestRpcEachLimit,
  parseJsonQueryParam,
  getStartOfDay
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

async function getPoolBalanceHistory (ctx, req) {
  const start = Number(req.query.start)
  const end = Number(req.query.end)
  const range = req.query.range || '1D'
  const poolParam = req.params.pool || null
  const poolFilter = poolParam === 'all' ? null : poolParam

  if (!start || !end) {
    throw new Error('ERR_MISSING_START_END')
  }

  if (start >= end) {
    throw new Error('ERR_INVALID_DATE_RANGE')
  }

  const results = await requestRpcEachLimit(ctx, RPC_METHODS.GET_WRK_EXT_DATA, {
    type: 'minerpool',
    query: { key: MINERPOOL_EXT_DATA_KEYS.TRANSACTIONS, start, end, pool: poolFilter }
  })

  const dailyEntries = flattenTransactionResults(results)

  const bucketSize = RANGE_BUCKETS[range] || RANGE_BUCKETS['1D']
  const buckets = groupByBucket(dailyEntries, bucketSize)

  const log = Object.entries(buckets)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([ts, entries]) => {
      const totalRevenue = entries.reduce((sum, e) => sum + (e.revenue || 0), 0)
      const hashrates = entries.filter(e => e.hashrate > 0)
      const avgHashrate = hashrates.length
        ? hashrates.reduce((sum, e) => sum + e.hashrate, 0) / hashrates.length
        : 0

      return {
        ts: Number(ts),
        balance: totalRevenue,
        hashrate: avgHashrate,
        revenue: totalRevenue
      }
    })

  return { log }
}

function flattenTransactionResults (results) {
  const daily = []
  for (const res of results) {
    if (res.error || !res) continue
    const data = Array.isArray(res) ? res : (res.data || res.result || [])
    if (!Array.isArray(data)) continue

    for (const entry of data) {
      if (!entry) continue
      const ts = Number(entry.ts)
      if (!ts) continue

      const txs = entry.transactions || []
      if (!Array.isArray(txs) || txs.length === 0) continue

      let revenue = 0
      let hashrate = 0
      let hashCount = 0

      for (const tx of txs) {
        if (!tx) continue
        revenue += Math.abs(tx.changed_balance || 0)
        if (tx.mining_extra?.hash_rate) {
          hashrate += tx.mining_extra.hash_rate
          hashCount++
        }
      }

      if (revenue === 0 && hashCount === 0) continue

      daily.push({
        ts: getStartOfDay(ts),
        revenue,
        hashrate: hashCount > 0 ? hashrate / hashCount : 0
      })
    }
  }

  return daily
}

function groupByBucket (entries, bucketSize) {
  const buckets = {}
  for (const entry of entries) {
    const ts = entry.ts
    if (!ts) continue
    const bucketTs = Math.floor(ts / bucketSize) * bucketSize
    if (!buckets[bucketTs]) buckets[bucketTs] = []
    buckets[bucketTs].push(entry)
  }
  return buckets
}

module.exports = {
  getPools,
  flattenPoolStats,
  calculatePoolsSummary,
  getPoolBalanceHistory,
  flattenTransactionResults,
  groupByBucket
}
