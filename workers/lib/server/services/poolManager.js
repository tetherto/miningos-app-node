'use strict'

const {
  LIST_THINGS,
  WORKER_TYPES,
  POOL_ALERT_TYPES,
  APPLY_THINGS,
  POWER_MODES,
  RPC_METHODS,
  MINERPOOL_EXT_DATA_KEYS
} = require('../../constants')
const {
  requestRpcMapLimit,
  requestRpcEachLimit
} = require('../../utils')

const getPoolStats = async (ctx) => {
  const pools = await _fetchPoolStats(ctx)

  const totalWorkers = pools.reduce((sum, p) => sum + (p.workerCount || 0), 0)
  const activeWorkers = pools.reduce((sum, p) => sum + (p.activeWorkerCount || 0), 0)
  const totalHashrate = pools.reduce((sum, p) => sum + (p.hashrate || 0), 0)
  const totalBalance = pools.reduce((sum, p) => sum + (p.balance || 0), 0)

  return {
    totalPools: pools.length,
    totalWorkers,
    activeWorkers,
    totalHashrate,
    totalBalance,
    errors: totalWorkers - activeWorkers
  }
}

const getPoolConfigs = async (ctx) => {
  return _fetchPoolStats(ctx)
}

const getMinersWithPools = async (ctx, filters = {}) => {
  const { search, model, page = 1, limit = 50 } = filters

  const results = await requestRpcMapLimit(ctx, LIST_THINGS, {
    type: WORKER_TYPES.MINER,
    query: {},
    fields: { id: 1, code: 1, type: 1, info: 1, address: 1 }
  })

  let allMiners = []

  results.forEach((clusterData) => {
    if (!Array.isArray(clusterData)) return

    clusterData.forEach((thing) => {
      if (!thing?.type?.startsWith('miner-')) return

      allMiners.push({
        id: thing.id,
        code: thing.code,
        type: thing.type,
        model: _extractModelFromType(thing.type),
        container: thing.info?.container || null,
        ipAddress: thing.address || null,
        serialNum: thing.info?.serialNum || null,
        nominalHashrate: thing.info?.nominalHashrateMhs || 0
      })
    })
  })

  if (search) {
    const s = search.toLowerCase()
    allMiners = allMiners.filter(m =>
      m.id.toLowerCase().includes(s) ||
      (m.code && m.code.toLowerCase().includes(s)) ||
      (m.serialNum && m.serialNum.toLowerCase().includes(s)) ||
      (m.ipAddress && m.ipAddress.includes(s))
    )
  }

  if (model) {
    const m = model.toLowerCase()
    allMiners = allMiners.filter(miner =>
      miner.model.toLowerCase().includes(m) ||
      miner.type.toLowerCase().includes(m)
    )
  }

  const total = allMiners.length
  const startIdx = (page - 1) * limit
  const paginatedMiners = allMiners.slice(startIdx, startIdx + limit)

  return {
    miners: paginatedMiners,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit)
  }
}

const getUnitsWithPoolData = async (ctx) => {
  const results = await requestRpcMapLimit(ctx, LIST_THINGS, {
    type: WORKER_TYPES.MINER,
    query: {},
    fields: { id: 1, type: 1, info: 1 }
  })

  const unitsMap = new Map()

  results.forEach((clusterData) => {
    if (!Array.isArray(clusterData)) return

    clusterData.forEach((thing) => {
      if (!thing?.type?.startsWith('miner-')) return

      const container = thing.info?.container || 'unassigned'

      if (!unitsMap.has(container)) {
        unitsMap.set(container, {
          name: container,
          miners: [],
          totalNominalHashrate: 0
        })
      }

      const unitData = unitsMap.get(container)
      unitData.miners.push(thing.id)
      unitData.totalNominalHashrate += thing.info?.nominalHashrateMhs || 0
    })
  })

  return Array.from(unitsMap.values()).map((unit) => ({
    name: unit.name,
    minersCount: unit.miners.length,
    nominalHashrate: unit.totalNominalHashrate
  }))
}

const getPoolAlerts = async (ctx, filters = {}) => {
  const { limit = 50 } = filters

  const results = await requestRpcMapLimit(ctx, LIST_THINGS, {
    type: WORKER_TYPES.MINER,
    query: {},
    fields: { id: 1, code: 1, type: 1, info: 1, alerts: 1 }
  })

  const alerts = []

  results.forEach((clusterData) => {
    if (!Array.isArray(clusterData)) return

    clusterData.forEach((thing) => {
      const minerAlerts = thing?.alerts || {}

      POOL_ALERT_TYPES.forEach((alertType) => {
        if (minerAlerts[alertType]) {
          alerts.push({
            id: `${thing.id}-${alertType}`,
            type: alertType,
            minerId: thing.id,
            code: thing.code,
            container: thing.info?.container || null,
            severity: _getAlertSeverity(alertType),
            message: _getAlertMessage(alertType, thing.code || thing.id),
            timestamp: minerAlerts[alertType]?.ts || Date.now()
          })
        }
      })
    })
  })

  alerts.sort((a, b) => b.timestamp - a.timestamp)
  return alerts.slice(0, limit)
}

const assignPoolToMiners = async (ctx, minerIds, auditInfo = {}) => {
  if (!Array.isArray(minerIds) || minerIds.length === 0) {
    throw new Error('ERR_MINER_IDS_REQUIRED')
  }

  if (ctx.logger && auditInfo.user) {
    ctx.logger.info({
      action: 'pool_assignment',
      user: auditInfo.user,
      timestamp: auditInfo.timestamp,
      minerCount: minerIds.length
    }, 'Pool setup initiated')
  }

  const params = {
    type: WORKER_TYPES.MINER,
    query: {
      id: { $in: minerIds }
    },
    action: 'setupPools'
  }

  const results = await requestRpcEachLimit(ctx, APPLY_THINGS, params)

  let assigned = 0
  let failed = 0
  const details = []

  results.forEach((clusterResult) => {
    if (clusterResult?.success) {
      assigned += clusterResult.affected || 0
    } else {
      failed++
    }

    if (clusterResult?.details) {
      details.push(...clusterResult.details)
    }
  })

  if (ctx.logger && auditInfo.user) {
    ctx.logger.info({
      action: 'pool_assignment_complete',
      user: auditInfo.user,
      timestamp: Date.now(),
      assigned,
      failed,
      total: minerIds.length
    }, 'Pool assignment completed')
  }

  return {
    success: failed === 0,
    assigned,
    failed,
    total: minerIds.length,
    details,
    audit: {
      user: auditInfo.user,
      timestamp: auditInfo.timestamp
    }
  }
}

const setPowerMode = async (ctx, minerIds, mode, auditInfo = {}) => {
  if (!Array.isArray(minerIds) || minerIds.length === 0) {
    throw new Error('ERR_MINER_IDS_REQUIRED')
  }

  const validModes = Object.values(POWER_MODES)
  if (!mode || !validModes.includes(mode)) {
    throw new Error('ERR_INVALID_POWER_MODE')
  }

  if (ctx.logger && auditInfo.user) {
    ctx.logger.info({
      action: 'set_power_mode',
      user: auditInfo.user,
      timestamp: auditInfo.timestamp,
      minerCount: minerIds.length,
      mode
    }, 'Power mode change initiated')
  }

  const params = {
    type: WORKER_TYPES.MINER,
    query: {
      id: { $in: minerIds }
    },
    action: 'setPowerMode',
    params: { mode }
  }

  const results = await requestRpcEachLimit(ctx, APPLY_THINGS, params)

  let affected = 0
  let failed = 0
  const details = []

  results.forEach((clusterResult) => {
    if (clusterResult?.success) {
      affected += clusterResult.affected || 0
    } else {
      failed++
    }

    if (clusterResult?.details) {
      details.push(...clusterResult.details)
    }
  })

  if (ctx.logger && auditInfo.user) {
    ctx.logger.info({
      action: 'set_power_mode_complete',
      user: auditInfo.user,
      timestamp: Date.now(),
      affected,
      failed,
      total: minerIds.length,
      mode
    }, 'Power mode change completed')
  }

  return {
    success: failed === 0,
    affected,
    failed,
    total: minerIds.length,
    mode,
    details,
    audit: {
      user: auditInfo.user,
      timestamp: auditInfo.timestamp
    }
  }
}

async function _fetchPoolStats (ctx) {
  const results = await requestRpcMapLimit(ctx, RPC_METHODS.GET_WRK_EXT_DATA, {
    type: 'minerpool',
    query: { key: MINERPOOL_EXT_DATA_KEYS.STATS }
  })

  const pools = []
  const seen = new Set()

  for (const orkResult of results) {
    if (!orkResult || orkResult.error) continue
    const items = Array.isArray(orkResult) ? orkResult : []

    for (const item of items) {
      if (!item) continue
      const stats = item.stats || []
      if (!Array.isArray(stats)) continue

      for (const stat of stats) {
        if (!stat) continue
        const poolKey = `${stat.poolType}:${stat.username}`
        if (seen.has(poolKey)) continue
        seen.add(poolKey)

        pools.push({
          name: stat.username || stat.poolType,
          pool: stat.poolType,
          account: stat.username,
          status: 'active',
          hashrate: stat.hashrate || 0,
          hashrate1h: stat.hashrate_1h || 0,
          hashrate24h: stat.hashrate_24h || 0,
          workerCount: stat.worker_count || 0,
          activeWorkerCount: stat.active_workers_count || 0,
          balance: stat.balance || 0,
          unsettled: stat.unsettled || 0,
          revenue24h: stat.revenue_24h || stat.estimated_today_income || 0,
          yearlyBalances: stat.yearlyBalances || [],
          lastUpdated: stat.timestamp || null
        })
      }
    }
  }

  return pools
}

function _extractModelFromType (type) {
  if (!type) return 'Unknown'
  const models = {
    'miner-am': 'Antminer',
    'miner-wm': 'Whatsminer',
    'miner-av': 'Avalon'
  }

  for (const [prefix, brand] of Object.entries(models)) {
    if (type.startsWith(prefix)) {
      const suffix = type.slice(prefix.length + 1).toUpperCase()
      return suffix ? `${brand} ${suffix}` : brand
    }
  }

  return type
}

function _getAlertSeverity (alertType) {
  const severityMap = {
    all_pools_dead: 'critical',
    wrong_miner_pool: 'critical',
    wrong_miner_subaccount: 'critical',
    wrong_worker_name: 'medium',
    ip_worker_name: 'medium'
  }
  return severityMap[alertType] || 'low'
}

function _getAlertMessage (alertType, minerLabel) {
  const messageMap = {
    all_pools_dead: `All pools are dead - ${minerLabel}`,
    wrong_miner_pool: `Pool URL mismatch - ${minerLabel}`,
    wrong_miner_subaccount: `Wrong pool subaccount - ${minerLabel}`,
    wrong_worker_name: `Incorrect worker name - ${minerLabel}`,
    ip_worker_name: `Worker name uses IP address - ${minerLabel}`
  }
  return messageMap[alertType] || `Pool alert - ${minerLabel}`
}

module.exports = {
  getPoolStats,
  getPoolConfigs,
  getMinersWithPools,
  getUnitsWithPoolData,
  getPoolAlerts,
  assignPoolToMiners,
  setPowerMode
}
