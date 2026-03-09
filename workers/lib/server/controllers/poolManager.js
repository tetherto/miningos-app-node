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

module.exports = {
  getStats,
  getPools,
  getMiners,
  getUnits,
  getAlerts
}
