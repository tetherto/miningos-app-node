'use strict'

const poolManagerService = require('../services/poolManager')

const getStats = async (ctx, req) => {
  return poolManagerService.getPoolStats(ctx)
}

const getPools = async (ctx, req) => {
  const pools = await poolManagerService.getPoolConfigs(ctx)

  return {
    pools,
    total: pools.length
  }
}

const getMiners = async (ctx, req) => {
  const filters = {
    search: req.query.search,
    status: req.query.status,
    poolUrl: req.query.poolUrl,
    model: req.query.model,
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 50
  }

  return poolManagerService.getMinersWithPools(ctx, filters)
}

const getUnits = async (ctx, req) => {
  const units = await poolManagerService.getUnitsWithPoolData(ctx)

  return {
    units,
    total: units.length
  }
}

const getAlerts = async (ctx, req) => {
  const filters = {
    limit: parseInt(req.query.limit) || 50
  }

  const alerts = await poolManagerService.getPoolAlerts(ctx, filters)

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

  const { minerIds } = req.body

  if (!minerIds || !Array.isArray(minerIds) || minerIds.length === 0) {
    throw new Error('ERR_MINER_IDS_REQUIRED')
  }

  const auditInfo = {
    user: req._info.user?.metadata?.email || 'unknown',
    timestamp: Date.now()
  }

  return poolManagerService.assignPoolToMiners(ctx, minerIds, auditInfo)
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

  return poolManagerService.setPowerMode(ctx, minerIds, mode, auditInfo)
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
