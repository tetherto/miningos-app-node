'use strict'

const {
  getStats,
  getPools,
  getMiners,
  getUnits,
  getAlerts
} = require('../controllers/poolManager')
const { ENDPOINTS, HTTP_METHODS } = require('../../constants')
const { createCachedAuthRoute } = require('../lib/routeHelpers')

const POOL_MANAGER_MINERS_SCHEMA = {
  querystring: {
    type: 'object',
    properties: {
      search: { type: 'string' },
      status: { type: 'string' },
      poolUrl: { type: 'string' },
      model: { type: 'string' },
      page: { type: 'integer' },
      limit: { type: 'integer' },
      overwriteCache: { type: 'boolean' }
    }
  }
}

const POOL_MANAGER_ALERTS_SCHEMA = {
  querystring: {
    type: 'object',
    properties: {
      limit: { type: 'integer' },
      overwriteCache: { type: 'boolean' }
    }
  }
}

const POOL_MANAGER_CACHE_SCHEMA = {
  querystring: {
    type: 'object',
    properties: {
      overwriteCache: { type: 'boolean' }
    }
  }
}

module.exports = (ctx) => {
  return [
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.POOL_MANAGER_STATS,
      schema: POOL_MANAGER_CACHE_SCHEMA,
      ...createCachedAuthRoute(
        ctx,
        ['pool-manager/stats'],
        ENDPOINTS.POOL_MANAGER_STATS,
        getStats
      )
    },

    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.POOL_MANAGER_POOLS,
      schema: POOL_MANAGER_CACHE_SCHEMA,
      ...createCachedAuthRoute(
        ctx,
        ['pool-manager/pools'],
        ENDPOINTS.POOL_MANAGER_POOLS,
        getPools
      )
    },

    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.POOL_MANAGER_MINERS,
      schema: POOL_MANAGER_MINERS_SCHEMA,
      ...createCachedAuthRoute(
        ctx,
        (req) => [
          'pool-manager/miners',
          req.query.search,
          req.query.status,
          req.query.poolUrl,
          req.query.model,
          req.query.page,
          req.query.limit
        ],
        ENDPOINTS.POOL_MANAGER_MINERS,
        getMiners
      )
    },

    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.POOL_MANAGER_UNITS,
      schema: POOL_MANAGER_CACHE_SCHEMA,
      ...createCachedAuthRoute(
        ctx,
        ['pool-manager/units'],
        ENDPOINTS.POOL_MANAGER_UNITS,
        getUnits
      )
    },

    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.POOL_MANAGER_ALERTS,
      schema: POOL_MANAGER_ALERTS_SCHEMA,
      ...createCachedAuthRoute(
        ctx,
        (req) => [
          'pool-manager/alerts',
          req.query.limit
        ],
        ENDPOINTS.POOL_MANAGER_ALERTS,
        getAlerts
      )
    }
  ]
}
