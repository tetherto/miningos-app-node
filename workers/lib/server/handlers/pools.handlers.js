'use strict'

const {
  RPC_METHODS,
  MINERPOOL_EXT_DATA_KEYS,
  RANGE_BUCKETS
} = require('../../constants')
const {
  requestRpcEachLimit,
  getStartOfDay
} = require('../../utils')

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
    query: { key: MINERPOOL_EXT_DATA_KEYS.TRANSACTIONS, start, end }
  })

  const dailyEntries = flattenTransactionResults(results, poolFilter)

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

/**
 * Flattens ext-data transaction results into daily entries.
 * The ext-data response structure for transactions:
 *   [ { ts, stats, transactions: [{username, changed_balance, mining_extra: {hash_rate, ...}}, ...] }, ... ]
 */
function flattenTransactionResults (results, poolFilter) {
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
        if (poolFilter && tx.username !== poolFilter) continue
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
  getPoolBalanceHistory,
  flattenTransactionResults,
  groupByBucket
}
