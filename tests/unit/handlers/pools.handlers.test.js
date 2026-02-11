'use strict'

const test = require('brittle')
const {
  getPoolStatsAggregate,
  processStatsData,
  processRevenueData,
  calculateAggregateSummary
} = require('../../../workers/lib/server/handlers/pools.handlers')

test('getPoolStatsAggregate - happy path', async (t) => {
  const mockCtx = {
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async (key, method, payload) => {
        if (method === 'tailLog') {
          return [{ data: [{ ts: 1700006400000, balance: 50000, hashrate: 100, worker_count: 5, tag: 'pool1' }] }]
        }
        if (method === 'getWrkExtData') {
          return { data: [{ transactions: [{ ts: 1700006400000, changed_balance: 50000000, tag: 'pool1' }] }] }
        }
        return {}
      }
    }
  }

  const mockReq = {
    query: { start: 1700000000000, end: 1700100000000, range: 'daily' }
  }

  const result = await getPoolStatsAggregate(mockCtx, mockReq, {})
  t.ok(result.log, 'should return log array')
  t.ok(result.summary, 'should return summary')
  t.ok(Array.isArray(result.log), 'log should be array')
  t.pass()
})

test('getPoolStatsAggregate - with pool filter', async (t) => {
  const mockCtx = {
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: {
      jRequest: async (key, method) => {
        if (method === 'tailLog') {
          return [{
            data: [
              { ts: 1700006400000, balance: 50000, hashrate: 100, tag: 'pool1' },
              { ts: 1700006400000, balance: 30000, hashrate: 200, tag: 'pool2' }
            ]
          }]
        }
        return { data: [] }
      }
    }
  }

  const mockReq = {
    query: { start: 1700000000000, end: 1700100000000, pool: 'pool1' }
  }

  const result = await getPoolStatsAggregate(mockCtx, mockReq, {})
  t.ok(result.log, 'should return filtered log')
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
  const mockCtx = {
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: { jRequest: async () => ({}) }
  }

  const result = await getPoolStatsAggregate(mockCtx, { query: { start: 1700000000000, end: 1700100000000 } }, {})
  t.ok(result.log, 'should return log array')
  t.is(result.log.length, 0, 'log should be empty')
  t.pass()
})

test('processStatsData - processes valid stats', (t) => {
  const results = [
    [{ data: [{ ts: 1700006400000, balance: 50000, hashrate: 100, worker_count: 5 }] }]
  ]
  const daily = processStatsData(results, null)
  t.ok(typeof daily === 'object', 'should return object')
  t.pass()
})

test('processStatsData - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const daily = processStatsData(results, null)
  t.is(Object.keys(daily).length, 0, 'should be empty')
  t.pass()
})

test('processStatsData - filters by pool', (t) => {
  const results = [
    [{
      data: [
        { ts: 1700006400000, balance: 50000, tag: 'pool1' },
        { ts: 1700006400000, balance: 30000, tag: 'pool2' }
      ]
    }]
  ]
  const daily = processStatsData(results, 'pool1')
  t.ok(typeof daily === 'object', 'should return filtered data')
  t.pass()
})

test('processRevenueData - processes valid transactions', (t) => {
  const results = [
    [{ transactions: [{ ts: 1700006400000, changed_balance: 100000000 }] }]
  ]
  const daily = processRevenueData(results, null)
  t.ok(typeof daily === 'object', 'should return object')
  t.pass()
})

test('processRevenueData - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const daily = processRevenueData(results, null)
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
