'use strict'

const test = require('brittle')
const { getSiteLiveStatus } = require('../../../workers/lib/server/handlers/site.handlers')

function createMockCtx (tailLogMultiResponse, extDataResponse, globalConfigResponse) {
  return {
    conf: {
      orks: [{ rpcPublicKey: 'key1' }]
    },
    net_r0: {
      jRequest: async (key, method) => {
        if (method === 'tailLogMulti') return tailLogMultiResponse
        if (method === 'getWrkExtData') return extDataResponse
        if (method === 'getGlobalConfig') return globalConfigResponse
        return {}
      }
    }
  }
}

test('getSiteLiveStatus - returns composed response with correct structure', async (t) => {
  const tailLogMultiResponse = [
    // Key 0: miner stats
    [{ hashrate_mhs_1m_sum_aggr: 601432498437, nominal_hashrate_mhs_sum_aggr: 741423000000, online_or_minor_error_miners_amount_aggr: 1850, not_mining_miners_amount_aggr: 23, offline_or_sleeping_miners_amount_aggr: 45, hashrate_mhs_1m_cnt_aggr: 1930, alerts_aggr: { critical: 8, high: 12, medium: 39 } }],
    // Key 1: powermeter stats
    [{ site_power_w: 16701560 }],
    // Key 2: container stats
    [{ container_nominal_miner_capacity_sum_aggr: 2000 }]
  ]

  const extDataResponse = [
    { stats: { hashrate: 279670375560265, active_workers_count: 1823, worker_count: 1930 } }
  ]

  const globalConfigResponse = {
    nominalHashrate: 741423000000,
    nominalPowerAvailability_MW: 22.5
  }

  const ctx = createMockCtx(tailLogMultiResponse, extDataResponse, globalConfigResponse)
  const req = { query: {} }

  const result = await getSiteLiveStatus(ctx, req)

  t.ok(result.hashrate, 'should have hashrate')
  t.is(result.hashrate.value, 601432498437, 'hashrate value should match')
  t.is(result.hashrate.nominal, 741423000000, 'hashrate nominal should match')
  t.ok(result.hashrate.utilization > 0, 'hashrate utilization should be > 0')

  t.ok(result.power, 'should have power')
  t.is(result.power.value, 16701560, 'power value should match')
  t.is(result.power.nominal, 22500000, 'power nominal should be MW * 1000000')

  t.ok(result.efficiency, 'should have efficiency')
  t.ok(result.efficiency.value > 0, 'efficiency value should be > 0')

  t.ok(result.miners, 'should have miners')
  t.is(result.miners.online, 1850, 'miners online should match')
  t.is(result.miners.error, 23, 'miners error should match')
  t.is(result.miners.offline, 45, 'miners offline should match')
  t.is(result.miners.total, 1930, 'miners total should match')
  t.is(result.miners.containerCapacity, 2000, 'container capacity should match')

  t.ok(result.alerts, 'should have alerts')
  t.is(result.alerts.critical, 8, 'critical alerts should match')
  t.is(result.alerts.high, 12, 'high alerts should match')
  t.is(result.alerts.medium, 39, 'medium alerts should match')
  t.is(result.alerts.total, 59, 'total alerts should be sum')

  t.ok(result.pools, 'should have pools')
  t.is(result.pools.totalHashrate, 279670375560265, 'pool hashrate should match')
  t.is(result.pools.activeWorkers, 1823, 'active workers should match')
  t.is(result.pools.totalWorkers, 1930, 'total workers should match')

  t.ok(result.ts, 'should have timestamp')
  t.pass()
})

test('getSiteLiveStatus - handles empty ork responses', async (t) => {
  const ctx = createMockCtx([], [], {})
  const req = { query: {} }

  const result = await getSiteLiveStatus(ctx, req)

  t.is(result.hashrate.value, 0, 'hashrate should be 0')
  t.is(result.power.value, 0, 'power should be 0')
  t.is(result.efficiency.value, 0, 'efficiency should be 0')
  t.is(result.miners.total, 0, 'miners total should be 0')
  t.is(result.alerts.total, 0, 'alerts total should be 0')
  t.is(result.pools.totalHashrate, 0, 'pool hashrate should be 0')
  t.pass()
})

test('getSiteLiveStatus - computes utilization correctly', async (t) => {
  const tailLogMultiResponse = [
    [{ hashrate_mhs_1m_sum_aggr: 500, nominal_hashrate_mhs_sum_aggr: 1000, online_or_minor_error_miners_amount_aggr: 0, not_mining_miners_amount_aggr: 0, offline_or_sleeping_miners_amount_aggr: 0, hashrate_mhs_1m_cnt_aggr: 0, alerts_aggr: {} }],
    [{ site_power_w: 750 }],
    [{ container_nominal_miner_capacity_sum_aggr: 0 }]
  ]

  const ctx = createMockCtx(tailLogMultiResponse, [], { nominalPowerAvailability_MW: 0.001 })
  const req = { query: {} }

  const result = await getSiteLiveStatus(ctx, req)

  t.is(result.hashrate.utilization, 50, 'hashrate utilization should be 50%')
  t.is(result.power.utilization, 75, 'power utilization should be 75%')
  t.pass()
})

test('getSiteLiveStatus - handles zero nominal values gracefully', async (t) => {
  const tailLogMultiResponse = [
    [{ hashrate_mhs_1m_sum_aggr: 100 }],
    [{ site_power_w: 200 }],
    [{}]
  ]

  const ctx = createMockCtx(tailLogMultiResponse, [], { nominalPowerAvailability_MW: 0 })
  const req = { query: {} }

  const result = await getSiteLiveStatus(ctx, req)

  t.is(result.hashrate.utilization, 0, 'should return 0 when nominal hashrate is 0')
  t.is(result.power.utilization, 0, 'should return 0 when nominal power is 0')
  t.pass()
})

test('getSiteLiveStatus - aggregates multiple pool accounts', async (t) => {
  const tailLogMultiResponse = [
    [{ hashrate_mhs_1m_sum_aggr: 0 }],
    [{}],
    [{}]
  ]

  const extDataResponse = [
    { stats: { hashrate: 100, active_workers_count: 10, worker_count: 15 } },
    { stats: { hashrate: 200, active_workers_count: 20, worker_count: 25 } }
  ]

  const ctx = createMockCtx(tailLogMultiResponse, extDataResponse, {})
  const req = { query: {} }

  const result = await getSiteLiveStatus(ctx, req)

  t.is(result.pools.totalHashrate, 300, 'should sum pool hashrates')
  t.is(result.pools.activeWorkers, 30, 'should sum active workers')
  t.is(result.pools.totalWorkers, 40, 'should sum total workers')
  t.pass()
})

test('getSiteLiveStatus - computes sleep miners from remainder', async (t) => {
  const tailLogMultiResponse = [
    [{
      hashrate_mhs_1m_sum_aggr: 0,
      online_or_minor_error_miners_amount_aggr: 80,
      not_mining_miners_amount_aggr: 5,
      offline_or_sleeping_miners_amount_aggr: 10,
      hashrate_mhs_1m_cnt_aggr: 100
    }],
    [{}],
    [{}]
  ]

  const ctx = createMockCtx(tailLogMultiResponse, [], {})
  const req = { query: {} }

  const result = await getSiteLiveStatus(ctx, req)

  t.is(result.miners.online, 80, 'online should match')
  t.is(result.miners.error, 5, 'error should match')
  t.is(result.miners.offline, 10, 'offline should match')
  t.is(result.miners.sleep, 5, 'sleep should be total - online - error - offline')
  t.is(result.miners.total, 100, 'total should match')
  t.pass()
})

test('getSiteLiveStatus - uses nominal_hashrate from taillog over globalConfig', async (t) => {
  const tailLogMultiResponse = [
    [{ hashrate_mhs_1m_sum_aggr: 500, nominal_hashrate_mhs_sum_aggr: 1000 }],
    [{}],
    [{}]
  ]

  const ctx = createMockCtx(tailLogMultiResponse, [], { nominalHashrate: 2000 })
  const req = { query: {} }

  const result = await getSiteLiveStatus(ctx, req)

  t.is(result.hashrate.nominal, 1000, 'should prefer nominal from taillog aggr')
  t.pass()
})

test('getSiteLiveStatus - falls back to globalConfig nominalHashrate', async (t) => {
  const tailLogMultiResponse = [
    [{ hashrate_mhs_1m_sum_aggr: 500, nominal_hashrate_mhs_sum_aggr: 0 }],
    [{}],
    [{}]
  ]

  const ctx = createMockCtx(tailLogMultiResponse, [], { nominalHashrate: 2000 })
  const req = { query: {} }

  const result = await getSiteLiveStatus(ctx, req)

  t.is(result.hashrate.nominal, 2000, 'should fall back to globalConfig nominalHashrate')
  t.pass()
})
