'use strict'

const test = require('brittle')
const {
  getHashrate,
  processHashrateData,
  calculateHashrateSummary,
  getConsumption,
  processConsumptionData,
  calculateConsumptionSummary,
  getEfficiency,
  processEfficiencyData,
  calculateEfficiencySummary,
  getMinerStatus,
  processMinerStatusData,
  calculateMinerStatusSummary,
  sumObjectValues
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

// ==================== Consumption Tests ====================

test('getConsumption - happy path', async (t) => {
  const dayTs = 1700006400000
  const mockCtx = {
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async () => {
        return [{ type: 'powermeter', data: [{ ts: dayTs, val: { site_power_w: 5000000 } }], error: null }]
      }
    }
  }

  const mockReq = {
    query: { start: 1700000000000, end: 1700100000000 }
  }

  const result = await getConsumption(mockCtx, mockReq)
  t.ok(result.log, 'should return log array')
  t.ok(result.summary, 'should return summary')
  t.ok(Array.isArray(result.log), 'log should be array')
  t.ok(result.log.length > 0, 'log should have entries')
  t.is(result.log[0].powerW, 5000000, 'should have power value')
  t.is(result.log[0].consumptionMWh, (5000000 * 24) / 1000000, 'should convert to MWh')
  t.ok(result.summary.avgPowerW !== null, 'should have avg power')
  t.ok(result.summary.totalConsumptionMWh > 0, 'should have total consumption')
  t.pass()
})

test('getConsumption - missing start throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  }

  try {
    await getConsumption(mockCtx, { query: { end: 1700100000000 } })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_START_END', 'should throw missing start/end error')
  }
  t.pass()
})

test('getConsumption - invalid range throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  }

  try {
    await getConsumption(mockCtx, { query: { start: 1700100000000, end: 1700000000000 } })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_INVALID_DATE_RANGE', 'should throw invalid range error')
  }
  t.pass()
})

test('getConsumption - empty ork results', async (t) => {
  const mockCtx = {
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: { jRequest: async () => ({}) }
  }

  const result = await getConsumption(mockCtx, { query: { start: 1700000000000, end: 1700100000000 } })
  t.ok(result.log, 'should return log array')
  t.is(result.log.length, 0, 'log should be empty with no data')
  t.is(result.summary.totalConsumptionMWh, 0, 'total should be zero')
  t.is(result.summary.avgPowerW, null, 'avg should be null')
  t.pass()
})

test('processConsumptionData - processes array data from ORK', (t) => {
  const results = [
    [{ type: 'powermeter', data: [{ ts: 1700006400000, val: { site_power_w: 5000 } }], error: null }]
  ]

  const daily = processConsumptionData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.ok(Object.keys(daily).length > 0, 'should have entries')
  const key = Object.keys(daily)[0]
  t.is(daily[key], 5000, 'should extract power from val')
  t.pass()
})

test('processConsumptionData - processes object-keyed data', (t) => {
  const results = [
    [{ data: { 1700006400000: { site_power_w: 5000 } } }]
  ]

  const daily = processConsumptionData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.ok(Object.keys(daily).length > 0, 'should have entries')
  t.pass()
})

test('processConsumptionData - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const daily = processConsumptionData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.is(Object.keys(daily).length, 0, 'should be empty for error results')
  t.pass()
})

test('processConsumptionData - aggregates multiple orks', (t) => {
  const results = [
    [{ data: { 1700006400000: { site_power_w: 3000 } } }],
    [{ data: { 1700006400000: { site_power_w: 2000 } } }]
  ]

  const daily = processConsumptionData(results)
  const key = Object.keys(daily)[0]
  t.is(daily[key], 5000, 'should sum power from multiple orks')
  t.pass()
})

test('calculateConsumptionSummary - calculates from log entries', (t) => {
  const log = [
    { ts: 1700006400000, powerW: 5000000, consumptionMWh: 120 },
    { ts: 1700092800000, powerW: 4000000, consumptionMWh: 96 }
  ]

  const summary = calculateConsumptionSummary(log)
  t.is(summary.totalConsumptionMWh, 216, 'should sum consumption')
  t.is(summary.avgPowerW, 4500000, 'should average power')
  t.pass()
})

test('calculateConsumptionSummary - handles empty log', (t) => {
  const summary = calculateConsumptionSummary([])
  t.is(summary.totalConsumptionMWh, 0, 'should be zero')
  t.is(summary.avgPowerW, null, 'should be null')
  t.pass()
})

// ==================== Efficiency Tests ====================

test('getEfficiency - happy path', async (t) => {
  const dayTs = 1700006400000
  const mockCtx = {
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async () => {
        return [{ type: 'miner', data: [{ ts: dayTs, val: { efficiency_w_ths_avg_aggr: 25.5 } }], error: null }]
      }
    }
  }

  const mockReq = {
    query: { start: 1700000000000, end: 1700100000000 }
  }

  const result = await getEfficiency(mockCtx, mockReq)
  t.ok(result.log, 'should return log array')
  t.ok(result.summary, 'should return summary')
  t.ok(Array.isArray(result.log), 'log should be array')
  t.ok(result.log.length > 0, 'log should have entries')
  t.is(result.log[0].efficiencyWThs, 25.5, 'should have efficiency value')
  t.ok(result.summary.avgEfficiencyWThs !== null, 'should have avg efficiency')
  t.pass()
})

test('getEfficiency - missing start throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  }

  try {
    await getEfficiency(mockCtx, { query: { end: 1700100000000 } })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_START_END', 'should throw missing start/end error')
  }
  t.pass()
})

test('getEfficiency - invalid range throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  }

  try {
    await getEfficiency(mockCtx, { query: { start: 1700100000000, end: 1700000000000 } })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_INVALID_DATE_RANGE', 'should throw invalid range error')
  }
  t.pass()
})

test('getEfficiency - empty ork results', async (t) => {
  const mockCtx = {
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: { jRequest: async () => ({}) }
  }

  const result = await getEfficiency(mockCtx, { query: { start: 1700000000000, end: 1700100000000 } })
  t.ok(result.log, 'should return log array')
  t.is(result.log.length, 0, 'log should be empty with no data')
  t.is(result.summary.avgEfficiencyWThs, null, 'avg should be null')
  t.pass()
})

test('processEfficiencyData - processes array data from ORK', (t) => {
  const results = [
    [{ type: 'miner', data: [{ ts: 1700006400000, val: { efficiency_w_ths_avg_aggr: 25.5 } }], error: null }]
  ]

  const daily = processEfficiencyData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.ok(Object.keys(daily).length > 0, 'should have entries')
  const key = Object.keys(daily)[0]
  t.is(daily[key].total, 25.5, 'should extract efficiency total')
  t.is(daily[key].count, 1, 'should track count')
  t.pass()
})

test('processEfficiencyData - processes object-keyed data', (t) => {
  const results = [
    [{ data: { 1700006400000: { efficiency_w_ths_avg_aggr: 25.5 } } }]
  ]

  const daily = processEfficiencyData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.ok(Object.keys(daily).length > 0, 'should have entries')
  t.pass()
})

test('processEfficiencyData - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const daily = processEfficiencyData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.is(Object.keys(daily).length, 0, 'should be empty for error results')
  t.pass()
})

test('processEfficiencyData - averages across multiple orks', (t) => {
  const results = [
    [{ data: { 1700006400000: { efficiency_w_ths_avg_aggr: 20 } } }],
    [{ data: { 1700006400000: { efficiency_w_ths_avg_aggr: 30 } } }]
  ]

  const daily = processEfficiencyData(results)
  const key = Object.keys(daily)[0]
  t.is(daily[key].total, 50, 'should sum efficiency totals')
  t.is(daily[key].count, 2, 'should track count from multiple orks')
  t.pass()
})

test('calculateEfficiencySummary - calculates from log entries', (t) => {
  const log = [
    { ts: 1700006400000, efficiencyWThs: 25 },
    { ts: 1700092800000, efficiencyWThs: 27 }
  ]

  const summary = calculateEfficiencySummary(log)
  t.is(summary.avgEfficiencyWThs, 26, 'should average efficiency')
  t.pass()
})

test('calculateEfficiencySummary - handles empty log', (t) => {
  const summary = calculateEfficiencySummary([])
  t.is(summary.avgEfficiencyWThs, null, 'should be null')
  t.pass()
})

// ==================== Miner Status Tests ====================

test('sumObjectValues - sums keyed object values', (t) => {
  t.is(sumObjectValues({ a: 5, b: 3, c: 2 }), 10, 'should sum all values')
  t.is(sumObjectValues({}), 0, 'should return 0 for empty object')
  t.is(sumObjectValues(null), 0, 'should return 0 for null')
  t.is(sumObjectValues(undefined), 0, 'should return 0 for undefined')
  t.is(sumObjectValues({ a: 'not_a_number', b: 5 }), 5, 'should skip non-numeric values')
  t.pass()
})

test('getMinerStatus - happy path', async (t) => {
  const dayTs = 1700006400000
  const mockCtx = {
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async () => {
        return [{
          ts: dayTs,
          total_cnt: 100,
          offline_cnt: { offl_hashboard: 5, offl_fan: 3 },
          power_mode_sleep_cnt: { sleep: 10 },
          maintenance_type_cnt: { repair: 2 }
        }]
      }
    }
  }

  const mockReq = {
    query: { start: 1700000000000, end: 1700100000000 }
  }

  const result = await getMinerStatus(mockCtx, mockReq)
  t.ok(result.log, 'should return log array')
  t.ok(result.summary, 'should return summary')
  t.ok(Array.isArray(result.log), 'log should be array')
  t.ok(result.log.length > 0, 'log should have entries')
  t.is(result.log[0].offline, 8, 'should sum offline counts (5+3)')
  t.is(result.log[0].sleep, 10, 'should sum sleep counts')
  t.is(result.log[0].maintenance, 2, 'should sum maintenance counts')
  t.is(result.log[0].online, 80, 'should derive online (100-8-10-2)')
  t.pass()
})

test('getMinerStatus - missing start throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  }

  try {
    await getMinerStatus(mockCtx, { query: { end: 1700100000000 } })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_START_END', 'should throw missing start/end error')
  }
  t.pass()
})

test('getMinerStatus - invalid range throws', async (t) => {
  const mockCtx = {
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  }

  try {
    await getMinerStatus(mockCtx, { query: { start: 1700100000000, end: 1700000000000 } })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_INVALID_DATE_RANGE', 'should throw invalid range error')
  }
  t.pass()
})

test('getMinerStatus - empty ork results', async (t) => {
  const mockCtx = {
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: { jRequest: async () => ({}) }
  }

  const result = await getMinerStatus(mockCtx, { query: { start: 1700000000000, end: 1700100000000 } })
  t.ok(result.log, 'should return log array')
  t.is(result.log.length, 0, 'log should be empty with no data')
  t.is(result.summary.avgOnline, null, 'avg online should be null')
  t.is(result.summary.avgOffline, null, 'avg offline should be null')
  t.pass()
})

test('processMinerStatusData - processes daily entries', (t) => {
  const results = [[
    {
      ts: 1700006400000,
      total_cnt: 100,
      offline_cnt: { offl_hashboard: 5 },
      power_mode_sleep_cnt: { sleep: 10 },
      maintenance_type_cnt: { repair: 2 }
    }
  ]]

  const daily = processMinerStatusData(results)
  t.ok(typeof daily === 'object', 'should return object')
  const key = Object.keys(daily)[0]
  t.is(daily[key].offline, 5, 'should extract offline count')
  t.is(daily[key].sleep, 10, 'should extract sleep count')
  t.is(daily[key].maintenance, 2, 'should extract maintenance count')
  t.is(daily[key].online, 83, 'should derive online count (100-5-10-2)')
  t.pass()
})

test('processMinerStatusData - handles error results', (t) => {
  const results = [{ error: 'timeout' }]
  const daily = processMinerStatusData(results)
  t.ok(typeof daily === 'object', 'should return object')
  t.is(Object.keys(daily).length, 0, 'should be empty for error results')
  t.pass()
})

test('processMinerStatusData - aggregates multiple orks same day', (t) => {
  const results = [
    [{
      ts: 1700006400000,
      total_cnt: 50,
      offline_cnt: { offl_fan: 3 },
      power_mode_sleep_cnt: { sleep: 5 },
      maintenance_type_cnt: {}
    }],
    [{
      ts: 1700006400000,
      total_cnt: 50,
      offline_cnt: { offl_hashboard: 2 },
      power_mode_sleep_cnt: {},
      maintenance_type_cnt: { repair: 1 }
    }]
  ]

  const daily = processMinerStatusData(results)
  const key = Object.keys(daily)[0]
  t.is(daily[key].offline, 5, 'should sum offline across orks (3+2)')
  t.is(daily[key].sleep, 5, 'should sum sleep across orks')
  t.is(daily[key].maintenance, 1, 'should sum maintenance across orks')
  t.is(daily[key].online, 89, 'should derive total online (47+42)')
  t.pass()
})

test('processMinerStatusData - handles entries with aggrFields wrapper', (t) => {
  const results = [[
    {
      ts: 1700006400000,
      total_cnt: 100,
      aggrFields: {
        offline_cnt: { offl_hashboard: 10 },
        power_mode_sleep_cnt: { sleep: 5 },
        maintenance_type_cnt: { repair: 3 }
      }
    }
  ]]

  const daily = processMinerStatusData(results)
  const key = Object.keys(daily)[0]
  t.is(daily[key].offline, 10, 'should extract from aggrFields wrapper')
  t.is(daily[key].sleep, 5, 'should extract sleep from aggrFields')
  t.is(daily[key].maintenance, 3, 'should extract maintenance from aggrFields')
  t.pass()
})

test('calculateMinerStatusSummary - calculates from log entries', (t) => {
  const log = [
    { ts: 1700006400000, online: 80, offline: 10, sleep: 5, maintenance: 5 },
    { ts: 1700092800000, online: 85, offline: 8, sleep: 4, maintenance: 3 }
  ]

  const summary = calculateMinerStatusSummary(log)
  t.is(summary.avgOnline, 82.5, 'should average online')
  t.is(summary.avgOffline, 9, 'should average offline')
  t.is(summary.avgSleep, 4.5, 'should average sleep')
  t.is(summary.avgMaintenance, 4, 'should average maintenance')
  t.pass()
})

test('calculateMinerStatusSummary - handles empty log', (t) => {
  const summary = calculateMinerStatusSummary([])
  t.is(summary.avgOnline, null, 'should be null')
  t.is(summary.avgOffline, null, 'should be null')
  t.is(summary.avgSleep, null, 'should be null')
  t.is(summary.avgMaintenance, null, 'should be null')
  t.pass()
})
