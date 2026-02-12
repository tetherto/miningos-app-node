'use strict'

const {
  WORKER_TYPES,
  PERIOD_TYPES,
  MINERPOOL_EXT_DATA_KEYS,
  RPC_METHODS
} = require('../../constants')
const {
  requestRpcEachLimit,
  getStartOfDay
} = require('../../utils')
const { aggregateByPeriod } = require('../../period.utils')

async function getPoolStatsAggregate (ctx, req) {
  const start = Number(req.query.start)
  const end = Number(req.query.end)
  const range = req.query.range || PERIOD_TYPES.DAILY
  const poolFilter = req.query.pool || null

  if (!start || !end) {
    throw new Error('ERR_MISSING_START_END')
  }

  if (start >= end) {
    throw new Error('ERR_INVALID_DATE_RANGE')
  }

  const transactionResults = await requestRpcEachLimit(ctx, RPC_METHODS.GET_WRK_EXT_DATA, {
    type: WORKER_TYPES.MINERPOOL,
    query: { key: MINERPOOL_EXT_DATA_KEYS.TRANSACTIONS, start, end }
  })

  const dailyData = processTransactionData(transactionResults, poolFilter)

  const log = Object.entries(dailyData)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([ts, data]) => ({
      ts: Number(ts),
      balance: data.revenueBTC,
      hashrate: data.hashCount > 0 ? data.hashrate / data.hashCount : 0,
      workerCount: 0,
      revenueBTC: data.revenueBTC
    }))

  const aggregated = aggregateByPeriod(log, range)
  const summary = calculateAggregateSummary(aggregated)

  return { log: aggregated, summary }
}

/**
 * Processes ext-data transaction results into daily entries.
 * The ext-data response for transactions with start/end:
 *   [ { ts, transactions: [{username, changed_balance, mining_extra: {hash_rate, ...}}, ...] }, ... ]
 * changed_balance is already in BTC (not satoshis).
 */
function processTransactionData (results, poolFilter) {
  const daily = {}
  for (const res of results) {
    if (res.error || !res) continue
    const data = Array.isArray(res) ? res : (res.data || res.result || [])
    if (!Array.isArray(data)) continue

    for (const entry of data) {
      if (!entry) continue
      const ts = getStartOfDay(Number(entry.ts))
      if (!ts) continue

      const txs = entry.transactions || []
      if (!Array.isArray(txs) || txs.length === 0) continue

      for (const tx of txs) {
        if (!tx) continue
        if (poolFilter && tx.username !== poolFilter) continue

        if (!daily[ts]) daily[ts] = { revenueBTC: 0, hashrate: 0, hashCount: 0 }
        daily[ts].revenueBTC += Math.abs(tx.changed_balance || 0)
        if (tx.mining_extra?.hash_rate) {
          daily[ts].hashrate += tx.mining_extra.hash_rate
          daily[ts].hashCount++
        }
      }
    }
  }
  return daily
}

function calculateAggregateSummary (log) {
  if (!log.length) {
    return {
      totalRevenueBTC: 0,
      avgHashrate: 0,
      avgWorkerCount: 0,
      latestBalance: 0,
      periodCount: 0
    }
  }

  const totals = log.reduce((acc, entry) => {
    acc.revenueBTC += entry.revenueBTC || 0
    acc.hashrate += entry.hashrate || 0
    acc.workerCount += entry.workerCount || 0
    return acc
  }, { revenueBTC: 0, hashrate: 0, workerCount: 0 })

  const latest = log[log.length - 1]

  return {
    totalRevenueBTC: totals.revenueBTC,
    avgHashrate: totals.hashrate / log.length,
    avgWorkerCount: totals.workerCount / log.length,
    latestBalance: latest.balance || 0,
    periodCount: log.length
  }
}

module.exports = {
  getPoolStatsAggregate,
  processTransactionData,
  calculateAggregateSummary
}
