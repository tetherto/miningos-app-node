'use strict'

const test = require('brittle')
const {
  getSitePowerConsumption,
  getChartType,
  removeContainerPrefix,
  getPowerBEAttribute,
  getByPath,
  buildConsumptionLog,
  computeConsumptionSummary
} = require('../../../workers/lib/server/handlers/power.consumption.handlers')
const { withDataProxy } = require('../helpers/mockHelpers')

// Build a mock ctx whose RPC layer branches by method. `tailLog` returns the
// given points array (single site); `listThings` returns the given things array.
const buildCtx = ({ tailLogPoints = [], listThings = [], onTailLog } = {}) => {
  return withDataProxy({
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: {
      jRequest: async (key, method, payload) => {
        if (method === 'tailLog') {
          if (onTailLog) onTailLog(payload)
          return tailLogPoints
        }
        if (method === 'listThings') return listThings
        return []
      }
    }
  })
}

const RANGE = { start: 1700000000000, end: 1700100000000 }

// ==================== Pure helper tests ====================

test('getChartType - resolves type from tag', (t) => {
  t.is(getChartType('t-miner'), 'miner', 'miner tag -> miner')
  t.is(getChartType('t-powermeter'), 'powermeter', 'powermeter tag -> powermeter (t- stripped)')
  t.is(getChartType('container-9a'), 'container', 'container tag -> container')
  t.pass()
})

test('removeContainerPrefix - strips leading container- only', (t) => {
  t.is(removeContainerPrefix('container-9a'), '9a', 'strips container- prefix')
  t.is(removeContainerPrefix('t-powermeter'), 't-powermeter', 'leaves non-matching unchanged')
  t.pass()
})

test('getPowerBEAttribute - mirrors the UI conditional', (t) => {
  t.is(getPowerBEAttribute('t-miner'), 'power_w_sum_aggr', 'miner -> power_w_sum_aggr')
  t.is(getPowerBEAttribute('t-powermeter'), 'site_power_w', 'powermeter -> site_power_w')
  t.is(getPowerBEAttribute('container-9a'), 'container_power_w_aggr.9a', 'container -> nested attr')
  t.is(getPowerBEAttribute('t-miner', true), 'transformer_power_w', 'transformer flag -> transformer_power_w')
  t.pass()
})

test('getByPath - reads dotted paths', (t) => {
  t.is(getByPath({ a: { b: 5 } }, 'a.b'), 5, 'nested value')
  t.is(getByPath({ container_power_w_aggr: { '9a': 42 } }, 'container_power_w_aggr.9a'), 42, 'aggr path')
  t.is(getByPath(null, 'a.b'), undefined, 'null object -> undefined')
  t.is(getByPath({ a: 1 }, 'a.b'), undefined, 'missing nested -> undefined')
  t.pass()
})

test('computeConsumptionSummary - raw min/max/avg with static unit', (t) => {
  const points = [
    { ts: 1, power_w_sum_aggr: 1000 },
    { ts: 2, power_w_sum_aggr: 3000 },
    { ts: 3, power_w_sum_aggr: 2000 }
  ]
  const summary = computeConsumptionSummary(points, 'power_w_sum_aggr')
  t.is(summary.min.value, 1000, 'min over raw values')
  t.is(summary.max.value, 3000, 'max over raw values')
  t.is(summary.avg.value, 2000, 'avg = total / count')
  t.is(summary.min.unit, 'W', 'static unit on min')
  t.is(summary.avg.unit, 'W', 'static unit on avg')
  t.pass()
})

test('computeConsumptionSummary - empty range yields null min/max/avg', (t) => {
  const summary = computeConsumptionSummary([], 'power_w_sum_aggr')
  t.is(summary.min.value, null, 'min null on empty')
  t.is(summary.max.value, null, 'max null on empty')
  t.is(summary.avg.value, null, 'avg null on empty')
  t.is(summary.avg.unit, 'W', 'unit still present on empty')
  t.pass()
})

test('computeConsumptionSummary - missing attribute counts as 0', (t) => {
  const points = [
    { ts: 1, power_w_sum_aggr: 4000 },
    { ts: 2 }, // missing attribute -> 0
    { ts: 3, power_w_sum_aggr: 2000 }
  ]
  const summary = computeConsumptionSummary(points, 'power_w_sum_aggr')
  t.is(summary.min.value, 0, 'missing point pulls min to 0')
  t.is(summary.max.value, 4000, 'max unaffected')
  t.is(summary.avg.value, 2000, 'avg = (4000+0+2000)/3')
  t.pass()
})

test('buildConsumptionLog - maps points to ts/value/unit', (t) => {
  const points = [{ ts: 1, power_w_sum_aggr: 1000 }, { ts: 2 }]
  const log = buildConsumptionLog(points, 'power_w_sum_aggr')
  t.alike(log, [
    { ts: 1, value: 1000, unit: 'W' },
    { ts: 2, value: 0, unit: 'W' }
  ], 'missing value falls back to 0')
  t.pass()
})

// ==================== Handler happy paths ====================

test('getSitePowerConsumption - miner happy path (power_w_sum_aggr)', async (t) => {
  let captured = null
  const ctx = buildCtx({
    tailLogPoints: [
      { ts: 1, power_w_sum_aggr: 1000 },
      { ts: 2, power_w_sum_aggr: 3000 },
      { ts: 3, power_w_sum_aggr: 2000 }
    ],
    onTailLog: (payload) => { captured = payload }
  })

  const result = await getSitePowerConsumption(ctx, {
    query: { ...RANGE, tag: 't-miner', interval: '1m' }
  })

  // request shape mirrors the UI's tail-log fetch
  t.is(captured.key, 'stat-1m', 'builds stat-<interval> key')
  t.is(captured.type, 'miner', 'derives type from tag')
  t.is(captured.tag, 't-miner', 'passes tag through')
  t.is(captured.aggrFields.power_w_sum_aggr, 1, 'requests power_w_sum_aggr')
  t.is(captured.aggrFields.site_power_w, 1, 'sends all four aggr fields like the UI')
  t.is(captured.fields['last.snap.stats.power_w'], 1, 'requests power_w field')

  t.is(result.log.length, 3, 'one log point per entry')
  t.alike(result.log[0], { ts: 1, value: 1000, unit: 'W' }, 'first point mapped')
  t.is(result.summary.min.value, 1000, 'min')
  t.is(result.summary.max.value, 3000, 'max')
  t.is(result.summary.avg.value, 2000, 'avg')
  t.is(result.summary.current.value, 2000, 'current = last point value for miner')
  t.is(result.summary.current.unit, 'W', 'current has static unit')
  t.pass()
})

test('getSitePowerConsumption - powermeter pulls current from list-things', async (t) => {
  let listThingsCalled = false
  const ctx = withDataProxy({
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: {
      jRequest: async (key, method) => {
        if (method === 'tailLog') {
          return [
            { ts: 1, site_power_w: 5000 },
            { ts: 2, site_power_w: 7000 }
          ]
        }
        if (method === 'listThings') {
          listThingsCalled = true
          return [{ id: 'pm1', last: { snap: { stats: { power_w: 9999 } } } }]
        }
        return []
      }
    }
  })

  const result = await getSitePowerConsumption(ctx, {
    query: { ...RANGE, tag: 't-powermeter', interval: '5m' }
  })

  t.ok(listThingsCalled, 'fetches the conditional site power-meter source')
  t.is(result.summary.min.value, 5000, 'min over site_power_w')
  t.is(result.summary.max.value, 7000, 'max over site_power_w')
  t.is(result.summary.avg.value, 6000, 'avg over site_power_w')
  t.is(result.summary.current.value, 9999, 'current = live site power-meter value, not last point')
  t.pass()
})

test('getSitePowerConsumption - miner branch does NOT call list-things', async (t) => {
  let listThingsCalled = false
  const ctx = withDataProxy({
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: {
      jRequest: async (key, method) => {
        if (method === 'tailLog') return [{ ts: 1, power_w_sum_aggr: 1234 }]
        if (method === 'listThings') { listThingsCalled = true; return [] }
        return []
      }
    }
  })

  const result = await getSitePowerConsumption(ctx, { query: { ...RANGE, tag: 't-miner' } })

  t.absent(listThingsCalled, 'no conditional source fetch for non-powermeter tags')
  t.is(result.summary.current.value, 1234, 'current = last point value')
  t.pass()
})

test('getSitePowerConsumption - container uses nested attribute', async (t) => {
  const ctx = buildCtx({
    tailLogPoints: [
      { ts: 1, container_power_w_aggr: { '9a': 100 } },
      { ts: 2, container_power_w_aggr: { '9a': 300 } }
    ]
  })

  const result = await getSitePowerConsumption(ctx, {
    query: { ...RANGE, tag: 'container-9a' }
  })

  t.is(result.log[0].value, 100, 'reads container_power_w_aggr.9a')
  t.is(result.summary.max.value, 300, 'max over nested values')
  t.is(result.summary.current.value, 300, 'current = last nested value')
  t.pass()
})

test('getSitePowerConsumption - transformer flag selects transformer_power_w', async (t) => {
  const ctx = buildCtx({
    tailLogPoints: [{ ts: 1, transformer_power_w: 8000 }]
  })

  const result = await getSitePowerConsumption(ctx, {
    query: { ...RANGE, tag: 't-miner', totalTransformerConsumption: true }
  })

  t.is(result.log[0].value, 8000, 'reads transformer_power_w when flagged')
  t.is(result.summary.avg.value, 8000, 'avg over transformer values')
  t.pass()
})

test('getSitePowerConsumption - powerAttribute query param overrides selection', async (t) => {
  const ctx = buildCtx({
    tailLogPoints: [{ ts: 1, my_custom_attr: 555, power_w_sum_aggr: 111 }]
  })

  const result = await getSitePowerConsumption(ctx, {
    query: { ...RANGE, tag: 't-miner', powerAttribute: 'my_custom_attr' }
  })

  t.is(result.log[0].value, 555, 'uses the override attribute')
  t.pass()
})

// ==================== Edge cases ====================

test('getSitePowerConsumption - empty range', async (t) => {
  const ctx = buildCtx({ tailLogPoints: [] })

  const result = await getSitePowerConsumption(ctx, { query: { ...RANGE, tag: 't-miner' } })

  t.is(result.log.length, 0, 'empty log')
  t.is(result.summary.min.value, null, 'min null')
  t.is(result.summary.max.value, null, 'max null')
  t.is(result.summary.avg.value, null, 'avg null')
  t.is(result.summary.current.value, 0, 'current defaults to 0 when no points')
  t.pass()
})

test('getSitePowerConsumption - non-array RPC result is treated as empty', async (t) => {
  const ctx = withDataProxy({
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: { jRequest: async () => ({}) }
  })

  const result = await getSitePowerConsumption(ctx, { query: { ...RANGE, tag: 't-miner' } })

  t.is(result.log.length, 0, 'empty log on malformed result')
  t.is(result.summary.avg.value, null, 'avg null on malformed result')
  t.pass()
})

test('getSitePowerConsumption - powermeter with missing power-meter -> current 0', async (t) => {
  const ctx = withDataProxy({
    conf: { orks: [{ rpcPublicKey: 'key1' }] },
    net_r0: {
      jRequest: async (key, method) => {
        if (method === 'tailLog') return [{ ts: 1, site_power_w: 4200 }]
        if (method === 'listThings') return [] // no site power meter found
        return []
      }
    }
  })

  const result = await getSitePowerConsumption(ctx, { query: { ...RANGE, tag: 't-powermeter' } })

  t.is(result.summary.current.value, 0, 'current falls back to 0 when no power meter present')
  t.is(result.summary.max.value, 4200, 'log/summary still computed from tail-log')
  t.pass()
})

test('getSitePowerConsumption - missing start throws', async (t) => {
  const ctx = buildCtx({})
  try {
    await getSitePowerConsumption(ctx, { query: { end: RANGE.end, tag: 't-miner' } })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_MISSING_START_END', 'throws missing start/end')
  }
  t.pass()
})

test('getSitePowerConsumption - invalid range throws', async (t) => {
  const ctx = buildCtx({})
  try {
    await getSitePowerConsumption(ctx, { query: { start: RANGE.end, end: RANGE.start } })
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_INVALID_DATE_RANGE', 'throws invalid range')
  }
  t.pass()
})

// ==================== Parity with the UI's combining logic ====================

test('getSitePowerConsumption - matches getConsumptionGraphData min/max/avg', async (t) => {
  const points = [
    { ts: 1, power_w_sum_aggr: 1500 },
    { ts: 2, power_w_sum_aggr: 4200 },
    { ts: 3, power_w_sum_aggr: 0 },
    { ts: 4, power_w_sum_aggr: 3300 }
  ]
  const attr = 'power_w_sum_aggr'

  // Replica of the raw (pre-format) arithmetic in ConsumptionLineChart's
  // getConsumptionGraphData.
  let totalAvgConsumption = 0
  let minConsumption = Number.MAX_SAFE_INTEGER
  let maxConsumption = Number.MIN_SAFE_INTEGER
  const expectedLog = []
  points.forEach((entry) => {
    const sum = entry[attr] || 0
    expectedLog.push({ ts: entry.ts, value: sum, unit: 'W' })
    totalAvgConsumption += sum
    if (sum < minConsumption) minConsumption = sum
    if (sum > maxConsumption) maxConsumption = sum
  })
  const expectedAvg = totalAvgConsumption / (points.length || 1)

  const ctx = buildCtx({ tailLogPoints: points })
  const result = await getSitePowerConsumption(ctx, { query: { ...RANGE, tag: 't-miner' } })

  t.alike(result.log, expectedLog, 'log points match the UI mapping')
  t.is(result.summary.min.value, minConsumption, 'min matches UI')
  t.is(result.summary.max.value, maxConsumption, 'max matches UI')
  t.is(result.summary.avg.value, expectedAvg, 'avg matches UI')
  t.pass()
})

// ==================== Central DCS branch ====================

// Mock ctx with centralDCSSetup enabled. jRequest branches by method:
// listThings -> the DCS thing; tailLog -> the site_power_w stat series.
const buildDcsCtx = ({ tailLogPoints = [], dcsThing = null, onTailLog, tag = 't-dcs', tailLogThrows = false } = {}) => {
  return withDataProxy({
    conf: {
      orks: [{ rpcPublicKey: 'key1' }],
      featureConfig: { centralDCSSetup: { enabled: true, tag } }
    },
    net_r0: {
      jRequest: async (key, method, payload) => {
        if (method === 'listThings') return dcsThing ? [dcsThing] : []
        if (method === 'tailLog') {
          if (onTailLog) onTailLog(payload)
          if (tailLogThrows) throw new Error('ERR_TYPE_AGGR_INVALID')
          return tailLogPoints
        }
        return []
      }
    }
  })
}

const makeDcsThing = (siteKw) => ({
  type: 'dcs-siemens',
  last: {
    snap: {
      stats: {
        dcs_specific: {
          equipment: {
            power_meters: [
              { equipment: 'PM-RACK-1', role: 'rack', power: { value: 50, unit: 'kW' } },
              { equipment: 'PM-MV', role: 'site_main', power: { value: siteKw, unit: 'kW' } }
            ]
          }
        }
      }
    }
  }
})

test('getSitePowerConsumption - centralDCS: history from site_power_w tail-log, current from DCS snapshot', async (t) => {
  let captured = null
  const ctx = buildDcsCtx({
    dcsThing: makeDcsThing(16700), // 16700 kW
    tailLogPoints: [
      { ts: 1, site_power_w: 16000000 },
      { ts: 2, site_power_w: 17000000 },
      { ts: 3, site_power_w: 16500000 }
    ],
    onTailLog: (p) => { captured = p }
  })

  const result = await getSitePowerConsumption(ctx, {
    query: { ...RANGE, tag: 't-powermeter', interval: '5m' }
  })

  // queries the DCS thing's tail-log stat
  t.is(captured.key, 'stat-5m', 'builds stat-<interval> key')
  t.is(captured.type, 'dcs-siemens', 'routes by the DCS thing type')
  t.is(captured.tag, 't-dcs', 'uses the configured DCS tag')
  t.is(captured.aggrFields.site_power_w, 1, 'requests the site_power_w stat')

  t.is(result.log.length, 3, 'history sourced from DCS tail-log')
  t.alike(result.log[0], { ts: 1, value: 16000000, unit: 'W' }, 'watts log point')
  t.is(result.summary.min.value, 16000000, 'min')
  t.is(result.summary.max.value, 17000000, 'max')
  t.is(result.summary.avg.value, 16500000, 'avg')
  t.is(result.summary.current.value, 16700 * 1000, 'current = DCS site_main kW*1000')
  t.is(result.summary.current.unit, 'W', 'normalized to watts')
  t.pass()
})

test('getSitePowerConsumption - centralDCS: tail-log error degrades to current-only', async (t) => {
  const ctx = buildDcsCtx({ dcsThing: makeDcsThing(15000), tailLogThrows: true })

  const result = await getSitePowerConsumption(ctx, { query: { ...RANGE, tag: 't-powermeter' } })

  t.is(result.log.length, 0, 'empty log when DCS tail-log not yet available')
  t.is(result.summary.min.value, null, 'min null')
  t.is(result.summary.avg.value, null, 'avg null')
  t.is(result.summary.current.value, 15000 * 1000, 'current still from DCS snapshot')
  t.pass()
})

test('getSitePowerConsumption - centralDCS: empty tail-log -> current-only', async (t) => {
  const ctx = buildDcsCtx({ dcsThing: makeDcsThing(0), tailLogPoints: [] })

  const result = await getSitePowerConsumption(ctx, { query: { ...RANGE, tag: 't-powermeter' } })

  t.is(result.log.length, 0, 'empty log')
  t.is(result.summary.avg.value, null, 'avg null')
  t.is(result.summary.current.value, 0, 'no site_main value -> 0')
  t.pass()
})

test('getSitePowerConsumption - centralDCS does not affect miner tag', async (t) => {
  let listThingsCalled = false
  const ctx = withDataProxy({
    conf: {
      orks: [{ rpcPublicKey: 'key1' }],
      featureConfig: { centralDCSSetup: { enabled: true, tag: 't-dcs' } }
    },
    net_r0: {
      jRequest: async (key, method) => {
        if (method === 'tailLog') return [{ ts: 1, power_w_sum_aggr: 4321 }]
        if (method === 'listThings') { listThingsCalled = true; return [] }
        return []
      }
    }
  })

  const result = await getSitePowerConsumption(ctx, { query: { ...RANGE, tag: 't-miner' } })

  t.is(result.log[0].value, 4321, 'miner path unaffected by centralDCS')
  t.is(result.summary.current.value, 4321, 'current = last miner point')
  t.absent(listThingsCalled, 'no DCS/list-things fetch for the miner tag')
  t.pass()
})

test('getSitePowerConsumption - centralDCS disabled: powermeter uses legacy site_power_w path', async (t) => {
  const ctx = withDataProxy({
    conf: { orks: [{ rpcPublicKey: 'key1' }] }, // no centralDCSSetup
    net_r0: {
      jRequest: async (key, method) => {
        if (method === 'tailLog') return [{ ts: 1, site_power_w: 5000 }]
        if (method === 'listThings') return [{ last: { snap: { stats: { power_w: 8888 } } } }]
        return []
      }
    }
  })

  const result = await getSitePowerConsumption(ctx, { query: { ...RANGE, tag: 't-powermeter' } })

  t.is(result.summary.max.value, 5000, 'legacy powermeter site_power_w history')
  t.is(result.summary.current.value, 8888, 'current from list-things (legacy), not DCS')
  t.pass()
})
