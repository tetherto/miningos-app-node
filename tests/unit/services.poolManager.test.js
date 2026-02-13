'use strict'

const test = require('brittle')

const {
  getPoolStats,
  getPoolConfigs,
  getMinersWithPools,
  getUnitsWithPoolData,
  getPoolAlerts,
  assignPoolToMiners,
  setPowerMode
} = require('../../workers/lib/server/services/poolManager')

// Helper to create mock context
// rpc.getData uses async.mapLimit(clusters, 2, (store) => ctx.net_r0.jRequest(store.rpcPublicKey, method, params, { timeout }))
// So jRequest receives (publicKey, method, params, opts) and returns the per-cluster result
function createMockCtx (responseData) {
  return {
    net_r0: {
      jRequest: () => Promise.resolve(responseData)
    }
  }
}

// Helper to create mock minerpool stats (getWrkExtData response)
function createMockPoolStatsResponse (pools) {
  return [{
    stats: pools.map(p => ({
      poolType: p.poolType || 'f2pool',
      username: p.username || 'worker1',
      hashrate: p.hashrate || 100000,
      hashrate_1h: p.hashrate_1h || 100000,
      hashrate_24h: p.hashrate_24h || 95000,
      worker_count: p.worker_count || 5,
      active_workers_count: p.active_workers_count || 4,
      balance: p.balance || 0.001,
      unsettled: p.unsettled || 0,
      revenue_24h: p.revenue_24h || 0.0001,
      yearlyBalances: p.yearlyBalances || [],
      timestamp: p.timestamp || Date.now()
    }))
  }]
}

// Helper to create mock miner thing (listThings response)
function createMockMiner (id, options = {}) {
  return {
    id,
    code: options.code || 'AM-S19XP-0001',
    type: options.type || 'miner-am-s19xp',
    tags: options.tags || ['t-miner', 'site-pintado', 'container-bitmain-imm-1'],
    info: {
      site: options.site || 'Pintado',
      container: options.container || 'bitmain-imm-1',
      serialNum: options.serialNum || 'HTM3X01',
      nominalHashrateMhs: options.nominalHashrateMhs || 204000000
    },
    address: options.address || '192.168.1.100',
    alerts: options.alerts || {}
  }
}

// Tests for getPoolStats

test('poolManager:getPoolStats returns correct aggregates', async function (t) {
  const poolData = createMockPoolStatsResponse([
    { poolType: 'f2pool', username: 'worker1', hashrate: 100000, worker_count: 5, active_workers_count: 4, balance: 0.001 },
    { poolType: 'ocean', username: 'addr1', hashrate: 200000, worker_count: 10, active_workers_count: 8, balance: 0.002 }
  ])

  const mockCtx = createMockCtx(poolData)
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await getPoolStats(mockCtx, clusters)

  t.is(result.totalPools, 2)
  t.is(result.totalWorkers, 15)
  t.is(result.activeWorkers, 12)
  t.is(result.totalHashrate, 300000)
  t.is(result.totalBalance, 0.003)
  t.is(result.errors, 3)
})

test('poolManager:getPoolStats handles empty clusters', async function (t) {
  const mockCtx = createMockCtx([])
  const clusters = []

  const result = await getPoolStats(mockCtx, clusters)

  t.is(result.totalPools, 0)
  t.is(result.totalWorkers, 0)
  t.is(result.activeWorkers, 0)
  t.is(result.totalHashrate, 0)
  t.is(result.totalBalance, 0)
})

test('poolManager:getPoolStats deduplicates pools by key', async function (t) {
  // Two clusters returning the same pool should be deduped
  const poolData = createMockPoolStatsResponse([
    { poolType: 'f2pool', username: 'worker1', worker_count: 5, active_workers_count: 4 }
  ])

  const mockCtx = createMockCtx(poolData)
  // Two clusters, each returns the same pool
  const clusters = [{ rpcPublicKey: 'key1' }, { rpcPublicKey: 'key2' }]

  const result = await getPoolStats(mockCtx, clusters)

  t.is(result.totalPools, 1)
  t.is(result.totalWorkers, 5)
})

// Tests for getPoolConfigs

test('poolManager:getPoolConfigs returns pool objects', async function (t) {
  const poolData = createMockPoolStatsResponse([
    { poolType: 'f2pool', username: 'worker1', hashrate: 100000, balance: 0.001 },
    { poolType: 'ocean', username: 'addr1', hashrate: 200000, balance: 0.002 }
  ])

  const mockCtx = createMockCtx(poolData)
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await getPoolConfigs(mockCtx, clusters)

  t.ok(Array.isArray(result))
  t.is(result.length, 2)

  const f2pool = result.find(p => p.pool === 'f2pool')
  t.ok(f2pool)
  t.is(f2pool.name, 'worker1')
  t.is(f2pool.account, 'worker1')
  t.is(f2pool.hashrate, 100000)
  t.is(f2pool.balance, 0.001)
})

test('poolManager:getPoolConfigs returns empty for no data', async function (t) {
  const mockCtx = createMockCtx([])
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await getPoolConfigs(mockCtx, clusters)

  t.ok(Array.isArray(result))
  t.is(result.length, 0)
})

// Tests for getMinersWithPools

test('poolManager:getMinersWithPools returns paginated results', async function (t) {
  const miners = []
  for (let i = 0; i < 100; i++) {
    miners.push(createMockMiner(`miner-${i}`, { code: `AM-S19XP-${i}` }))
  }

  const mockCtx = createMockCtx(miners)
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await getMinersWithPools(mockCtx, clusters, { page: 1, limit: 10 })

  t.is(result.miners.length, 10)
  t.is(result.total, 100)
  t.is(result.page, 1)
  t.is(result.limit, 10)
  t.is(result.totalPages, 10)
})

test('poolManager:getMinersWithPools extracts model from type', async function (t) {
  const miners = [
    createMockMiner('m1', { type: 'miner-am-s19xp', code: 'AM-S19XP-001' }),
    createMockMiner('m2', { type: 'miner-wm-m56s', code: 'WM-M56S-001' }),
    createMockMiner('m3', { type: 'miner-av-a1346', code: 'AV-A1346-001' })
  ]

  const mockCtx = createMockCtx(miners)
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await getMinersWithPools(mockCtx, clusters, {})

  t.is(result.miners[0].model, 'Antminer S19XP')
  t.is(result.miners[1].model, 'Whatsminer M56S')
  t.is(result.miners[2].model, 'Avalon A1346')
})

test('poolManager:getMinersWithPools filters by search', async function (t) {
  const miners = [
    createMockMiner('miner-1', { code: 'AM-S19XP-0001', serialNum: 'HTM3X01' }),
    createMockMiner('miner-2', { code: 'WM-M56S-0002', serialNum: 'WMT001' })
  ]

  const mockCtx = createMockCtx(miners)
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await getMinersWithPools(mockCtx, clusters, { search: 'S19XP' })

  t.is(result.total, 1)
  t.is(result.miners[0].id, 'miner-1')
})

test('poolManager:getMinersWithPools filters by model', async function (t) {
  const miners = [
    createMockMiner('m1', { type: 'miner-am-s19xp' }),
    createMockMiner('m2', { type: 'miner-wm-m56s' })
  ]

  const mockCtx = createMockCtx(miners)
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await getMinersWithPools(mockCtx, clusters, { model: 'whatsminer' })

  t.is(result.total, 1)
  t.is(result.miners[0].model, 'Whatsminer M56S')
})

test('poolManager:getMinersWithPools maps thing fields correctly', async function (t) {
  const miners = [createMockMiner('miner-1', {
    code: 'AM-S19XP-0165',
    type: 'miner-am-s19xp',
    site: 'Pintado',
    container: 'bitmain-imm-1',
    address: '10.0.0.1',
    serialNum: 'HTM3X10',
    nominalHashrateMhs: 204000000
  })]

  const mockCtx = createMockCtx(miners)
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await getMinersWithPools(mockCtx, clusters, {})

  const miner = result.miners[0]
  t.is(miner.id, 'miner-1')
  t.is(miner.code, 'AM-S19XP-0165')
  t.is(miner.type, 'miner-am-s19xp')
  t.is(miner.model, 'Antminer S19XP')
  t.is(miner.site, 'Pintado')
  t.is(miner.container, 'bitmain-imm-1')
  t.is(miner.ipAddress, '10.0.0.1')
  t.is(miner.serialNum, 'HTM3X10')
  t.is(miner.nominalHashrate, 204000000)
})

// Tests for getUnitsWithPoolData

test('poolManager:getUnitsWithPoolData groups miners by container', async function (t) {
  const miners = [
    createMockMiner('m1', { container: 'bitmain-imm-1' }),
    createMockMiner('m2', { container: 'bitmain-imm-1' }),
    createMockMiner('m3', { container: 'bitdeer-4a' })
  ]

  const mockCtx = createMockCtx(miners)
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await getUnitsWithPoolData(mockCtx, clusters)

  t.ok(Array.isArray(result))
  t.is(result.length, 2)

  const imm1 = result.find(u => u.name === 'bitmain-imm-1')
  t.ok(imm1)
  t.is(imm1.minersCount, 2)
})

test('poolManager:getUnitsWithPoolData sums nominal hashrate', async function (t) {
  const miners = [
    createMockMiner('m1', { container: 'unit-A', nominalHashrateMhs: 100000 }),
    createMockMiner('m2', { container: 'unit-A', nominalHashrateMhs: 150000 })
  ]

  const mockCtx = createMockCtx(miners)
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await getUnitsWithPoolData(mockCtx, clusters)

  const unitA = result.find(u => u.name === 'unit-A')
  t.is(unitA.nominalHashrate, 250000)
})

test('poolManager:getUnitsWithPoolData extracts container from tags', async function (t) {
  const miners = [
    createMockMiner('m1', {
      container: undefined,
      tags: ['t-miner', 'site-pintado', 'container-bitmain-imm-2']
    })
  ]
  // Override info.container to be undefined
  miners[0].info.container = undefined

  const mockCtx = createMockCtx(miners)
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await getUnitsWithPoolData(mockCtx, clusters)

  t.is(result.length, 1)
  t.is(result[0].name, 'bitmain-imm-2')
})

test('poolManager:getUnitsWithPoolData assigns unassigned for no container', async function (t) {
  const miners = [
    createMockMiner('m1', { container: undefined, tags: ['t-miner'] })
  ]
  miners[0].info.container = undefined

  const mockCtx = createMockCtx(miners)
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await getUnitsWithPoolData(mockCtx, clusters)

  t.is(result[0].name, 'unassigned')
})

// Tests for getPoolAlerts

test('poolManager:getPoolAlerts returns pool-related alerts', async function (t) {
  const miners = [
    createMockMiner('miner-1', {
      alerts: {
        wrong_miner_pool: { ts: Date.now() },
        wrong_miner_subaccount: { ts: Date.now() }
      }
    }),
    createMockMiner('miner-2', {
      alerts: { all_pools_dead: { ts: Date.now() } }
    })
  ]

  const mockCtx = createMockCtx(miners)
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await getPoolAlerts(mockCtx, clusters)

  t.ok(Array.isArray(result))
  t.is(result.length, 3)
})

test('poolManager:getPoolAlerts respects limit', async function (t) {
  const miners = []
  for (let i = 0; i < 10; i++) {
    miners.push(createMockMiner(`miner-${i}`, {
      type: 'miner-am-s19xp',
      code: `AM-S19XP-${i}`,
      alerts: { wrong_miner_pool: { ts: Date.now() - i * 1000 } }
    }))
  }

  const mockCtx = createMockCtx(miners)
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await getPoolAlerts(mockCtx, clusters, { limit: 5 })

  t.is(result.length, 5)
})

test('poolManager:getPoolAlerts includes severity', async function (t) {
  const miners = [
    createMockMiner('miner-1', {
      alerts: { all_pools_dead: { ts: Date.now() } }
    })
  ]

  const mockCtx = createMockCtx(miners)
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await getPoolAlerts(mockCtx, clusters)

  t.is(result[0].severity, 'critical')
  t.is(result[0].type, 'all_pools_dead')
})

// Tests for assignPoolToMiners

test('poolManager:assignPoolToMiners validates miner IDs', async function (t) {
  const mockCtx = createMockCtx({ success: true })
  const clusters = [{ rpcPublicKey: 'key1' }]

  await t.exception(async () => {
    await assignPoolToMiners(mockCtx, clusters, [], [{ url: 'stratum+tcp://pool.com:3333' }])
  }, /ERR_MINER_IDS_REQUIRED/)
})

test('poolManager:assignPoolToMiners validates pools', async function (t) {
  const mockCtx = createMockCtx({ success: true })
  const clusters = [{ rpcPublicKey: 'key1' }]

  await t.exception(async () => {
    await assignPoolToMiners(mockCtx, clusters, ['miner-1'], [])
  }, /ERR_POOLS_REQUIRED/)
})

test('poolManager:assignPoolToMiners calls RPC with correct params', async function (t) {
  let capturedParams
  const mockCtx = {
    net_r0: {
      jRequest: (pk, method, params) => {
        capturedParams = params
        return Promise.resolve({ success: true, affected: 2 })
      }
    }
  }
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await assignPoolToMiners(mockCtx, clusters, ['miner-1', 'miner-2'], [
    { url: 'stratum+tcp://pool.com:3333', worker_name: 'worker1', worker_password: 'x' }
  ])

  t.ok(capturedParams)
  t.is(capturedParams.action, 'setupPools')
  t.ok(capturedParams.params.pools)
  t.is(capturedParams.params.pools[0].url, 'stratum+tcp://pool.com:3333')
  t.is(capturedParams.params.pools[0].worker_name, 'worker1')
  t.is(result.success, true)
  t.is(result.assigned, 2)
})

test('poolManager:assignPoolToMiners handles multiple pools', async function (t) {
  let capturedParams
  const mockCtx = {
    net_r0: {
      jRequest: (pk, method, params) => {
        capturedParams = params
        return Promise.resolve({ success: true, affected: 1 })
      }
    }
  }
  const clusters = [{ rpcPublicKey: 'key1' }]

  await assignPoolToMiners(mockCtx, clusters, ['miner-1'], [
    { url: 'stratum+tcp://primary.com:3333', worker_name: 'worker1' },
    { url: 'stratum+tcp://backup1.com:3333' },
    { url: 'stratum+tcp://backup2.com:3333' }
  ])

  t.is(capturedParams.params.pools.length, 3)
  t.is(capturedParams.params.pools[0].url, 'stratum+tcp://primary.com:3333')
  t.is(capturedParams.params.pools[1].url, 'stratum+tcp://backup1.com:3333')
  t.is(capturedParams.params.pools[2].url, 'stratum+tcp://backup2.com:3333')
})

// Tests for setPowerMode

test('poolManager:setPowerMode validates miner IDs', async function (t) {
  const mockCtx = createMockCtx({ success: true })
  const clusters = [{ rpcPublicKey: 'key1' }]

  await t.exception(async () => {
    await setPowerMode(mockCtx, clusters, [], 'sleep')
  }, /ERR_MINER_IDS_REQUIRED/)
})

test('poolManager:setPowerMode validates power mode', async function (t) {
  const mockCtx = createMockCtx({ success: true })
  const clusters = [{ rpcPublicKey: 'key1' }]

  await t.exception(async () => {
    await setPowerMode(mockCtx, clusters, ['miner-1'], 'invalid-mode')
  }, /ERR_INVALID_POWER_MODE/)
})

test('poolManager:setPowerMode calls RPC with correct params', async function (t) {
  let capturedParams
  const mockCtx = {
    net_r0: {
      jRequest: (pk, method, params) => {
        capturedParams = params
        return Promise.resolve({ success: true, affected: 2 })
      }
    }
  }
  const clusters = [{ rpcPublicKey: 'key1' }]

  const result = await setPowerMode(mockCtx, clusters, ['miner-1', 'miner-2'], 'sleep')

  t.ok(capturedParams)
  t.is(capturedParams.action, 'setPowerMode')
  t.is(capturedParams.params.mode, 'sleep')
  t.ok(result.success)
  t.is(result.affected, 2)
  t.is(result.mode, 'sleep')
})

test('poolManager:setPowerMode accepts all valid modes', async function (t) {
  const validModes = ['low', 'normal', 'high', 'sleep']
  const clusters = [{ rpcPublicKey: 'key1' }]

  for (const mode of validModes) {
    const mockCtx = {
      net_r0: {
        jRequest: () => Promise.resolve({ success: true, affected: 1 })
      }
    }

    const result = await setPowerMode(mockCtx, clusters, ['miner-1'], mode)
    t.ok(result.success)
    t.is(result.mode, mode)
  }
})
