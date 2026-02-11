'use strict'

const test = require('brittle')
const {
  getEnergyBalance,
  processConsumptionData,
  processTransactionData,
  processPriceData,
  extractCurrentPrice,
  processCostsData,
  calculateSummary
} = require('../../../workers/lib/server/handlers/finance.handlers')

test('getEnergyBalance - happy path', async (t) => {
  const mockCtx = {
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async (key, method, payload) => {
        if (method === 'tailLogCustomRangeAggr') {
          return [{ data: { 1700006400000: { site_power_w: 5000 } } }]
        }
        if (method === 'getWrkExtData') {
          if (payload.query && payload.query.key === 'transactions') {
            return { data: [{ transactions: [{ ts: 1700006400000, changed_balance: 50000, amount: 50000 }] }] }
          }
          if (payload.query && payload.query.key === 'prices') {
            return { data: [{ prices: [{ ts: 1700006400000, price: 40000 }] }] }
          }
          if (payload.query && payload.query.key === 'current_price') {
            return { data: { USD: 40000 } }
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

  const result = await getEnergyBalance(mockCtx, mockReq, {})
  t.ok(result.log, 'should return log array')
  t.ok(result.summary, 'should return summary')
  t.ok(Array.isArray(result.log), 'log should be array')
  t.pass()
})

test('getEnergyBalance - missing start throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) },
    globalDataLib: { getGlobalData: async () => [] }
  }

  const mockReq = { query: { end: 1700100000000 } }

  try {
    await getEnergyBalance(mockCtx, mockReq, {})
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_START_END', 'should throw missing start/end error')
  }
  t.pass()
})

test('getEnergyBalance - missing end throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) },
    globalDataLib: { getGlobalData: async () => [] }
  }

  const mockReq = { query: { start: 1700000000000 } }

  try {
    await getEnergyBalance(mockCtx, mockReq, {})
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_START_END', 'should throw missing start/end error')
  }
  t.pass()
})

test('getEnergyBalance - invalid range throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) },
    globalDataLib: { getGlobalData: async () => [] }
  }

  const mockReq = { query: { start: 1700100000000, end: 1700000000000 } }

  try {
    await getEnergyBalance(mockCtx, mockReq, {})
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_INVALID_DATE_RANGE', 'should throw invalid range error')
  }
  t.pass()
})

test('getEnergyBalance - empty ork results', async (t) => {
  const mockCtx = {
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async () => ({})
    },
    globalDataLib: {
      getGlobalData: async () => []
    }
  }

  const mockReq = {
    query: { start: 1700000000000, end: 1700100000000, period: 'daily' }
  }

  const result = await getEnergyBalance(mockCtx, mockReq, {})
  t.ok(result.log, 'should return log array')
  t.ok(result.summary, 'should return summary')
  t.is(result.log.length, 0, 'log should be empty with no data')
  t.pass()
})

test('processConsumptionData - processes valid data', (t) => {
  const results = [
    [{ data: { 1700006400000: { site_power_w: 5000 } } }]
  ]

  const daily = processConsumptionData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.pass()
})

test('processConsumptionData - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const daily = processConsumptionData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.is(Object.keys(daily).length, 0, 'should be empty for error results')
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

test('processTransactionData - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const daily = processTransactionData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.is(Object.keys(daily).length, 0, 'should be empty for error results')
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
  const price = extractCurrentPrice(results)
  t.is(price, 42000, 'should extract numeric price')
  t.pass()
})

test('extractCurrentPrice - extracts object price', (t) => {
  const results = [{ data: { USD: 42000 } }]
  const price = extractCurrentPrice(results)
  t.is(price, 42000, 'should extract USD from object')
  t.pass()
})

test('extractCurrentPrice - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const price = extractCurrentPrice(results)
  t.is(price, 0, 'should return 0 for error results')
  t.pass()
})

test('processCostsData - processes valid costs array', (t) => {
  const costs = [
    { key: '2023-11', value: { energyCostPerMWh: 50, operationalCostPerMWh: 10 } }
  ]

  const result = processCostsData(costs)
  t.ok(result['2023-11'], 'should have month key')
  t.is(result['2023-11'].energyCostPerMWh, 50, 'should have energy cost')
  t.is(result['2023-11'].operationalCostPerMWh, 10, 'should have operational cost')
  t.pass()
})

test('processCostsData - handles non-array input', (t) => {
  const result = processCostsData(null)
  t.ok(typeof result === 'object', 'should return object')
  t.is(Object.keys(result).length, 0, 'should be empty')
  t.pass()
})

test('calculateSummary - calculates from log entries', (t) => {
  const log = [
    { revenueBTC: 0.5, revenueUSD: 20000, totalCostUSD: 5000, profitUSD: 15000, consumptionMWh: 100 },
    { revenueBTC: 0.3, revenueUSD: 12000, totalCostUSD: 3000, profitUSD: 9000, consumptionMWh: 60 }
  ]

  const summary = calculateSummary(log)
  t.is(summary.totalRevenueBTC, 0.8, 'should sum BTC revenue')
  t.is(summary.totalRevenueUSD, 32000, 'should sum USD revenue')
  t.is(summary.totalCostUSD, 8000, 'should sum costs')
  t.is(summary.totalProfitUSD, 24000, 'should sum profit')
  t.is(summary.totalConsumptionMWh, 160, 'should sum consumption')
  t.ok(summary.avgCostPerMWh !== null, 'should calculate avg cost per MWh')
  t.ok(summary.avgRevenuePerMWh !== null, 'should calculate avg revenue per MWh')
  t.pass()
})

test('calculateSummary - handles empty log', (t) => {
  const summary = calculateSummary([])
  t.is(summary.totalRevenueBTC, 0, 'should be zero')
  t.is(summary.totalRevenueUSD, 0, 'should be zero')
  t.is(summary.avgCostPerMWh, null, 'should be null')
  t.pass()
})
