'use strict'

const test = require('brittle')
const {
  getGroupStats,
  composeGroupStats,
  extractKeyEntry
} = require('../../../workers/lib/server/handlers/groups.handlers')
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

// ==================== composeGroupStats Tests ====================

test('composeGroupStats - aggregates across orks', (t) => {
  const results = [
    [
      [{ hashrate_mhs_1m_sum_aggr: 50000, online_or_minor_error_miners_amount_aggr: 10, hashrate_mhs_1m_cnt_aggr: 12 }],
      [{ site_power_w: 5000 }]
    ],
    [
      [{ hashrate_mhs_1m_sum_aggr: 30000, online_or_minor_error_miners_amount_aggr: 8, hashrate_mhs_1m_cnt_aggr: 10 }],
      [{ site_power_w: 3000 }]
    ]
  ]

  const stats = composeGroupStats(results)
  t.is(stats.hashrateMhs, 80000, 'should sum hashrate')
  t.is(stats.powerW, 8000, 'should sum power')
  t.is(stats.minerCount, 22, 'should sum miner count')
  t.is(stats.onlineCount, 18, 'should sum online count')
  t.ok(typeof stats.efficiency === 'number', 'should have efficiency')
  t.pass()
})

test('composeGroupStats - empty results', (t) => {
  const stats = composeGroupStats([])
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
      [{ hashrate_mhs_1m_sum_aggr: 0, online_or_minor_error_miners_amount_aggr: 0, hashrate_mhs_1m_cnt_aggr: 0 }],
      [{ site_power_w: 5000 }]
    ]
  ]

  const stats = composeGroupStats(results)
  t.is(stats.efficiency, 0, 'efficiency should be 0 with zero hashrate')
  t.pass()
})

test('composeGroupStats - handles missing fields gracefully', (t) => {
  const results = [
    [
      [{}],
      [{}]
    ]
  ]

  const stats = composeGroupStats(results)
  t.is(stats.hashrateMhs, 0, 'missing fields default to 0')
  t.is(stats.powerW, 0, 'missing power defaults to 0')
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
          [{ hashrate_mhs_1m_sum_aggr: 100000, online_or_minor_error_miners_amount_aggr: 20, hashrate_mhs_1m_cnt_aggr: 25 }],
          [{ site_power_w: 10000 }]
        ]
      }
    }
  })

  const mockReq = { query: { racks: 'rack-0,rack-1' } }
  const result = await getGroupStats(mockCtx, mockReq)

  t.is(result.hashrateMhs, 100000, 'should have hashrate')
  t.is(result.powerW, 10000, 'should have power')
  t.is(result.minerCount, 25, 'should have miner count')
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

test('getGroupStats - multi-ork aggregation', async (t) => {
  const mockCtx = withDataProxy({
    conf: {
      orks: [{ rpcPublicKey: 'key1' }, { rpcPublicKey: 'key2' }]
    },
    net_r0: {
      jRequest: async (key) => {
        if (key === 'key1') {
          return [
            [{ hashrate_mhs_1m_sum_aggr: 50000, online_or_minor_error_miners_amount_aggr: 10, hashrate_mhs_1m_cnt_aggr: 12 }],
            [{ site_power_w: 5000 }]
          ]
        }
        return [
          [{ hashrate_mhs_1m_sum_aggr: 30000, online_or_minor_error_miners_amount_aggr: 8, hashrate_mhs_1m_cnt_aggr: 10 }],
          [{ site_power_w: 3000 }]
        ]
      }
    }
  })

  const result = await getGroupStats(mockCtx, { query: { racks: 'rack-0,rack-1,rack-2' } })
  t.is(result.hashrateMhs, 80000, 'should sum hashrate across orks')
  t.is(result.powerW, 8000, 'should sum power across orks')
  t.is(result.minerCount, 22, 'should sum miners across orks')
  t.is(result.onlineCount, 18, 'should sum online across orks')
  t.pass()
})
