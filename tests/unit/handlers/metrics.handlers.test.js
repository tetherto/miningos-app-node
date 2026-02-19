'use strict'

const test = require('brittle')
const {
  getHashrate,
  processHashrateData,
  calculateHashrateSummary
} = require('../../../workers/lib/server/handlers/metrics.handlers')

// ==================== Hashrate Tests ====================

test('getHashrate - happy path', async (t) => {
  const dayTs = 1700006400000
  const mockCtx = {
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async () => {
        return [{ type: 'miner', data: [{ ts: dayTs, val: { hashrate_mhs_5m_sum_aggr: 100000 } }], error: null }]
      }
    }
  }

  const mockReq = {
    query: { start: 1700000000000, end: 1700100000000 }
  }

  const result = await getHashrate(mockCtx, mockReq)
  t.ok(result.log, 'should return log array')
  t.ok(result.summary, 'should return summary')
  t.ok(Array.isArray(result.log), 'log should be array')
  t.ok(result.log.length > 0, 'log should have entries')
  t.is(result.log[0].hashrateMhs, 100000, 'should have hashrate value')
  t.ok(result.summary.avgHashrateMhs !== null, 'should have avg hashrate')
  t.is(result.summary.totalHashrateMhs, 100000, 'should have total hashrate')
  t.pass()
})

test('getHashrate - missing start throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  }

  try {
    await getHashrate(mockCtx, { query: { end: 1700100000000 } })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_START_END', 'should throw missing start/end error')
  }
  t.pass()
})

test('getHashrate - missing end throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  }

  try {
    await getHashrate(mockCtx, { query: { start: 1700000000000 } })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_START_END', 'should throw missing start/end error')
  }
  t.pass()
})

test('getHashrate - invalid range throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  }

  try {
    await getHashrate(mockCtx, { query: { start: 1700100000000, end: 1700000000000 } })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_INVALID_DATE_RANGE', 'should throw invalid range error')
  }
  t.pass()
})

test('getHashrate - empty ork results', async (t) => {
  const mockCtx = {
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: { jRequest: async () => ({}) }
  }

  const result = await getHashrate(mockCtx, { query: { start: 1700000000000, end: 1700100000000 } })
  t.ok(result.log, 'should return log array')
  t.ok(result.summary, 'should return summary')
  t.is(result.log.length, 0, 'log should be empty with no data')
  t.is(result.summary.totalHashrateMhs, 0, 'total should be zero')
  t.is(result.summary.avgHashrateMhs, null, 'avg should be null')
  t.pass()
})

test('processHashrateData - processes array data from ORK', (t) => {
  const results = [
    [{ type: 'miner', data: [{ ts: 1700006400000, val: { hashrate_mhs_5m_sum_aggr: 100000 } }], error: null }]
  ]

  const daily = processHashrateData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.ok(Object.keys(daily).length > 0, 'should have entries')
  const key = Object.keys(daily)[0]
  t.is(daily[key], 100000, 'should extract hashrate from val')
  t.pass()
})

test('processHashrateData - processes object-keyed data', (t) => {
  const results = [
    [{ data: { 1700006400000: { hashrate_mhs_5m_sum_aggr: 100000 } } }]
  ]

  const daily = processHashrateData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.ok(Object.keys(daily).length > 0, 'should have entries')
  t.pass()
})

test('processHashrateData - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const daily = processHashrateData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.is(Object.keys(daily).length, 0, 'should be empty for error results')
  t.pass()
})

test('processHashrateData - aggregates multiple orks', (t) => {
  const results = [
    [{ data: { 1700006400000: { hashrate_mhs_5m_sum_aggr: 50000 } } }],
    [{ data: { 1700006400000: { hashrate_mhs_5m_sum_aggr: 30000 } } }]
  ]

  const daily = processHashrateData(results)
  const key = Object.keys(daily)[0]
  t.is(daily[key], 80000, 'should sum hashrate from multiple orks')
  t.pass()
})

test('calculateHashrateSummary - calculates from log entries', (t) => {
  const log = [
    { ts: 1700006400000, hashrateMhs: 100000 },
    { ts: 1700092800000, hashrateMhs: 120000 }
  ]

  const summary = calculateHashrateSummary(log)
  t.is(summary.totalHashrateMhs, 220000, 'should sum hashrate')
  t.is(summary.avgHashrateMhs, 110000, 'should average hashrate')
  t.pass()
})

test('calculateHashrateSummary - handles empty log', (t) => {
  const summary = calculateHashrateSummary([])
  t.is(summary.totalHashrateMhs, 0, 'should be zero')
  t.is(summary.avgHashrateMhs, null, 'should be null')
  t.pass()
})
