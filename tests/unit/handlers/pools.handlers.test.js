'use strict'

const test = require('brittle')
const {
  getPoolStatsAggregate,
  processTransactionData,
  calculateAggregateSummary
} = require('../../../workers/lib/server/handlers/pools.handlers')

test('getPoolStatsAggregate - happy path', async (t) => {
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
  const mockCtx = {
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: { jRequest: async () => ({}) }
  }

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
