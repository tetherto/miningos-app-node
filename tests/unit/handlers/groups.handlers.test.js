'use strict'

const test = require('brittle')
const {
  getGroupStats
} = require('../../../workers/lib/server/handlers/groups.handlers')

function createMockTailLogEntry () {
  return {
    hashrate_mhs_5m_pdu_rack_group_avg_aggr: {
      'group-1_rack-1': 5000000000,
      'group-1_rack-2': 4000000000,
      'group-2_rack-1': 3000000000,
      'group-2_rack-2': 6000000000
    },
    power_w_pdu_rack_group_sum_aggr: {
      'group-1_rack-1': 500000,
      'group-1_rack-2': 400000,
      'group-2_rack-1': 300000,
      'group-2_rack-2': 600000
    },
    efficiency_w_ths_pdu_rack_group_avg_aggr: {
      'group-1_rack-1': 6,
      'group-1_rack-2': 6,
      'group-2_rack-1': 6,
      'group-2_rack-2': 6
    }
  }
}

function createMockDcsThing () {
  return {
    id: 'dcs-1',
    type: 'wrk-dcs-siemens',
    tags: ['t-dcs'],
    last: {
      snap: {
        config: {
          mining: { total_groups: 2, racks_per_group: 2, miners_per_rack: 20 }
        }
      }
    }
  }
}

function createMockCtx ({ dcsEnabled = true, tailLogEntry = createMockTailLogEntry(), dcsThing = createMockDcsThing() } = {}) {
  return {
    conf: {
      featureConfig: dcsEnabled ? { centralDCSSetup: { enabled: true, tag: 't-dcs' } } : {}
    },
    dataProxy: {
      requestDataMap: async (method) => {
        if (method === 'tailLogMulti') return [[[tailLogEntry]]]
        if (method === 'listThings') return dcsEnabled ? [[dcsThing]] : [[]]
        return []
      }
    }
  }
}

test('getGroupStats - returns per-rack data matching PR #59 shape', async (t) => {
  const ctx = createMockCtx()
  const result = await getGroupStats(ctx, { query: { racks: 'group-1_rack-1,group-1_rack-2' } })

  t.is(result.totalCount, 2, 'two racks returned')
  t.is(result.data.length, 2)

  const [first, second] = result.data
  t.is(first.id, 'group-1_rack-1')
  t.is(first.name, 'Rack 1')
  t.alike(first.group, { id: 'group-1', name: 'Group 1' })
  t.is(first.miners_count, 20)
  t.is(first.hashrate.unit, 'PH/s')
  t.is(first.consumption.unit, 'kW')
  t.is(first.efficiency.unit, 'W/TH/s')
  t.ok(first.hashrate.value > 0, 'hashrate is positive')
  t.ok(first.consumption.value > 0, 'consumption is positive')
  t.ok(first.efficiency.value > 0, 'efficiency is positive')

  t.is(second.id, 'group-1_rack-2')
  t.pass()
})

test('getGroupStats - filters across groups', async (t) => {
  const ctx = createMockCtx()
  const result = await getGroupStats(ctx, { query: { racks: 'group-1_rack-1,group-2_rack-2' } })

  t.is(result.totalCount, 2)
  const ids = result.data.map(r => r.id)
  t.alike(ids, ['group-1_rack-1', 'group-2_rack-2'])
  t.pass()
})

test('getGroupStats - ignores unknown rack ids', async (t) => {
  const ctx = createMockCtx()
  const result = await getGroupStats(ctx, { query: { racks: 'group-1_rack-1,group-99_rack-99' } })

  t.is(result.totalCount, 1)
  t.is(result.data[0].id, 'group-1_rack-1')
  t.pass()
})

test('getGroupStats - missing racks throws', async (t) => {
  const ctx = createMockCtx()
  try {
    await getGroupStats(ctx, { query: {} })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_RACKS')
  }
  t.pass()
})

test('getGroupStats - empty racks string throws', async (t) => {
  const ctx = createMockCtx()
  try {
    await getGroupStats(ctx, { query: { racks: '' } })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_RACKS')
  }
  t.pass()
})

test('getGroupStats - returns empty data when DCS disabled', async (t) => {
  const ctx = createMockCtx({ dcsEnabled: false })
  const result = await getGroupStats(ctx, { query: { racks: 'group-1_rack-1' } })
  t.is(result.totalCount, 0, 'no racks without mining config')
  t.alike(result.data, [])
  t.pass()
})
