'use strict'

const test = require('brittle')
const {
  listMiners,
  formatMiner,
  extractPoolWorkers,
  MINER_FIELD_MAP
} = require('../../../workers/lib/server/handlers/miners.handlers')

function createMockMiner (overrides = {}) {
  return {
    id: 't-miner-antminer-192-168-1-101',
    type: 'antminer-s19xp',
    code: 'A101',
    tags: ['t-miner'],
    rack: 'rack-0',
    info: {
      container: 'bitdeer-4b',
      pos: 'R3-S12',
      serialNum: 'SN12345',
      macAddress: 'AA:BB:CC:DD:EE:FF'
    },
    opts: { address: '192.168.1.101' },
    last: {
      snap: {
        model: 'S19XP',
        stats: {
          status: 'mining',
          hashrate_mhs: 140000000,
          power_w: 3010,
          temperature_c: 72,
          efficiency_w_ths: 21.5
        },
        config: {
          power_mode: 'normal',
          firmware_ver: '2024.01.15',
          led_status: 'normal',
          pool_config: { url: 'stratum+tcp://pool.example.com', worker: 'worker1' }
        }
      },
      alerts: { critical: 0, high: 0, medium: 1 },
      uptime: 1209600000,
      ts: 1709266500000
    },
    comments: [],
    ...overrides
  }
}

function createMockCtx (miners, opts = {}) {
  return {
    conf: {
      orks: [{ rpcPublicKey: 'key1' }],
      featureConfig: opts.featureConfig || {}
    },
    net_r0: {
      jRequest: async (key, method, payload) => {
        if (method === 'listThings') return miners
        if (method === 'getWrkExtData') return opts.poolData || []
        return {}
      }
    }
  }
}

// --- formatMiner ---

test('formatMiner - transforms raw miner to clean format', (t) => {
  const raw = createMockMiner()
  const result = formatMiner(raw, null)

  t.is(result.id, 't-miner-antminer-192-168-1-101')
  t.is(result.type, 'antminer-s19xp')
  t.is(result.model, 'S19XP')
  t.is(result.code, 'A101')
  t.is(result.ip, '192.168.1.101')
  t.is(result.container, 'bitdeer-4b')
  t.is(result.rack, 'rack-0')
  t.is(result.position, 'R3-S12')
  t.is(result.status, 'mining')
  t.is(result.hashrate, 140000000)
  t.is(result.power, 3010)
  t.is(result.temperature, 72)
  t.is(result.efficiency, 21.5)
  t.is(result.firmware, '2024.01.15')
  t.is(result.powerMode, 'normal')
  t.is(result.ledStatus, 'normal')
  t.is(result.serialNum, 'SN12345')
  t.is(result.lastSeen, 1709266500000)
  t.pass()
})

test('formatMiner - handles missing nested fields', (t) => {
  const raw = { id: 'test', type: 'miner' }
  const result = formatMiner(raw, null)

  t.is(result.id, 'test')
  t.is(result.hashrate, 0)
  t.is(result.power, 0)
  t.is(result.efficiency, 0)
  t.is(result.status, undefined)
  t.is(result.ip, undefined)
  t.pass()
})

test('formatMiner - enriches with pool hashrate', (t) => {
  const raw = createMockMiner()
  const poolWorkers = {
    't-miner-antminer-192-168-1-101': { hashrate: 139500000 }
  }
  const result = formatMiner(raw, poolWorkers)

  t.is(result.poolHashrate, 139500000)
  t.pass()
})

test('formatMiner - enriches by code fallback', (t) => {
  const raw = createMockMiner()
  const poolWorkers = {
    A101: { hashrate: 139500000 }
  }
  const result = formatMiner(raw, poolWorkers)

  t.is(result.poolHashrate, 139500000)
  t.pass()
})

test('formatMiner - no poolHashrate when no match', (t) => {
  const raw = createMockMiner()
  const poolWorkers = { 'other-id': { hashrate: 100 } }
  const result = formatMiner(raw, poolWorkers)

  t.is(result.poolHashrate, undefined)
  t.pass()
})

// --- extractPoolWorkers ---

test('extractPoolWorkers - builds worker lookup', (t) => {
  const poolData = [
    [
      {
        stats: { hashrate: 100 },
        workers: {
          'miner-1': { hashrate: 50 },
          'miner-2': { hashrate: 50 }
        }
      }
    ]
  ]
  const result = extractPoolWorkers(poolData)

  t.is(result['miner-1'].hashrate, 50)
  t.is(result['miner-2'].hashrate, 50)
  t.pass()
})

test('extractPoolWorkers - handles empty data', (t) => {
  const result = extractPoolWorkers([])
  t.is(Object.keys(result).length, 0)
  t.pass()
})

test('extractPoolWorkers - handles pools without workers', (t) => {
  const poolData = [[{ stats: { hashrate: 100 } }]]
  const result = extractPoolWorkers(poolData)
  t.is(Object.keys(result).length, 0)
  t.pass()
})

// --- listMiners ---

test('listMiners - returns paginated response with formatted miners', async (t) => {
  const miners = [createMockMiner(), createMockMiner({ id: 'miner-2', code: 'A102' })]
  const ctx = createMockCtx(miners)
  const req = { query: {} }

  const result = await listMiners(ctx, req)

  t.ok(result.data)
  t.is(result.data.length, 2)
  t.is(result.totalCount, 2)
  t.is(result.offset, 0)
  t.is(result.limit, 50)
  t.is(result.hasMore, false)
  t.is(result.data[0].id, 't-miner-antminer-192-168-1-101')
  t.is(result.data[0].model, 'S19XP')
  t.pass()
})

test('listMiners - applies pagination', async (t) => {
  const miners = Array.from({ length: 10 }, (_, i) =>
    createMockMiner({ id: `miner-${i}`, code: `A${i}` })
  )
  const ctx = createMockCtx(miners)
  const req = { query: { offset: 2, limit: 3 } }

  const result = await listMiners(ctx, req)

  t.is(result.data.length, 3)
  t.is(result.totalCount, 10)
  t.is(result.offset, 2)
  t.is(result.limit, 3)
  t.is(result.hasMore, true)
  t.pass()
})

test('listMiners - enforces max limit of 200', async (t) => {
  const ctx = createMockCtx([])
  const req = { query: { limit: 500 } }

  const result = await listMiners(ctx, req)

  t.is(result.limit, 200)
  t.pass()
})

test('listMiners - parses filter JSON', async (t) => {
  let capturedPayload = null
  const ctx = {
    conf: {
      orks: [{ rpcPublicKey: 'key1' }],
      featureConfig: {}
    },
    net_r0: {
      jRequest: async (key, method, payload) => {
        capturedPayload = payload
        return []
      }
    }
  }
  const req = { query: { filter: '{"status":"error"}' } }

  await listMiners(ctx, req)

  t.ok(capturedPayload.query.$and)
  t.is(capturedPayload.query.$and[0].tags.$in[0], 't-miner')
  t.is(capturedPayload.query.$and[1]['last.snap.stats.status'], 'error')
  t.pass()
})

test('listMiners - builds search query', async (t) => {
  let capturedPayload = null
  const ctx = {
    conf: {
      orks: [{ rpcPublicKey: 'key1' }],
      featureConfig: {}
    },
    net_r0: {
      jRequest: async (key, method, payload) => {
        capturedPayload = payload
        return []
      }
    }
  }
  const req = { query: { search: '192.168' } }

  await listMiners(ctx, req)

  const lastCondition = capturedPayload.query.$and[capturedPayload.query.$and.length - 1]
  t.ok(lastCondition.$or)
  t.ok(lastCondition.$or.some(c => c.id?.$regex === '192.168'))
  t.ok(lastCondition.$or.some(c => c['opts.address']?.$regex === '192.168'))
  t.pass()
})

test('listMiners - handles empty ork results', async (t) => {
  const ctx = createMockCtx([])
  const req = { query: {} }

  const result = await listMiners(ctx, req)

  t.is(result.data.length, 0)
  t.is(result.totalCount, 0)
  t.pass()
})

test('listMiners - throws on invalid filter JSON', async (t) => {
  const ctx = createMockCtx([])
  const req = { query: { filter: 'not-json' } }

  try {
    await listMiners(ctx, req)
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_FILTER_INVALID_JSON')
  }
  t.pass()
})

test('listMiners - throws on invalid sort JSON', async (t) => {
  const ctx = createMockCtx([])
  const req = { query: { sort: '{invalid' } }

  try {
    await listMiners(ctx, req)
    t.fail('should have thrown')
  } catch (err) {
    t.is(err.message, 'ERR_SORT_INVALID_JSON')
  }
  t.pass()
})

test('MINER_FIELD_MAP - has expected field mappings', (t) => {
  t.is(MINER_FIELD_MAP.status, 'last.snap.stats.status')
  t.is(MINER_FIELD_MAP.hashrate, 'last.snap.stats.hashrate_mhs')
  t.is(MINER_FIELD_MAP.ip, 'opts.address')
  t.is(MINER_FIELD_MAP.container, 'info.container')
  t.is(MINER_FIELD_MAP.model, 'last.snap.model')
  t.pass()
})
