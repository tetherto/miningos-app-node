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

test('sumGroupedField - sums values for matching containers', (t) => {
  const grouped = { 'C-01': 100, 'C-02': 200, 'C-03': 300 }
  t.is(sumGroupedField(grouped, ['C-01', 'C-03']), 400, 'should sum matching containers')
  t.pass()
})

test('sumGroupedField - returns 0 for non-matching containers', (t) => {
  const grouped = { 'C-01': 100 }
  t.is(sumGroupedField(grouped, ['C-99']), 0, 'should return 0 for missing containers')
  t.pass()
})

test('sumGroupedField - handles null/undefined input', (t) => {
  t.is(sumGroupedField(null, ['C-01']), 0, 'null returns 0')
  t.is(sumGroupedField(undefined, ['C-01']), 0, 'undefined returns 0')
  t.pass()
})

// ==================== composeGroupStats Tests ====================

test('composeGroupStats - aggregates container-grouped data across orks', (t) => {
  const results = [
    [
      [{
        hashrate_mhs_1m_container_group_sum_aggr: { 'C-01': 50000, 'C-02': 30000 },
        power_w_container_group_sum_aggr: { 'C-01': 5000, 'C-02': 3000 },
        power_mode_low_cnt: { 'C-01': 2, 'C-02': 1 },
        power_mode_normal_cnt: { 'C-01': 5, 'C-02': 4 },
        power_mode_high_cnt: { 'C-01': 3, 'C-02': 3 },
        offline_cnt: { 'C-01': 1, 'C-02': 0 },
        error_cnt: { 'C-01': 0, 'C-02': 1 },
        not_mining_cnt: { 'C-01': 0, 'C-02': 0 },
        power_mode_sleep_cnt: { 'C-01': 1, 'C-02': 0 }
      }]
    ]
  ]

  const stats = composeGroupStats(results, ['C-01', 'C-02'])
  t.is(stats.hashrateMhs, 80000, 'should sum hashrate for both containers')
  t.is(stats.powerW, 8000, 'should sum power for both containers')
  t.is(stats.onlineCount, 18, 'should sum online miners (low+normal+high)')
  t.is(stats.minerCount, 21, 'should sum all miners across all statuses')
  t.ok(typeof stats.efficiency === 'number', 'should have efficiency')
  t.pass()
})

test('composeGroupStats - filters to requested containers only', (t) => {
  const results = [
    [
      [{
        hashrate_mhs_1m_container_group_sum_aggr: { 'C-01': 50000, 'C-02': 30000, 'C-03': 20000 },
        power_w_container_group_sum_aggr: { 'C-01': 5000, 'C-02': 3000, 'C-03': 2000 },
        power_mode_normal_cnt: { 'C-01': 10, 'C-02': 8, 'C-03': 6 },
        power_mode_low_cnt: {},
        power_mode_high_cnt: {},
        offline_cnt: {},
        error_cnt: {},
        not_mining_cnt: {},
        power_mode_sleep_cnt: {}
      }]
    ]
  ]

  const stats = composeGroupStats(results, ['C-01'])
  t.is(stats.hashrateMhs, 50000, 'should only include C-01 hashrate')
  t.is(stats.powerW, 5000, 'should only include C-01 power')
  t.is(stats.onlineCount, 10, 'should only include C-01 miners')
  t.pass()
})

test('composeGroupStats - empty results', (t) => {
  const stats = composeGroupStats([], ['C-01'])
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
        hashrate_mhs_1m_container_group_sum_aggr: { 'C-01': 0 },
        power_w_container_group_sum_aggr: { 'C-01': 5000 },
        power_mode_low_cnt: {},
        power_mode_normal_cnt: {},
        power_mode_high_cnt: {},
        offline_cnt: { 'C-01': 2 },
        error_cnt: {},
        not_mining_cnt: {},
        power_mode_sleep_cnt: {}
      }]
    ]
  ]

  const stats = composeGroupStats(results, ['C-01'])
  t.is(stats.efficiency, 0, 'efficiency should be 0 with zero hashrate')
  t.pass()
})

test('composeGroupStats - handles missing fields gracefully', (t) => {
  const results = [
    [
      [{}]
    ]
  ]

  const stats = composeGroupStats(results, ['C-01'])
  t.is(stats.hashrateMhs, 0, 'missing fields default to 0')
  t.is(stats.powerW, 0, 'missing power defaults to 0')
  t.pass()
})

test('composeGroupStats - multi-ork aggregation', (t) => {
  const results = [
    [
      [{
        hashrate_mhs_1m_container_group_sum_aggr: { 'C-01': 40000 },
        power_w_container_group_sum_aggr: { 'C-01': 4000 },
        power_mode_normal_cnt: { 'C-01': 8 },
        power_mode_low_cnt: {},
        power_mode_high_cnt: {},
        offline_cnt: { 'C-01': 1 },
        error_cnt: {},
        not_mining_cnt: {},
        power_mode_sleep_cnt: {}
      }]
    ],
    [
      [{
        hashrate_mhs_1m_container_group_sum_aggr: { 'C-01': 20000 },
        power_w_container_group_sum_aggr: { 'C-01': 2000 },
        power_mode_normal_cnt: { 'C-01': 4 },
        power_mode_low_cnt: {},
        power_mode_high_cnt: {},
        offline_cnt: {},
        error_cnt: {},
        not_mining_cnt: {},
        power_mode_sleep_cnt: {}
      }]
    ]
  ]

  const stats = composeGroupStats(results, ['C-01'])
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
            hashrate_mhs_1m_container_group_sum_aggr: { 'C-01': 60000, 'C-02': 40000 },
            power_w_container_group_sum_aggr: { 'C-01': 6000, 'C-02': 4000 },
            power_mode_normal_cnt: { 'C-01': 12, 'C-02': 8 },
            power_mode_low_cnt: {},
            power_mode_high_cnt: {},
            offline_cnt: { 'C-01': 1 },
            error_cnt: {},
            not_mining_cnt: {},
            power_mode_sleep_cnt: {}
          }]
        ]
      }
    }
  })

  const mockReq = { query: { containers: 'C-01,C-02' } }
  const result = await getGroupStats(mockCtx, mockReq)

  t.is(result.hashrateMhs, 100000, 'should have hashrate for both containers')
  t.is(result.powerW, 10000, 'should have power for both containers')
  t.is(result.minerCount, 21, 'should have miner count')
  t.is(result.onlineCount, 20, 'should have online count')
  t.ok(typeof result.efficiency === 'number', 'should have efficiency')
  t.pass()
})

test('getGroupStats - missing containers throws', async (t) => {
  const mockCtx = withDataProxy({
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  })

  try {
    await getGroupStats(mockCtx, { query: {} })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_CONTAINERS', 'should throw missing containers error')
  }
  t.pass()
})

test('getGroupStats - empty containers string throws', async (t) => {
  const mockCtx = withDataProxy({
    conf: { orks: [] },
    net_r0: { jRequest: async () => ({}) }
  })

  try {
    await getGroupStats(mockCtx, { query: { containers: '' } })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_CONTAINERS', 'should throw for empty containers')
  }
  t.pass()
})

test('getGroupStats - filters to requested containers', async (t) => {
  const mockCtx = withDataProxy({
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async () => {
        return [
          [{
            hashrate_mhs_1m_container_group_sum_aggr: { 'C-01': 50000, 'C-02': 30000, 'C-03': 20000 },
            power_w_container_group_sum_aggr: { 'C-01': 5000, 'C-02': 3000, 'C-03': 2000 },
            power_mode_normal_cnt: { 'C-01': 10, 'C-02': 8, 'C-03': 6 },
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

  const result = await getGroupStats(mockCtx, { query: { containers: 'C-01' } })
  t.is(result.hashrateMhs, 50000, 'should only include C-01 hashrate')
  t.is(result.powerW, 5000, 'should only include C-01 power')
  t.is(result.onlineCount, 10, 'should only include C-01 miners')
  t.pass()
})
