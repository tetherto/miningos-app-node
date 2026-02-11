'use strict'

const {
  RPC_METHODS,
  RANGE_BUCKETS
} = require('../../constants')
const {
  requestRpcEachLimit
} = require('../../utils')

async function getPoolBalanceHistory (ctx, req) {
  const start = Number(req.query.start)
  const end = Number(req.query.end)
  const range = req.query.range || '1D'
  const poolFilter = req.params.pool || null

  if (!start || !end) {
    throw new Error('ERR_MISSING_START_END')
  }

  if (start >= end) {
    throw new Error('ERR_INVALID_DATE_RANGE')
  }

  const results = await requestRpcEachLimit(ctx, RPC_METHODS.TAIL_LOG, {
    key: 'stat-3h',
    type: 'minerpool',
    start,
    end
  })

  const snapshots = flattenSnapshots(results)

  const filtered = poolFilter
    ? snapshots.filter(s => s.tag === poolFilter || s.pool === poolFilter || s.id === poolFilter)
    : snapshots

  const bucketSize = RANGE_BUCKETS[range] || RANGE_BUCKETS['1D']
  const buckets = groupByBucket(filtered, bucketSize)

  const log = Object.entries(buckets)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([ts, entries]) => {
      const latest = entries[entries.length - 1]
      const revenue = entries.reduce((sum, e) => sum + (e.revenue || 0), 0)

      return {
        ts: Number(ts),
        balance: latest.balance || 0,
        revenue,
        snapshotCount: entries.length
      }
    })

  return { log }
}

function flattenSnapshots (results) {
  const flat = []
  for (const res of results) {
    if (res.error || !res) continue
    const data = Array.isArray(res) ? res : (res.data || res.result || [])
    if (!Array.isArray(data)) continue
    for (const entry of data) {
      if (!entry) continue
      const items = entry.data || entry.items || entry
      if (Array.isArray(items)) {
        flat.push(...items)
      } else if (typeof items === 'object') {
        flat.push(items)
      }
    }
  }
  return flat
}

function groupByBucket (snapshots, bucketSize) {
  const buckets = {}
  for (const snapshot of snapshots) {
    const ts = snapshot.ts || snapshot.timestamp
    if (!ts) continue
    const bucketTs = Math.floor(ts / bucketSize) * bucketSize
    if (!buckets[bucketTs]) buckets[bucketTs] = []
    buckets[bucketTs].push(snapshot)
  }
  return buckets
}

module.exports = {
  getPoolBalanceHistory,
  flattenSnapshots,
  groupByBucket
}
