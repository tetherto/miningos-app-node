'use strict'

const {
  WORKER_TYPES,
  PERIOD_TYPES,
  MINERPOOL_EXT_DATA_KEYS,
  RPC_METHODS,
  BTC_SATS
} = require('../../constants')
const {
  requestRpcEachLimit,
  getStartOfDay,
  runParallel
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

  const [statsResults, transactionResults] = await runParallel([
    (cb) => requestRpcEachLimit(ctx, RPC_METHODS.TAIL_LOG, {
      key: 'stat-3h',
      type: WORKER_TYPES.MINERPOOL,
      start,
      end
    }).then(r => cb(null, r)).catch(cb),

    (cb) => requestRpcEachLimit(ctx, RPC_METHODS.GET_WRK_EXT_DATA, {
      type: WORKER_TYPES.MINERPOOL,
      query: { key: MINERPOOL_EXT_DATA_KEYS.TRANSACTIONS, start, end }
    }).then(r => cb(null, r)).catch(cb)
  ])

  const dailyStats = processStatsData(statsResults, poolFilter)
  const dailyRevenue = processRevenueData(transactionResults, poolFilter)

  const allDays = new Set([
    ...Object.keys(dailyStats),
    ...Object.keys(dailyRevenue)
  ])

  const log = []
  for (const dayTs of [...allDays].sort()) {
    const ts = Number(dayTs)
    const stats = dailyStats[dayTs] || {}
    const revenue = dailyRevenue[dayTs] || {}

    log.push({
      ts,
      balance: stats.balance || 0,
      hashrate: stats.hashrate || 0,
      workerCount: stats.workerCount || 0,
      revenueBTC: revenue.revenueBTC || 0,
      snapshotCount: stats.count || 0
    })
  }

  const aggregated = aggregateByPeriod(log, range)
  const summary = calculateAggregateSummary(aggregated)

  return { log: aggregated, summary }
}

function processStatsData (results, poolFilter) {
  const daily = {}
  for (const res of results) {
    if (res.error || !res) continue
    const data = Array.isArray(res) ? res : (res.data || res.result || [])
    if (!Array.isArray(data)) continue
    for (const entry of data) {
      if (!entry) continue
      const items = entry.data || entry.items || entry
      if (Array.isArray(items)) {
        for (const item of items) {
          if (poolFilter && item.tag !== poolFilter && item.pool !== poolFilter && item.id !== poolFilter) continue
          const ts = getStartOfDay(item.ts || item.timestamp)
          if (!ts) continue
          if (!daily[ts]) daily[ts] = { balance: 0, hashrate: 0, workerCount: 0, count: 0 }
          daily[ts].balance = item.balance || daily[ts].balance
          daily[ts].hashrate += (item.hashrate || 0)
          daily[ts].workerCount += (item.worker_count || item.workerCount || 0)
          daily[ts].count += 1
        }
      } else if (typeof items === 'object') {
        for (const [key, val] of Object.entries(items)) {
          if (!val || typeof val !== 'object') continue
          if (poolFilter && val.tag !== poolFilter && val.pool !== poolFilter && key !== poolFilter) continue
          const ts = getStartOfDay(val.ts || val.timestamp || Number(key))
          if (!ts) continue
          if (!daily[ts]) daily[ts] = { balance: 0, hashrate: 0, workerCount: 0, count: 0 }
          daily[ts].balance = val.balance || daily[ts].balance
          daily[ts].hashrate += (val.hashrate || 0)
          daily[ts].workerCount += (val.worker_count || val.workerCount || 0)
          daily[ts].count += 1
        }
      }
    }
  }
  return daily
}

function processRevenueData (results, poolFilter) {
  const daily = {}
  for (const res of results) {
    if (res.error || !res) continue
    const data = Array.isArray(res) ? res : (res.data || res.result || [])
    if (!Array.isArray(data)) continue
    for (const tx of data) {
      if (!tx) continue
      const txList = tx.data || tx.transactions || tx
      if (!Array.isArray(txList)) continue
      for (const t of txList) {
        if (!t) continue
        if (poolFilter && t.tag !== poolFilter && t.pool !== poolFilter && t.id !== poolFilter) continue
        const ts = getStartOfDay(t.ts || t.timestamp || t.time)
        if (!ts) continue
        if (!daily[ts]) daily[ts] = { revenueBTC: 0 }
        const amount = t.changed_balance || t.amount || t.value || 0
        daily[ts].revenueBTC += Math.abs(amount) / BTC_SATS
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
  processStatsData,
  processRevenueData,
  calculateAggregateSummary
}
