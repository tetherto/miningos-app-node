'use strict'

const test = require('brittle')
const {
  getEnergyBalance,
  processConsumptionData,
  processTransactionData,
  processPriceData,
  extractCurrentPrice,
  processCostsData,
  calculateSummary,
  getEbitda,
  processTailLogData,
  processEbitdaTransactions,
  processEbitdaPrices,
  extractEbitdaCurrentPrice,
  calculateEbitdaSummary,
  getCostSummary,
  calculateCostSummary,
  getRevenueSummary,
  processRevenueTransactions,
  processBlockData,
  calculateRevenueSummarySummary
} = require('../../../workers/lib/server/handlers/finance.handlers')

// ==================== Energy Balance Tests ====================

test('getEnergyBalance - happy path', async (t) => {
  const dayTs = 1700006400000
  const mockCtx = {
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async (key, method, payload) => {
        if (method === 'tailLogCustomRangeAggr') {
          return [{ type: 'powermeter', data: [{ ts: dayTs, val: { site_power_w: 5000 } }], error: null }]
        }
        if (method === 'getWrkExtData') {
          if (payload.query && payload.query.key === 'transactions') {
            return [{ ts: dayTs, transactions: [{ ts: dayTs, changed_balance: 0.5 }] }]
          }
          if (payload.query && payload.query.key === 'HISTORICAL_PRICES') {
            return [{ ts: dayTs, priceUSD: 40000 }]
          }
          if (payload.query && payload.query.key === 'current_price') {
            return [{ currentPrice: 40000 }]
          }
          if (payload.query && payload.query.key === 'stats-history') {
            return []
          }
        }
        if (method === 'getGlobalConfig') {
          return { nominalPowerAvailability_MW: 10 }
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
    conf: { orks: [], site: 'test-site' },
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
    conf: { orks: [], site: 'test-site' },
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
    conf: { orks: [], site: 'test-site' },
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
    globalDataBee: {
      sub: () => ({
        sub: () => ({
          createReadStream: () => (async function * () {})()
        })
      })
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

test('processConsumptionData - processes daily data from ORK', (t) => {
  const results = [
    [{ type: 'powermeter', data: [{ ts: 1700006400000, val: { site_power_w: 5000 } }], error: null }]
  ]

  const daily = processConsumptionData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.ok(Object.keys(daily).length > 0, 'should have entries')
  const key = Object.keys(daily)[0]
  t.is(daily[key].powerW, 5000, 'should extract power from val')
  t.pass()
})

test('processConsumptionData - processes object-keyed data', (t) => {
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

test('processTransactionData - processes F2Pool data', (t) => {
  const results = [
    [{ ts: 1700006400000, transactions: [{ created_at: 1700006400, changed_balance: 0.001 }] }]
  ]

  const daily = processTransactionData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.ok(Object.keys(daily).length > 0, 'should have entries')
  const key = Object.keys(daily)[0]
  t.is(daily[key].revenueBTC, 0.001, 'should use changed_balance directly as BTC')
  t.pass()
})

test('processTransactionData - processes Ocean data', (t) => {
  const results = [
    [{ ts: 1700006400000, transactions: [{ ts: 1700006400, satoshis_net_earned: 50000000 }] }]
  ]

  const daily = processTransactionData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.ok(Object.keys(daily).length > 0, 'should have entries')
  const key = Object.keys(daily)[0]
  t.is(daily[key].revenueBTC, 0.5, 'should convert sats to BTC')
  t.pass()
})

test('processTransactionData - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const daily = processTransactionData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.is(Object.keys(daily).length, 0, 'should be empty for error results')
  t.pass()
})

test('processPriceData - processes mempool price data', (t) => {
  const results = [
    [{ ts: 1700006400000, priceUSD: 40000 }]
  ]

  const daily = processPriceData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.ok(Object.keys(daily).length > 0, 'should have entries')
  const key = Object.keys(daily)[0]
  t.is(daily[key], 40000, 'should extract priceUSD')
  t.pass()
})

test('extractCurrentPrice - extracts currentPrice from mempool data', (t) => {
  const results = [
    [{ currentPrice: 42000, blockHeight: 900000 }]
  ]
  const price = extractCurrentPrice(results)
  t.is(price, 42000, 'should extract currentPrice')
  t.pass()
})

test('extractCurrentPrice - extracts priceUSD', (t) => {
  const results = [
    [{ ts: 1700006400000, priceUSD: 42000 }]
  ]
  const price = extractCurrentPrice(results)
  t.is(price, 42000, 'should extract priceUSD')
  t.pass()
})

test('extractCurrentPrice - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const price = extractCurrentPrice(results)
  t.is(price, 0, 'should return 0 for error results')
  t.pass()
})

test('processCostsData - processes dashboard format (energyCostsUSD)', (t) => {
  const costs = [
    { region: 'site1', year: 2023, month: 11, energyCostsUSD: 30000, operationalCostsUSD: 6000 }
  ]

  const result = processCostsData(costs)
  t.ok(result['2023-11'], 'should have month key')
  t.is(result['2023-11'].energyCostPerDay, 1000, 'should have daily energy cost (30000/30)')
  t.is(result['2023-11'].operationalCostPerDay, 200, 'should have daily operational cost (6000/30)')
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

// ==================== EBITDA Tests ====================

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

test('processEbitdaTransactions - processes valid data', (t) => {
  const results = [
    [{ transactions: [{ ts: 1700006400000, changed_balance: 100000000 }] }]
  ]
  const daily = processEbitdaTransactions(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.pass()
})

test('processEbitdaPrices - processes valid data', (t) => {
  const results = [
    [{ prices: [{ ts: 1700006400000, price: 40000 }] }]
  ]
  const daily = processEbitdaPrices(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.pass()
})

test('extractEbitdaCurrentPrice - extracts numeric price', (t) => {
  const results = [{ data: 42000 }]
  t.is(extractEbitdaCurrentPrice(results), 42000, 'should extract numeric price')
  t.pass()
})

test('extractEbitdaCurrentPrice - extracts object price', (t) => {
  const results = [{ data: { USD: 42000 } }]
  t.is(extractEbitdaCurrentPrice(results), 42000, 'should extract USD')
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

// ==================== Cost Summary Tests ====================

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

// ==================== Revenue Summary Tests ====================

test('getRevenueSummary - happy path', async (t) => {
  const dayTs = 1700006400000
  const mockCtx = {
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async (key, method, payload) => {
        if (method === 'tailLogCustomRangeAggr') {
          return [{ data: { [dayTs]: { site_power_w: 5000, hashrate_mhs_5m_sum_aggr: 100000 } } }]
        }
        if (method === 'getWrkExtData') {
          if (payload.query && payload.query.key === 'transactions') {
            return [{ transactions: [{ ts: dayTs, changed_balance: 0.5, mining_extra: { tx_fee: 0.001 } }] }]
          }
          if (payload.query && payload.query.key === 'HISTORICAL_PRICES') {
            return [{ data: [{ ts: dayTs, priceUSD: 40000 }] }]
          }
          if (payload.query && payload.query.key === 'current_price') {
            return { data: { USD: 40000 } }
          }
          if (payload.query && payload.query.key === 'HISTORICAL_BLOCKSIZES') {
            return [{ data: [{ ts: dayTs, blockReward: 6.25, blockTotalFees: 0.5 }] }]
          }
          if (payload.query && payload.query.key === 'stats-history') {
            return []
          }
        }
        if (method === 'getGlobalConfig') {
          return { nominalPowerAvailability_MW: 10 }
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

  const result = await getRevenueSummary(mockCtx, mockReq, {})
  t.ok(result.log, 'should return log array')
  t.ok(result.summary, 'should return summary')
  t.ok(Array.isArray(result.log), 'log should be array')
  t.ok(result.summary.currentBtcPrice !== undefined, 'summary should have currentBtcPrice')
  if (result.log.length > 0) {
    const entry = result.log[0]
    t.ok(entry.revenueBTC !== undefined, 'entry should have revenueBTC')
    t.ok(entry.feesBTC !== undefined, 'entry should have feesBTC')
    t.ok(entry.revenueUSD !== undefined, 'entry should have revenueUSD')
    t.ok(entry.ebitdaSelling !== undefined, 'entry should have ebitdaSelling')
    t.ok(entry.ebitdaHodl !== undefined, 'entry should have ebitdaHodl')
    t.ok(entry.blockReward !== undefined, 'entry should have blockReward')
  }
  t.pass()
})

test('getRevenueSummary - missing start throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) },
    globalDataLib: { getGlobalData: async () => [] }
  }

  try {
    await getRevenueSummary(mockCtx, { query: { end: 1700100000000 } }, {})
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_START_END', 'should throw missing start/end error')
  }
  t.pass()
})

test('getRevenueSummary - invalid range throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) },
    globalDataLib: { getGlobalData: async () => [] }
  }

  try {
    await getRevenueSummary(mockCtx, { query: { start: 1700100000000, end: 1700000000000 } }, {})
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_INVALID_DATE_RANGE', 'should throw invalid range error')
  }
  t.pass()
})

test('getRevenueSummary - empty ork results', async (t) => {
  const mockCtx = {
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: { jRequest: async () => ({}) },
    globalDataLib: { getGlobalData: async () => [] }
  }

  const result = await getRevenueSummary(mockCtx, { query: { start: 1700000000000, end: 1700100000000 } }, {})
  t.ok(result.log, 'should return log array')
  t.is(result.log.length, 0, 'log should be empty')
  t.pass()
})

test('processRevenueTransactions - processes F2Pool data (changed_balance + tx_fee)', (t) => {
  const results = [
    [{ transactions: [{ created_at: 1700006400, changed_balance: 0.5, mining_extra: { tx_fee: 0.001 } }] }]
  ]

  const daily = processRevenueTransactions(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.ok(Object.keys(daily).length > 0, 'should have entries')
  const key = Object.keys(daily)[0]
  t.is(daily[key].revenueBTC, 0.5, 'should use changed_balance as revenue')
  t.is(daily[key].feesBTC, 0.001, 'should extract tx_fee from mining_extra')
  t.pass()
})

test('processRevenueTransactions - processes Ocean data (satoshis)', (t) => {
  const results = [
    [{ transactions: [{ ts: 1700006400, satoshis_net_earned: 50000000, fees_colected_satoshis: 1000000 }] }]
  ]

  const daily = processRevenueTransactions(results)
  t.ok(typeof daily === 'object', 'should return object')
  const key = Object.keys(daily)[0]
  t.is(daily[key].revenueBTC, 0.5, 'should convert sats to BTC')
  t.is(daily[key].feesBTC, 0.01, 'should convert fee sats to BTC')
  t.pass()
})

test('processRevenueTransactions - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const daily = processRevenueTransactions(results)
  t.is(Object.keys(daily).length, 0, 'should be empty for error results')
  t.pass()
})

test('processBlockData - processes valid block data', (t) => {
  const results = [
    [{ data: [{ ts: 1700006400000, blockReward: 6.25, blockTotalFees: 0.5 }] }]
  ]

  const daily = processBlockData(results)
  t.ok(Object.keys(daily).length > 0, 'should have entries')
  const key = Object.keys(daily)[0]
  t.is(daily[key].blockReward, 6.25, 'should extract blockReward')
  t.is(daily[key].blockTotalFees, 0.5, 'should extract blockTotalFees')
  t.pass()
})

test('processBlockData - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const daily = processBlockData(results)
  t.is(Object.keys(daily).length, 0, 'should be empty for error results')
  t.pass()
})

test('processBlockData - handles empty results', (t) => {
  const results = []
  const daily = processBlockData(results)
  t.is(Object.keys(daily).length, 0, 'should be empty')
  t.pass()
})

test('calculateRevenueSummarySummary - calculates from log entries', (t) => {
  const log = [
    {
      revenueBTC: 0.5,
      revenueUSD: 20000,
      feesBTC: 0.01,
      feesUSD: 400,
      totalCostsUSD: 5000,
      consumptionMWh: 100,
      ebitdaSelling: 15000,
      ebitdaHodl: 15000,
      btcPrice: 40000,
      curtailmentRate: 0.1,
      powerUtilization: 0.8
    },
    {
      revenueBTC: 0.3,
      revenueUSD: 12600,
      feesBTC: 0.005,
      feesUSD: 210,
      totalCostsUSD: 3000,
      consumptionMWh: 60,
      ebitdaSelling: 9600,
      ebitdaHodl: 9600,
      btcPrice: 42000,
      curtailmentRate: 0.15,
      powerUtilization: 0.85
    }
  ]

  const summary = calculateRevenueSummarySummary(log, 42000)
  t.is(summary.totalRevenueBTC, 0.8, 'should sum BTC revenue')
  t.is(summary.totalRevenueUSD, 32600, 'should sum USD revenue')
  t.is(summary.totalFeesBTC, 0.015, 'should sum fees BTC')
  t.is(summary.totalCostsUSD, 8000, 'should sum costs')
  t.is(summary.totalConsumptionMWh, 160, 'should sum consumption')
  t.is(summary.totalEbitdaSelling, 24600, 'should sum selling EBITDA')
  t.ok(summary.avgCostPerMWh !== null, 'should calculate avg cost per MWh')
  t.ok(summary.avgRevenuePerMWh !== null, 'should calculate avg revenue per MWh')
  t.ok(summary.avgBtcPrice !== null, 'should calculate avg BTC price')
  t.ok(summary.avgCurtailmentRate !== null, 'should calculate avg curtailment rate')
  t.ok(summary.avgPowerUtilization !== null, 'should calculate avg power utilization')
  t.is(summary.currentBtcPrice, 42000, 'should include current BTC price')
  t.pass()
})

test('calculateRevenueSummarySummary - handles empty log', (t) => {
  const summary = calculateRevenueSummarySummary([], 42000)
  t.is(summary.totalRevenueBTC, 0, 'should be zero')
  t.is(summary.totalRevenueUSD, 0, 'should be zero')
  t.is(summary.totalFeesBTC, 0, 'should be zero')
  t.is(summary.avgCostPerMWh, null, 'should be null')
  t.is(summary.currentBtcPrice, 42000, 'should include current price')
  t.pass()
})
