'use strict'

const test = require('brittle')
const {
  getPoolBalanceHistory,
  flattenSnapshots,
  groupByBucket
} = require('../../../workers/lib/server/handlers/pools.handlers')

test('getPoolBalanceHistory - happy path', async (t) => {
  const mockCtx = {
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async () => {
        return [{ data: [{ ts: 1700006400000, balance: 50000, hashrate: 120000, revenue: 100, tag: 'pool1' }] }]
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
  t.ok(entry.hashrate !== undefined, 'should include hashrate')
  t.is(entry.hashrate, 120000, 'hashrate should match source data')
  t.ok(entry.snapshotCount === undefined, 'should not include snapshotCount')
  t.pass()
})

test('getPoolBalanceHistory - with pool filter', async (t) => {
  const mockCtx = {
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: {
      jRequest: async () => {
        return [{
          data: [
            { ts: 1700006400000, balance: 50000, tag: 'pool1' },
            { ts: 1700006400000, balance: 30000, tag: 'pool2' }
          ]
        }]
      }
    }
  }

  const mockReq = {
    query: { start: 1700000000000, end: 1700100000000 },
    params: { pool: 'pool1' }
  }

  const result = await getPoolBalanceHistory(mockCtx, mockReq, {})
  t.ok(result.log, 'should return log array')
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

test('flattenSnapshots - flattens ork results', (t) => {
  const results = [
    [{ data: [{ ts: 1, balance: 100 }, { ts: 2, balance: 200 }] }]
  ]
  const flat = flattenSnapshots(results)
  t.ok(flat.length >= 1, 'should flatten snapshots')
  t.pass()
})

test('flattenSnapshots - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const flat = flattenSnapshots(results)
  t.is(flat.length, 0, 'should be empty for errors')
  t.pass()
})

test('groupByBucket - groups by daily bucket', (t) => {
  const snapshots = [
    { ts: 1700006400000, balance: 100 },
    { ts: 1700050000000, balance: 200 },
    { ts: 1700092800000, balance: 300 }
  ]
  const bucketSize = 86400000
  const buckets = groupByBucket(snapshots, bucketSize)
  t.ok(typeof buckets === 'object', 'should return object')
  t.ok(Object.keys(buckets).length >= 1, 'should have at least one bucket')
  t.pass()
})

test('groupByBucket - handles empty snapshots', (t) => {
  const buckets = groupByBucket([], 86400000)
  t.is(Object.keys(buckets).length, 0, 'should be empty')
  t.pass()
})

test('groupByBucket - handles missing timestamps', (t) => {
  const snapshots = [
    { balance: 100 },
    { ts: 1700006400000, balance: 200 }
  ]
  const buckets = groupByBucket(snapshots, 86400000)
  t.ok(Object.keys(buckets).length >= 1, 'should skip items without ts')
  t.pass()
})
