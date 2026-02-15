'use strict'

const test = require('brittle')
const {
  getPoolBalanceHistory,
  flattenTransactionResults,
  groupByBucket
} = require('../../../workers/lib/server/handlers/pools.handlers')

test('getPoolBalanceHistory - happy path', async (t) => {
  const mockCtx = {
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
  }

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
  const mockCtx = {
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
  }

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
  const mockCtx = {
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
  }

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
  const mockCtx = {
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: { jRequest: async () => ({}) }
  }

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
