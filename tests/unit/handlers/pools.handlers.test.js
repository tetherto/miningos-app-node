'use strict'

const test = require('brittle')
const {
  getPools,
  flattenPoolStats,
  calculatePoolsSummary,
  getPoolBalanceHistory,
  flattenTransactionResults,
  groupByBucket,
  getPoolStatsAggregate,
  processTransactionData,
  calculateAggregateSummary
} = require('../../../workers/lib/server/handlers/pools.handlers')
const { withDataProxy } = require('../helpers/mockHelpers')

test('getPools - happy path', async (t) => {
  const mockCtx = withDataProxy({
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async (key, method, payload) => {
        if (method === 'getWrkExtData') {
          return [{
            ts: '1770000000000',
            stats: [
              { poolType: 'f2pool', username: 'user1', hashrate: 100000, worker_count: 5, balance: 0.5, timestamp: 1770000000000 },
              { poolType: 'ocean', username: 'user2', hashrate: 200000, worker_count: 10, balance: 1.2, timestamp: 1770000000000 }
            ]
          }]
        }
        return []
      }
    }
  })

  const mockReq = { query: {} }
  const result = await getPools(mockCtx, mockReq, {})
  t.ok(result.pools, 'should return pools array')
  t.ok(result.summary, 'should return summary')
  t.ok(Array.isArray(result.pools), 'pools should be array')
  t.is(result.pools.length, 2, 'should have 2 pools')
  t.is(result.summary.poolCount, 2, 'summary should count 2 pools')
  t.pass()
})

test('getPools - with filter', async (t) => {
  const mockCtx = withDataProxy({
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: {
      jRequest: async () => [{
        ts: '1770000000000',
        stats: [
          { poolType: 'f2pool', username: 'user1', hashrate: 100000, worker_count: 5, balance: 0.5 },
          { poolType: 'ocean', username: 'user2', hashrate: 200000, worker_count: 10, balance: 0 }
        ]
      }]
    }
  })

  const mockReq = { query: { query: '{"pool":"f2pool"}' } }
  const result = await getPools(mockCtx, mockReq, {})
  t.ok(result.pools, 'should return filtered pools')
  t.is(result.pools.length, 1, 'should have 1 pool after filter')
  t.is(result.pools[0].pool, 'f2pool', 'should match filter')
  t.pass()
})

test('getPools - empty ork results', async (t) => {
  const mockCtx = withDataProxy({
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: { jRequest: async () => ([]) }
  })

  const result = await getPools(mockCtx, { query: {} }, {})
  t.ok(result.pools, 'should return pools array')
  t.is(result.pools.length, 0, 'pools should be empty')
  t.is(result.summary.poolCount, 0, 'pool count should be 0')
  t.pass()
})

test('flattenPoolStats - extracts pools from ext-data stats array', (t) => {
  const results = [
    [{
      ts: '1770000000000',
      stats: [
        { poolType: 'f2pool', username: 'user1', hashrate: 100000, worker_count: 5, balance: 0.5 },
        { poolType: 'ocean', username: 'user2', hashrate: 200000, worker_count: 10, balance: 1.2 }
      ]
    }]
  ]
  const pools = flattenPoolStats(results)
  t.is(pools.length, 2, 'should extract 2 pools')
  t.is(pools[0].pool, 'f2pool', 'should have correct pool type')
  t.is(pools[0].account, 'user1', 'should have correct account')
  t.is(pools[0].hashrate, 100000, 'should have correct hashrate')
  t.is(pools[1].pool, 'ocean', 'should have correct pool type')
  t.pass()
})

test('flattenPoolStats - deduplicates pools across orks', (t) => {
  const results = [
    [{ ts: '1770000000000', stats: [{ poolType: 'f2pool', username: 'user1', hashrate: 100 }] }],
    [{ ts: '1770000000000', stats: [{ poolType: 'f2pool', username: 'user1', hashrate: 200 }] }]
  ]
  const pools = flattenPoolStats(results)
  t.is(pools.length, 1, 'should deduplicate by poolType:username')
  t.pass()
})

test('flattenPoolStats - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const pools = flattenPoolStats(results)
  t.is(pools.length, 0, 'should be empty')
  t.pass()
})

test('flattenPoolStats - handles non-array input', (t) => {
  const pools = flattenPoolStats(null)
  t.is(pools.length, 0, 'should return empty array')
  t.pass()
})

test('calculatePoolsSummary - calculates totals', (t) => {
  const pools = [
    { hashrate: 100, workerCount: 5, balance: 50000 },
    { hashrate: 200, workerCount: 10, balance: 30000 }
  ]

  const summary = calculatePoolsSummary(pools)
  t.is(summary.poolCount, 2, 'should count pools')
  t.is(summary.totalHashrate, 300, 'should sum hashrate')
  t.is(summary.totalWorkers, 15, 'should sum workers')
  t.is(summary.totalBalance, 80000, 'should sum balance')
  t.pass()
})

test('calculatePoolsSummary - handles empty pools', (t) => {
  const summary = calculatePoolsSummary([])
  t.is(summary.poolCount, 0, 'should be zero')
  t.is(summary.totalHashrate, 0, 'should be zero')
  t.pass()
})

test('getPoolBalanceHistory - happy path', async (t) => {
  const mockCtx = withDataProxy({
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async () => {
        return [{
          ts: '1700006400000',
          transactions: [{
            username: 'user1',
            changed_balance: 0.001,
            mining_extra: { hash_rate: 611000000000000 }
          }]
        }]
      }
    }
  })

  const mockReq = {
    query: { start: 1700000000000, end: 1700100000000, range: '1D' },
    params: {}
  }

  const result = await getPoolBalanceHistory(mockCtx, mockReq, {})
  t.ok(result.log, 'should return log array')
  t.ok(Array.isArray(result.log), 'log should be array')
  t.ok(result.log.length > 0, 'should have entries')
  const entry = result.log[0]
  t.ok(entry.hashrate > 0, 'should include hashrate')
  t.ok(entry.revenue > 0, 'should include revenue')
  t.pass()
})

test('getPoolBalanceHistory - with pool filter', async (t) => {
  let capturedPayload = null
  const mockCtx = withDataProxy({
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: {
      jRequest: async (key, method, payload) => {
        capturedPayload = payload
        return [{
          ts: '1700006400000',
          transactions: [
            { username: 'user1', changed_balance: 0.001 },
            { username: 'user2', changed_balance: 0.002 }
          ]
        }]
      }
    }
  })

  const mockReq = {
    query: { start: 1700000000000, end: 1700100000000 },
    params: { pool: 'user1' }
  }

  const result = await getPoolBalanceHistory(mockCtx, mockReq, {})
  t.ok(result.log, 'should return log array')
  t.is(capturedPayload.query.pool, 'user1', 'should pass pool filter in RPC payload')
  t.pass()
})

test('getPoolBalanceHistory - "all" pool filter returns all pools', async (t) => {
  const mockCtx = withDataProxy({
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: {
      jRequest: async () => {
        return [{
          ts: '1700006400000',
          transactions: [
            { username: 'user1', changed_balance: 0.001 },
            { username: 'user2', changed_balance: 0.002 }
          ]
        }]
      }
    }
  })

  const mockReq = {
    query: { start: 1700000000000, end: 1700100000000 },
    params: { pool: 'all' }
  }

  const result = await getPoolBalanceHistory(mockCtx, mockReq, {})
  t.ok(result.log.length > 0, 'should return entries for all pools')
  t.pass()
})

test('getPoolBalanceHistory - missing start throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  }

  try {
    await getPoolBalanceHistory(mockCtx, { query: { end: 1700100000000 }, params: {} }, {})
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_START_END', 'should throw missing start/end error')
  }
  t.pass()
})

test('getPoolBalanceHistory - invalid range throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  }

  try {
    await getPoolBalanceHistory(mockCtx, { query: { start: 1700100000000, end: 1700000000000 }, params: {} }, {})
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_INVALID_DATE_RANGE', 'should throw invalid range error')
  }
  t.pass()
})

test('getPoolBalanceHistory - empty ork results', async (t) => {
  const mockCtx = withDataProxy({
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: { jRequest: async () => ({}) }
  })

  const result = await getPoolBalanceHistory(mockCtx, { query: { start: 1700000000000, end: 1700100000000 }, params: {} }, {})
  t.ok(result.log, 'should return log array')
  t.is(result.log.length, 0, 'log should be empty')
  t.pass()
})

test('flattenTransactionResults - extracts daily entries from ext-data', (t) => {
  const results = [
    [{
      ts: '1700006400000',
      transactions: [
        { username: 'user1', changed_balance: 0.001, mining_extra: { hash_rate: 500000 } },
        { username: 'user2', changed_balance: 0.002, mining_extra: { hash_rate: 600000 } }
      ]
    }]
  ]
  const entries = flattenTransactionResults(results)
  t.is(entries.length, 1, 'should have 1 daily entry')
  t.ok(entries[0].revenue > 0, 'should have revenue')
  t.ok(entries[0].hashrate > 0, 'should have hashrate')
  t.pass()
})

test('flattenTransactionResults - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const entries = flattenTransactionResults(results)
  t.is(entries.length, 0, 'should be empty for errors')
  t.pass()
})

test('groupByBucket - groups by daily bucket', (t) => {
  const entries = [
    { ts: 1700006400000, revenue: 100 },
    { ts: 1700050000000, revenue: 200 },
    { ts: 1700092800000, revenue: 300 }
  ]
  const bucketSize = 86400000
  const buckets = groupByBucket(entries, bucketSize)
  t.ok(typeof buckets === 'object', 'should return object')
  t.ok(Object.keys(buckets).length >= 1, 'should have at least one bucket')
  t.pass()
})

test('groupByBucket - handles empty entries', (t) => {
  const buckets = groupByBucket([], 86400000)
  t.is(Object.keys(buckets).length, 0, 'should be empty')
  t.pass()
})

test('groupByBucket - handles missing timestamps', (t) => {
  const entries = [
    { revenue: 100 },
    { ts: 1700006400000, revenue: 200 }
  ]
  const buckets = groupByBucket(entries, 86400000)
  t.ok(Object.keys(buckets).length >= 1, 'should skip items without ts')
  t.pass()
})

test('getPoolStatsAggregate - happy path', async (t) => {
  const mockCtx = withDataProxy({
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async () => {
        return [{
          ts: '1700006400000',
          transactions: [{
            username: 'user1',
            changed_balance: 0.001,
            mining_extra: { hash_rate: 611000000000000 }
          }]
        }]
      }
    }
  })

  const mockReq = {
    query: { start: 1700000000000, end: 1700100000000, range: 'daily' }
  }

  const result = await getPoolStatsAggregate(mockCtx, mockReq, {})
  t.ok(result.log, 'should return log array')
  t.ok(result.summary, 'should return summary')
  t.ok(Array.isArray(result.log), 'log should be array')
  t.ok(result.log.length > 0, 'should have entries')
  t.ok(result.log[0].revenueBTC > 0, 'should have revenue')
  t.pass()
})

test('getPoolStatsAggregate - with pool filter', async (t) => {
  let capturedPayload = null
  const mockCtx = withDataProxy({
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: {
      jRequest: async (key, method, payload) => {
        capturedPayload = payload
        return [{
          ts: '1700006400000',
          transactions: [
            { username: 'user1', changed_balance: 0.001 },
            { username: 'user2', changed_balance: 0.002 }
          ]
        }]
      }
    }
  })

  const mockReq = {
    query: { start: 1700000000000, end: 1700100000000, pool: 'user1' }
  }

  const result = await getPoolStatsAggregate(mockCtx, mockReq, {})
  t.ok(result.log, 'should return log')
  t.is(capturedPayload.query.pool, 'user1', 'should pass pool filter in RPC payload')
  t.pass()
})

test('getPoolStatsAggregate - missing start throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  }

  try {
    await getPoolStatsAggregate(mockCtx, { query: { end: 1700100000000 } }, {})
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_START_END', 'should throw missing start/end error')
  }
  t.pass()
})

test('getPoolStatsAggregate - invalid range throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  }

  try {
    await getPoolStatsAggregate(mockCtx, { query: { start: 1700100000000, end: 1700000000000 } }, {})
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_INVALID_DATE_RANGE', 'should throw invalid range error')
  }
  t.pass()
})

test('getPoolStatsAggregate - empty ork results', async (t) => {
  const mockCtx = withDataProxy({
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: { jRequest: async () => ({}) }
  })

  const result = await getPoolStatsAggregate(mockCtx, { query: { start: 1700000000000, end: 1700100000000 } }, {})
  t.ok(result.log, 'should return log array')
  t.is(result.log.length, 0, 'log should be empty')
  t.pass()
})

test('processTransactionData - processes valid transactions', (t) => {
  const results = [
    [{
      ts: '1700006400000',
      transactions: [
        { username: 'user1', changed_balance: 0.001, mining_extra: { hash_rate: 500000 } },
        { username: 'user2', changed_balance: 0.002, mining_extra: { hash_rate: 600000 } }
      ]
    }]
  ]
  const daily = processTransactionData(results)
  t.ok(typeof daily === 'object', 'should return object')
  const keys = Object.keys(daily)
  t.ok(keys.length > 0, 'should have entries')
  const entry = daily[keys[0]]
  t.ok(entry.revenueBTC > 0, 'should have revenue')
  t.ok(entry.hashrate > 0, 'should have hashrate')
  t.pass()
})

test('processTransactionData - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const daily = processTransactionData(results)
  t.is(Object.keys(daily).length, 0, 'should be empty')
  t.pass()
})

test('calculateAggregateSummary - calculates from log', (t) => {
  const log = [
    { revenueBTC: 0.5, hashrate: 100, workerCount: 5, balance: 50000 },
    { revenueBTC: 0.3, hashrate: 200, workerCount: 10, balance: 60000 }
  ]

  const summary = calculateAggregateSummary(log)
  t.is(summary.totalRevenueBTC, 0.8, 'should sum revenue')
  t.is(summary.avgHashrate, 150, 'should avg hashrate')
  t.is(summary.avgWorkerCount, 7.5, 'should avg workers')
  t.is(summary.latestBalance, 60000, 'should take latest balance')
  t.is(summary.periodCount, 2, 'should count periods')
  t.pass()
})

test('calculateAggregateSummary - handles empty log', (t) => {
  const summary = calculateAggregateSummary([])
  t.is(summary.totalRevenueBTC, 0, 'should be zero')
  t.is(summary.avgHashrate, 0, 'should be zero')
  t.is(summary.periodCount, 0, 'should be zero')
  t.pass()
})
