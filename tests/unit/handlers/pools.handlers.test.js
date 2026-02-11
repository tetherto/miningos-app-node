'use strict'

const test = require('brittle')
const {
  getPools,
  flattenResults,
  flattenStatsResults,
  mergePoolData,
  calculatePoolsSummary
} = require('../../../workers/lib/server/handlers/pools.handlers')

test('getPools - happy path', async (t) => {
  const mockCtx = {
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async (key, method, payload) => {
        if (method === 'listThings') {
          return [{ id: 'pool1', name: 'Pool 1', tag: 't-minerpool', status: 1 }]
        }
        if (method === 'getWrkExtData') {
          return { data: [{ data: { pool1: { hashrate: 100000, worker_count: 5, balance: 50000 } } }] }
        }
        return {}
      }
    }
  }

  const mockReq = { query: {} }
  const result = await getPools(mockCtx, mockReq, {})
  t.ok(result.pools, 'should return pools array')
  t.ok(result.summary, 'should return summary')
  t.ok(Array.isArray(result.pools), 'pools should be array')
  t.pass()
})

test('getPools - with filter', async (t) => {
  const mockCtx = {
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: {
      jRequest: async (key, method) => {
        if (method === 'listThings') {
          return [
            { id: 'pool1', name: 'Pool 1', status: 1 },
            { id: 'pool2', name: 'Pool 2', status: 0 }
          ]
        }
        return { data: [] }
      }
    }
  }

  const mockReq = { query: { filter: '{"status":1}' } }
  const result = await getPools(mockCtx, mockReq, {})
  t.ok(result.pools, 'should return filtered pools')
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

test('flattenResults - flattens ork arrays', (t) => {
  const results = [
    [{ id: 'pool1' }, { id: 'pool2' }],
    [{ id: 'pool3' }]
  ]
  const flat = flattenResults(results)
  t.is(flat.length, 3, 'should flatten all items')
  t.pass()
})

test('flattenResults - handles error results', (t) => {
  const results = [{ error: 'timeout' }, [{ id: 'pool1' }]]
  const flat = flattenResults(results)
  t.is(flat.length, 1, 'should skip error results')
  t.pass()
})

test('flattenResults - handles non-array input', (t) => {
  const flat = flattenResults(null)
  t.is(flat.length, 0, 'should return empty array')
  t.pass()
})

test('flattenStatsResults - builds stats map', (t) => {
  const results = [
    { data: [{ data: { pool1: { hashrate: 100 }, pool2: { hashrate: 200 } } }] }
  ]
  const stats = flattenStatsResults(results)
  t.ok(stats.pool1, 'should have pool1 stats')
  t.ok(stats.pool2, 'should have pool2 stats')
  t.is(stats.pool1.hashrate, 100, 'should have correct hashrate')
  t.pass()
})

test('flattenStatsResults - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const stats = flattenStatsResults(results)
  t.is(Object.keys(stats).length, 0, 'should be empty')
  t.pass()
})

test('mergePoolData - merges devices with stats', (t) => {
  const devices = [
    { id: 'pool1', name: 'Pool 1', status: 1 },
    { id: 'pool2', name: 'Pool 2', status: 1 }
  ]
  const stats = {
    pool1: { hashrate: 100, worker_count: 5, balance: 50000 }
  }

  const pools = mergePoolData(devices, stats)
  t.is(pools.length, 2, 'should return all devices')
  t.is(pools[0].hashrate, 100, 'should merge stats')
  t.is(pools[1].hashrate, 0, 'should default missing stats')
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
