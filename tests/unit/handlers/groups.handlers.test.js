'use strict'

const test = require('brittle')
const {
  getGroupStats,
  composeGroupStats,
  sumGroupedField
} = require('../../../workers/lib/server/handlers/groups.handlers')
const { extractKeyEntry } = require('../../../workers/lib/metrics.utils')
const { withDataProxy } = require('../helpers/mockHelpers')

// ==================== extractKeyEntry Tests ====================

test('extractKeyEntry - returns entry at index', (t) => {
  const orkResult = [[{ hashrate: 100 }], [{ power: 200 }]]
  const entry = extractKeyEntry(orkResult, 0)
  t.alike(entry, { hashrate: 100 }, 'should return first key entry')
  t.pass()
})

test('extractKeyEntry - returns null for non-array', (t) => {
  t.is(extractKeyEntry(null, 0), null, 'null input returns null')
  t.is(extractKeyEntry({}, 0), null, 'object input returns null')
  t.pass()
})

test('extractKeyEntry - returns null for empty key result', (t) => {
  t.is(extractKeyEntry([[]], 0), null, 'empty array returns null')
  t.is(extractKeyEntry([], 0), null, 'missing index returns null')
  t.pass()
})

// ==================== sumGroupedField Tests ====================

test('sumGroupedField - sums values for matching racks', (t) => {
  const grouped = { 'group-1': 100, 'group-2': 200, 'group-3': 300 }
  t.is(sumGroupedField(grouped, ['group-1', 'group-3']), 400, 'should sum matching racks')
  t.pass()
})

test('sumGroupedField - returns 0 for non-matching racks', (t) => {
  const grouped = { 'group-1': 100 }
  t.is(sumGroupedField(grouped, ['group-99']), 0, 'should return 0 for missing racks')
  t.pass()
})

test('sumGroupedField - handles null/undefined input', (t) => {
  t.is(sumGroupedField(null, ['group-1']), 0, 'null returns 0')
  t.is(sumGroupedField(undefined, ['group-1']), 0, 'undefined returns 0')
  t.pass()
})

// ==================== composeGroupStats Tests ====================

test('composeGroupStats - aggregates rack-grouped data across orks', (t) => {
  const results = [
    [
      [{
        hashrate_mhs_1m_container_group_sum_aggr: { 'group-1': 50000, 'group-2': 30000 },
        power_w_container_group_sum_aggr: { 'group-1': 5000, 'group-2': 3000 },
        power_mode_low_cnt: { 'group-1': 2, 'group-2': 1 },
        power_mode_normal_cnt: { 'group-1': 5, 'group-2': 4 },
        power_mode_high_cnt: { 'group-1': 3, 'group-2': 3 },
        offline_cnt: { 'group-1': 1, 'group-2': 0 },
        error_cnt: { 'group-1': 0, 'group-2': 1 },
        not_mining_cnt: { 'group-1': 0, 'group-2': 0 },
        power_mode_sleep_cnt: { 'group-1': 1, 'group-2': 0 }
      }]
    ]
  ]

  const stats = composeGroupStats(results, ['group-1', 'group-2'])
  t.is(stats.hashrateMhs, 80000, 'should sum hashrate for both racks')
  t.is(stats.powerW, 8000, 'should sum power for both racks')
  t.is(stats.onlineCount, 18, 'should sum online miners (low+normal+high)')
  t.is(stats.minerCount, 21, 'should sum all miners across all statuses')
  t.ok(typeof stats.efficiency === 'number', 'should have efficiency')
  t.pass()
})

test('composeGroupStats - filters to requested racks only', (t) => {
  const results = [
    [
      [{
        hashrate_mhs_1m_container_group_sum_aggr: { 'group-1': 50000, 'group-2': 30000, 'group-3': 20000 },
        power_w_container_group_sum_aggr: { 'group-1': 5000, 'group-2': 3000, 'group-3': 2000 },
        power_mode_normal_cnt: { 'group-1': 10, 'group-2': 8, 'group-3': 6 },
        power_mode_low_cnt: {},
        power_mode_high_cnt: {},
        offline_cnt: {},
        error_cnt: {},
        not_mining_cnt: {},
        power_mode_sleep_cnt: {}
      }]
    ]
  ]

  const stats = composeGroupStats(results, ['group-1'])
  t.is(stats.hashrateMhs, 50000, 'should only include group-1 hashrate')
  t.is(stats.powerW, 5000, 'should only include group-1 power')
  t.is(stats.onlineCount, 10, 'should only include group-1 miners')
  t.pass()
})

test('composeGroupStats - empty results', (t) => {
  const stats = composeGroupStats([], ['group-1'])
  t.is(stats.hashrateMhs, 0, 'hashrate should be 0')
  t.is(stats.powerW, 0, 'power should be 0')
  t.is(stats.minerCount, 0, 'miner count should be 0')
  t.is(stats.onlineCount, 0, 'online count should be 0')
  t.is(stats.efficiency, 0, 'efficiency should be 0 when no hashrate')
  t.pass()
})

test('composeGroupStats - zero hashrate gives zero efficiency', (t) => {
  const results = [
    [
      [{
        hashrate_mhs_1m_container_group_sum_aggr: { 'group-1': 0 },
        power_w_container_group_sum_aggr: { 'group-1': 5000 },
        power_mode_low_cnt: {},
        power_mode_normal_cnt: {},
        power_mode_high_cnt: {},
        offline_cnt: { 'group-1': 2 },
        error_cnt: {},
        not_mining_cnt: {},
        power_mode_sleep_cnt: {}
      }]
    ]
  ]

  const stats = composeGroupStats(results, ['group-1'])
  t.is(stats.efficiency, 0, 'efficiency should be 0 with zero hashrate')
  t.pass()
})

test('composeGroupStats - handles missing fields gracefully', (t) => {
  const results = [
    [
      [{}]
    ]
  ]

  const stats = composeGroupStats(results, ['group-1'])
  t.is(stats.hashrateMhs, 0, 'missing fields default to 0')
  t.is(stats.powerW, 0, 'missing power defaults to 0')
  t.pass()
})

test('composeGroupStats - multi-ork aggregation', (t) => {
  const results = [
    [
      [{
        hashrate_mhs_1m_container_group_sum_aggr: { 'group-1': 40000 },
        power_w_container_group_sum_aggr: { 'group-1': 4000 },
        power_mode_normal_cnt: { 'group-1': 8 },
        power_mode_low_cnt: {},
        power_mode_high_cnt: {},
        offline_cnt: { 'group-1': 1 },
        error_cnt: {},
        not_mining_cnt: {},
        power_mode_sleep_cnt: {}
      }]
    ],
    [
      [{
        hashrate_mhs_1m_container_group_sum_aggr: { 'group-1': 20000 },
        power_w_container_group_sum_aggr: { 'group-1': 2000 },
        power_mode_normal_cnt: { 'group-1': 4 },
        power_mode_low_cnt: {},
        power_mode_high_cnt: {},
        offline_cnt: {},
        error_cnt: {},
        not_mining_cnt: {},
        power_mode_sleep_cnt: {}
      }]
    ]
  ]

  const stats = composeGroupStats(results, ['group-1'])
  t.is(stats.hashrateMhs, 60000, 'should sum hashrate across orks')
  t.is(stats.powerW, 6000, 'should sum power across orks')
  t.is(stats.onlineCount, 12, 'should sum online across orks')
  t.is(stats.minerCount, 13, 'should sum all miners across orks')
  t.pass()
})

// ==================== getGroupStats Tests ====================

test('getGroupStats - happy path', async (t) => {
  const mockCtx = withDataProxy({
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async () => {
        return [
          [{
            hashrate_mhs_1m_container_group_sum_aggr: { 'group-1': 60000, 'group-2': 40000 },
            power_w_container_group_sum_aggr: { 'group-1': 6000, 'group-2': 4000 },
            power_mode_normal_cnt: { 'group-1': 12, 'group-2': 8 },
            power_mode_low_cnt: {},
            power_mode_high_cnt: {},
            offline_cnt: { 'group-1': 1 },
            error_cnt: {},
            not_mining_cnt: {},
            power_mode_sleep_cnt: {}
          }]
        ]
      }
    }
  })

  const mockReq = { query: { racks: 'group-1,group-2' } }
  const result = await getGroupStats(mockCtx, mockReq)

  t.is(result.hashrateMhs, 100000, 'should have hashrate for both racks')
  t.is(result.powerW, 10000, 'should have power for both racks')
  t.is(result.minerCount, 21, 'should have miner count')
  t.is(result.onlineCount, 20, 'should have online count')
  t.ok(typeof result.efficiency === 'number', 'should have efficiency')
  t.pass()
})

test('getGroupStats - missing racks throws', async (t) => {
  const mockCtx = withDataProxy({
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  })

  try {
    await getGroupStats(mockCtx, { query: {} })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_RACKS', 'should throw missing racks error')
  }
  t.pass()
})

test('getGroupStats - empty racks string throws', async (t) => {
  const mockCtx = withDataProxy({
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  })

  try {
    await getGroupStats(mockCtx, { query: { racks: '' } })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_RACKS', 'should throw for empty racks')
  }
  t.pass()
})

test('getGroupStats - filters to requested racks', async (t) => {
  const mockCtx = withDataProxy({
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async () => {
        return [
          [{
            hashrate_mhs_1m_container_group_sum_aggr: { 'group-1': 50000, 'group-2': 30000, 'group-3': 20000 },
            power_w_container_group_sum_aggr: { 'group-1': 5000, 'group-2': 3000, 'group-3': 2000 },
            power_mode_normal_cnt: { 'group-1': 10, 'group-2': 8, 'group-3': 6 },
            power_mode_low_cnt: {},
            power_mode_high_cnt: {},
            offline_cnt: {},
            error_cnt: {},
            not_mining_cnt: {},
            power_mode_sleep_cnt: {}
          }]
        ]
      }
    }
  })

  const result = await getGroupStats(mockCtx, { query: { racks: 'group-1' } })
  t.is(result.hashrateMhs, 50000, 'should only include group-1 hashrate')
  t.is(result.powerW, 5000, 'should only include group-1 power')
  t.is(result.onlineCount, 10, 'should only include group-1 miners')
  t.pass()
})
