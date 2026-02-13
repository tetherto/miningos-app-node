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

/**
 * Get pool-level stats from minerpool workers via getWrkExtData
 */
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

/**
 * Get pool configs from minerpool workers via getWrkExtData
 */
const getPoolConfigs = async (ctx) => {
  return _fetchPoolStats(ctx)
}

/**
 * Get miners from listThings, mapped to actual thing data structure
 */
const getMinersWithPools = async (ctx, filters = {}) => {
  const { search, model, page = 1, limit = 50 } = filters

  const results = await requestRpcMapLimit(ctx, LIST_THINGS, {
    type: WORKER_TYPES.MINER,
    query: {}
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
        site: thing.info?.site || _extractTagValue(thing.tags, 'site-'),
        container: thing.info?.container || _extractTagValue(thing.tags, 'container-'),
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

/**
 * Get units (containers) with miner counts from listThings
 */
const getUnitsWithPoolData = async (ctx) => {
  const results = await requestRpcMapLimit(ctx, LIST_THINGS, {
    type: WORKER_TYPES.MINER,
    query: {}
  })

  const unitsMap = new Map()

  results.forEach((clusterData) => {
    if (!Array.isArray(clusterData)) return

    clusterData.forEach((thing) => {
      if (!thing?.type?.startsWith('miner-')) return

      const container = thing.info?.container ||
        _extractTagValue(thing.tags, 'container-') || 'unassigned'
      const site = thing.info?.site || _extractTagValue(thing.tags, 'site-') || ''

      if (!unitsMap.has(container)) {
        unitsMap.set(container, {
          name: container,
          site,
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
    site: unit.site,
    minersCount: unit.miners.length,
    nominalHashrate: unit.totalNominalHashrate
  }))
}

/**
 * Get pool-related alerts from listThings
 */
const getPoolAlerts = async (ctx, filters = {}) => {
  const { limit = 50 } = filters

  const results = await requestRpcMapLimit(ctx, LIST_THINGS, {
    type: WORKER_TYPES.MINER,
    query: {}
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
            container: thing.info?.container || _extractTagValue(thing.tags, 'container-'),
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

/**
 * Assign pool config to miners via applyThings
 */
const assignPoolToMiners = async (ctx, minerIds, pools, auditInfo = {}) => {
  if (!Array.isArray(minerIds) || minerIds.length === 0) {
    throw new Error('ERR_MINER_IDS_REQUIRED')
  }

  if (!Array.isArray(pools) || pools.length === 0 || !pools[0]?.url) {
    throw new Error('ERR_POOLS_REQUIRED')
  }

  const formattedPools = pools.map(pool => ({
    url: pool.url,
    worker_name: pool.worker_name || '',
    worker_password: pool.worker_password || ''
  }))

  if (ctx.logger && auditInfo.user) {
    ctx.logger.info({
      action: 'pool_assignment',
      user: auditInfo.user,
      timestamp: auditInfo.timestamp,
      minerCount: minerIds.length,
      poolUrl: pools[0].url
    }, 'Pool assignment initiated')
  }

  const params = {
    type: WORKER_TYPES.MINER,
    query: {
      id: { $in: minerIds }
    },
    action: 'setupPools',
    params: { pools: formattedPools }
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

/**
 * Set power mode for miners via applyThings
 */
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

// --- Internal helpers ---

/**
 * Fetch and flatten pool stats from minerpool workers via getWrkExtData
 * Follows the pattern from PR #7/#8: getWrkExtData with minerpool type
 */
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

/**
 * Extract a human-readable model name from thing type
 * e.g. 'miner-am-s19xp' → 'Antminer S19XP'
 *      'miner-wm-m56s'  → 'Whatsminer M56S'
 */
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

/**
 * Extract a value from a tags array by prefix
 * e.g. tags=['site-pintado','container-bitmain-imm-1'], prefix='container-' → 'bitmain-imm-1'
 */
function _extractTagValue (tags, prefix) {
  if (!Array.isArray(tags)) return null
  const tag = tags.find(t => typeof t === 'string' && t.startsWith(prefix))
  return tag ? tag.slice(prefix.length) : null
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
