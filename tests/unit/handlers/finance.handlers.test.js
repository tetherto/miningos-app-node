'use strict'

const test = require('brittle')
const {
  getEbitda,
  processTailLogData,
  processTransactionData,
  processPriceData,
  extractCurrentPrice,
  processCostsData,
  processBlockData,
  calculateEbitdaSummary
} = require('../../../workers/lib/server/handlers/finance.handlers')

test('getEbitda - happy path', async (t) => {
  const mockCtx = {
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async (key, method, payload) => {
        if (method === 'tailLogCustomRangeAggr') {
          return [{ data: { 1700006400000: { site_power_w: 5000, hashrate_mhs_5m_sum_aggr: 100000 } } }]
        }
        if (method === 'getWrkExtData') {
          if (payload.query && payload.query.key === 'transactions') {
            return { data: [{ transactions: [{ ts: 1700006400000, changed_balance: 50000000 }] }] }
          }
          if (payload.query && payload.query.key === 'prices') {
            return { data: [{ prices: [{ ts: 1700006400000, price: 40000 }] }] }
          }
          if (payload.query && payload.query.key === 'current_price') {
            return { data: { USD: 40000 } }
          }
          if (payload.query && payload.query.key === 'blocks') {
            return { data: [] }
          }
        }
        return {}
      }
    },
    globalDataLib: {
      getGlobalData: async () => []
    }
  }

  const mockReq = {
    query: { start: 1700000000000, end: 1700100000000, period: 'daily' }
  }

  const result = await getEbitda(mockCtx, mockReq, {})
  t.ok(result.log, 'should return log array')
  t.ok(result.summary, 'should return summary')
  t.ok(Array.isArray(result.log), 'log should be array')
  t.ok(result.summary.currentBtcPrice !== undefined, 'summary should have currentBtcPrice')
  t.pass()
})

test('getEbitda - missing start throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) },
    globalDataLib: { getGlobalData: async () => [] }
  }

  try {
    await getEbitda(mockCtx, { query: { end: 1700100000000 } }, {})
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_START_END', 'should throw missing start/end error')
  }
  t.pass()
})

test('getEbitda - invalid range throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) },
    globalDataLib: { getGlobalData: async () => [] }
  }

  try {
    await getEbitda(mockCtx, { query: { start: 1700100000000, end: 1700000000000 } }, {})
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_INVALID_DATE_RANGE', 'should throw invalid range error')
  }
  t.pass()
})

test('getEbitda - empty ork results', async (t) => {
  const mockCtx = {
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: { jRequest: async () => ({}) },
    globalDataLib: { getGlobalData: async () => [] }
  }

  const result = await getEbitda(mockCtx, { query: { start: 1700000000000, end: 1700100000000 } }, {})
  t.ok(result.log, 'should return log array')
  t.is(result.log.length, 0, 'log should be empty')
  t.pass()
})

test('processTailLogData - processes power and hashrate', (t) => {
  const results = [
    [{ data: { 1700006400000: { site_power_w: 5000, hashrate_mhs_5m_sum_aggr: 100000 } } }]
  ]

  const daily = processTailLogData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.pass()
})

test('processTailLogData - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const daily = processTailLogData(results)
  t.is(Object.keys(daily).length, 0, 'should be empty for errors')
  t.pass()
})

test('processTransactionData - processes valid data', (t) => {
  const results = [
    [{ transactions: [{ ts: 1700006400000, changed_balance: 100000000 }] }]
  ]
  const daily = processTransactionData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.pass()
})

test('processPriceData - processes valid data', (t) => {
  const results = [
    [{ prices: [{ ts: 1700006400000, price: 40000 }] }]
  ]
  const daily = processPriceData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.pass()
})

test('extractCurrentPrice - extracts numeric price', (t) => {
  const results = [{ data: 42000 }]
  t.is(extractCurrentPrice(results), 42000, 'should extract numeric price')
  t.pass()
})

test('extractCurrentPrice - extracts object price', (t) => {
  const results = [{ data: { USD: 42000 } }]
  t.is(extractCurrentPrice(results), 42000, 'should extract USD')
  t.pass()
})

test('processCostsData - processes valid costs', (t) => {
  const costs = [{ key: '2023-11', value: { energyCostPerMWh: 50, operationalCostPerMWh: 10 } }]
  const result = processCostsData(costs)
  t.ok(result['2023-11'], 'should have month key')
  t.is(result['2023-11'].energyCostPerMWh, 50, 'should have energy cost')
  t.pass()
})

test('processCostsData - handles non-array input', (t) => {
  const result = processCostsData(null)
  t.is(Object.keys(result).length, 0, 'should be empty')
  t.pass()
})

test('processBlockData - processes valid blocks', (t) => {
  const results = [
    [{ data: [{ ts: 1700006400000, difficulty: 12345 }] }]
  ]
  const daily = processBlockData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.pass()
})

test('processBlockData - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const daily = processBlockData(results)
  t.is(Object.keys(daily).length, 0, 'should be empty for errors')
  t.pass()
})

test('calculateEbitdaSummary - calculates from log entries', (t) => {
  const log = [
    { revenueBTC: 0.5, revenueUSD: 20000, totalCostsUSD: 5000, ebitdaSelling: 15000, ebitdaHodl: 15000 },
    { revenueBTC: 0.3, revenueUSD: 12000, totalCostsUSD: 3000, ebitdaSelling: 9000, ebitdaHodl: 9000 }
  ]

  const summary = calculateEbitdaSummary(log, 40000)
  t.is(summary.totalRevenueBTC, 0.8, 'should sum BTC revenue')
  t.is(summary.totalRevenueUSD, 32000, 'should sum USD revenue')
  t.is(summary.totalCostsUSD, 8000, 'should sum costs')
  t.is(summary.totalEbitdaSelling, 24000, 'should sum selling EBITDA')
  t.is(summary.currentBtcPrice, 40000, 'should include current BTC price')
  t.ok(summary.avgBtcProductionCost !== null, 'should calculate avg production cost')
  t.pass()
})

test('calculateEbitdaSummary - handles empty log', (t) => {
  const summary = calculateEbitdaSummary([], 40000)
  t.is(summary.totalRevenueBTC, 0, 'should be zero')
  t.is(summary.avgBtcProductionCost, null, 'should be null')
  t.is(summary.currentBtcPrice, 40000, 'should include current price')
  t.pass()
})
