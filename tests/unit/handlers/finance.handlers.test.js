'use strict'

const test = require('brittle')
const {
  getCostSummary,
  processConsumptionData,
  processPriceData,
  processCostsData,
  calculateCostSummary
} = require('../../../workers/lib/server/handlers/finance.handlers')

test('getCostSummary - happy path', async (t) => {
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
          return { data: [{ prices: [{ ts: 1700006400000, price: 40000 }] }] }
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

  const result = await getCostSummary(mockCtx, mockReq, {})
  t.ok(result.log, 'should return log array')
  t.ok(result.summary, 'should return summary')
  t.ok(Array.isArray(result.log), 'log should be array')
  t.pass()
})

test('getCostSummary - missing start throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) },
    globalDataLib: { getGlobalData: async () => [] }
  }

  try {
    await getCostSummary(mockCtx, { query: { end: 1700100000000 } }, {})
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_START_END', 'should throw missing start/end error')
  }
  t.pass()
})

test('getCostSummary - invalid range throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) },
    globalDataLib: { getGlobalData: async () => [] }
  }

  try {
    await getCostSummary(mockCtx, { query: { start: 1700100000000, end: 1700000000000 } }, {})
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_INVALID_DATE_RANGE', 'should throw invalid range error')
  }
  t.pass()
})

test('getCostSummary - empty ork results', async (t) => {
  const mockCtx = {
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: { jRequest: async () => ({}) },
    globalDataLib: { getGlobalData: async () => [] }
  }

  const result = await getCostSummary(mockCtx, { query: { start: 1700000000000, end: 1700100000000 } }, {})
  t.ok(result.log, 'should return log array')
  t.is(result.log.length, 0, 'log should be empty')
  t.pass()
})

test('processConsumptionData - processes valid data', (t) => {
  const results = [[{ data: { 1700006400000: { site_power_w: 5000 } } }]]
  const daily = processConsumptionData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.pass()
})

test('processConsumptionData - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const daily = processConsumptionData(results)
  t.is(Object.keys(daily).length, 0, 'should be empty')
  t.pass()
})

test('processPriceData - processes valid data', (t) => {
  const results = [[{ prices: [{ ts: 1700006400000, price: 40000 }] }]]
  const daily = processPriceData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.pass()
})

test('processCostsData - processes app-node format (energyCost)', (t) => {
  const costs = [
    { site: 'site1', year: 2023, month: 11, energyCost: 30000, operationalCost: 6000 }
  ]

  const result = processCostsData(costs)
  t.ok(result['2023-11'], 'should have month key')
  t.is(result['2023-11'].energyCostPerDay, 1000, 'should have daily energy cost (30000/30)')
  t.is(result['2023-11'].operationalCostPerDay, 200, 'should have daily operational cost (6000/30)')
  t.pass()
})

test('processCostsData - handles non-array input', (t) => {
  const result = processCostsData(null)
  t.is(Object.keys(result).length, 0, 'should be empty')
  t.pass()
})

test('calculateCostSummary - calculates from log entries', (t) => {
  const log = [
    { energyCostsUSD: 5000, operationalCostsUSD: 1000, totalCostsUSD: 6000, consumptionMWh: 100, btcPrice: 40000 },
    { energyCostsUSD: 3000, operationalCostsUSD: 600, totalCostsUSD: 3600, consumptionMWh: 60, btcPrice: 42000 }
  ]

  const summary = calculateCostSummary(log)
  t.is(summary.totalEnergyCostsUSD, 8000, 'should sum energy costs')
  t.is(summary.totalOperationalCostsUSD, 1600, 'should sum operational costs')
  t.is(summary.totalCostsUSD, 9600, 'should sum total costs')
  t.is(summary.totalConsumptionMWh, 160, 'should sum consumption')
  t.ok(summary.avgAllInCostPerMWh !== null, 'should calculate avg all-in cost')
  t.ok(summary.avgBtcPrice !== null, 'should calculate avg BTC price')
  t.pass()
})

test('calculateCostSummary - handles empty log', (t) => {
  const summary = calculateCostSummary([])
  t.is(summary.totalCostsUSD, 0, 'should be zero')
  t.is(summary.avgAllInCostPerMWh, null, 'should be null')
  t.pass()
})
