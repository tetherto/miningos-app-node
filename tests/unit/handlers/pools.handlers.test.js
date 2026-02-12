'use strict'

const test = require('brittle')
const {
  getPools,
  flattenPoolStats,
  calculatePoolsSummary
} = require('../../../workers/lib/server/handlers/pools.handlers')

test('getPools - happy path', async (t) => {
  const mockCtx = {
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
  }

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
  const mockCtx = {
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
  }

  const mockReq = { query: { filter: '{"pool":"f2pool"}' } }
  const result = await getPools(mockCtx, mockReq, {})
  t.ok(result.pools, 'should return filtered pools')
  t.is(result.pools.length, 1, 'should have 1 pool after filter')
  t.is(result.pools[0].pool, 'f2pool', 'should match filter')
  t.pass()
})

test('getPools - empty ork results', async (t) => {
  const mockCtx = {
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: { jRequest: async () => ([]) }
  }

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
