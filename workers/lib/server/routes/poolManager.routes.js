'use strict'

const {
  getStats,
  getPools,
  getMiners,
  getUnits,
  getAlerts,
  assignPool,
  setPowerMode
} = require('../controllers/poolManager')
const { ENDPOINTS, HTTP_METHODS } = require('../../constants')
const { createCachedAuthRoute, createAuthRoute } = require('../lib/routeHelpers')

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

const POOL_MANAGER_ASSIGN_SCHEMA = {
  body: {
    type: 'object',
    properties: {
      minerIds: {
        type: 'array',
        items: { type: 'string' }
      },
      pools: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            worker_name: { type: 'string' },
            worker_password: { type: 'string' }
          },
          required: ['url']
        },
        minItems: 1,
        maxItems: 3
      }
    },
    required: ['minerIds', 'pools']
  }
}

const POOL_MANAGER_POWER_MODE_SCHEMA = {
  body: {
    type: 'object',
    properties: {
      minerIds: {
        type: 'array',
        items: { type: 'string' }
      },
      mode: {
        type: 'string',
        enum: ['low', 'normal', 'high', 'sleep']
      }
    },
    required: ['minerIds', 'mode']
  }
}

module.exports = (ctx) => {
  return [
    // GET /auth/pool-manager/stats
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

    // GET /auth/pool-manager/pools
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

    // GET /auth/pool-manager/miners
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

    // GET /auth/pool-manager/units
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

    // GET /auth/pool-manager/alerts
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
    },

    // POST /auth/pool-manager/miners/assign
    {
      method: HTTP_METHODS.POST,
      url: ENDPOINTS.POOL_MANAGER_ASSIGN,
      schema: POOL_MANAGER_ASSIGN_SCHEMA,
      ...createAuthRoute(ctx, assignPool)
    },

    // POST /auth/pool-manager/miners/power-mode
    {
      method: HTTP_METHODS.POST,
      url: ENDPOINTS.POOL_MANAGER_POWER_MODE,
      schema: POOL_MANAGER_POWER_MODE_SCHEMA,
      ...createAuthRoute(ctx, setPowerMode)
    }
  ]
}
