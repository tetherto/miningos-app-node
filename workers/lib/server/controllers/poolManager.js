'use strict'

const { findClusters } = require('../../utils')
const poolManagerService = require('../services/poolManager')

const getStats = async (ctx, req) => {
  const regions = _parseRegions(req.query.regions)
  const clusters = findClusters(ctx, regions)

  return poolManagerService.getPoolStats(ctx, clusters)
}

const getPools = async (ctx, req) => {
  const regions = _parseRegions(req.query.regions)
  const clusters = findClusters(ctx, regions)

  const pools = await poolManagerService.getPoolConfigs(ctx, clusters)

  return {
    pools,
    total: pools.length
  }
}

const getMiners = async (ctx, req) => {
  const regions = _parseRegions(req.query.regions)
  const clusters = findClusters(ctx, regions)

  const filters = {
    search: req.query.search,
    status: req.query.status,
    poolUrl: req.query.poolUrl,
    model: req.query.model,
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 50
  }

  return poolManagerService.getMinersWithPools(ctx, clusters, filters)
}

const getUnits = async (ctx, req) => {
  const regions = _parseRegions(req.query.regions)
  const clusters = findClusters(ctx, regions)

  const units = await poolManagerService.getUnitsWithPoolData(ctx, clusters)

  return {
    units,
    total: units.length
  }
}

const getAlerts = async (ctx, req) => {
  const regions = _parseRegions(req.query.regions)
  const clusters = findClusters(ctx, regions)

  const filters = {
    limit: parseInt(req.query.limit) || 50
  }

  const alerts = await poolManagerService.getPoolAlerts(ctx, clusters, filters)

  return {
    alerts,
    total: alerts.length
  }
}

const assignPool = async (ctx, req) => {
  const { write } = await ctx.authLib.getTokenPerms(req._info.authToken)
  if (!write) {
    throw new Error('ERR_WRITE_PERM_REQUIRED')
  }

  const hasPoolManagerPerm = await ctx.authLib.tokenHasPerms(
    req._info.authToken,
    true,
    ['pool_manager:rw']
  )
  if (!hasPoolManagerPerm) {
    throw new Error('ERR_POOL_MANAGER_PERM_REQUIRED')
  }

  const regions = _parseRegions(req.body.regions || req.query.regions)
  const clusters = findClusters(ctx, regions)

  const { minerIds, pools } = req.body

  if (!minerIds || !Array.isArray(minerIds) || minerIds.length === 0) {
    throw new Error('ERR_MINER_IDS_REQUIRED')
  }

  if (!pools || !Array.isArray(pools) || pools.length === 0) {
    throw new Error('ERR_POOLS_REQUIRED')
  }

  if (!pools[0]?.url) {
    throw new Error('ERR_POOL_URL_REQUIRED')
  }

  const auditInfo = {
    user: req._info.user?.metadata?.email || 'unknown',
    timestamp: Date.now()
  }

  return poolManagerService.assignPoolToMiners(ctx, clusters, minerIds, pools, auditInfo)
}

const setPowerMode = async (ctx, req) => {
  const { write } = await ctx.authLib.getTokenPerms(req._info.authToken)
  if (!write) {
    throw new Error('ERR_WRITE_PERM_REQUIRED')
  }

  const hasPoolManagerPerm = await ctx.authLib.tokenHasPerms(
    req._info.authToken,
    true,
    ['pool_manager:rw']
  )
  if (!hasPoolManagerPerm) {
    throw new Error('ERR_POOL_MANAGER_PERM_REQUIRED')
  }

  const regions = _parseRegions(req.body.regions || req.query.regions)
  const clusters = findClusters(ctx, regions)

  const { minerIds, mode } = req.body

  if (!minerIds || !Array.isArray(minerIds) || minerIds.length === 0) {
    throw new Error('ERR_MINER_IDS_REQUIRED')
  }

  if (!mode) {
    throw new Error('ERR_POWER_MODE_REQUIRED')
  }

  const auditInfo = {
    user: req._info.user?.metadata?.email || 'unknown',
    timestamp: Date.now()
  }

  return poolManagerService.setPowerMode(ctx, clusters, minerIds, mode, auditInfo)
}

function _parseRegions (regions) {
  if (!regions) return null

  let parsedRegions = regions

  if (Array.isArray(regions) && regions.length === 1 && typeof regions[0] === 'string') {
    try {
      parsedRegions = JSON.parse(regions[0])
    } catch {}
  }

  if (typeof parsedRegions === 'string') {
    try {
      parsedRegions = JSON.parse(parsedRegions)
    } catch {
      return null
    }
  }

  if (!Array.isArray(parsedRegions) || parsedRegions.length === 0) {
    return null
  }

  return parsedRegions.flat().filter(r => typeof r === 'string' && r.length > 0)
}

module.exports = {
  getStats,
  getPools,
  getMiners,
  getUnits,
  getAlerts,
  assignPool,
  setPowerMode
}
