'use strict'

const {
  authCheck
} = require('../lib/authCheck')
const { send200 } = require('../lib/send200')
const {
  cachedRoute
} = require('../lib/cachedRoute')
const {
  getStats,
  getPools,
  getMiners,
  getUnits,
  getAlerts,
  assignPool,
  setPowerMode
} = require('../controllers/poolManager')
const { ENDPOINTS, HTTP_METHODS, CACHE_KEYS } = require('../../constants')

const POOL_MANAGER_SCHEMA = {
  querystring: {
    type: 'object',
    properties: {
      regions: { type: 'array' },
      overwriteCache: { type: 'boolean' }
    }
  }
}

const POOL_MANAGER_MINERS_SCHEMA = {
  querystring: {
    type: 'object',
    properties: {
      regions: { type: 'array' },
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

const POOL_MANAGER_ASSIGN_SCHEMA = {
  body: {
    type: 'object',
    properties: {
      regions: { type: 'array' },
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
      regions: { type: 'array' },
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
      schema: POOL_MANAGER_SCHEMA,
      onRequest: async (req, rep) => {
        await authCheck(ctx, req, rep)
      },
      handler: async (req, rep) => {
        const key = [
          CACHE_KEYS.POOL_MANAGER_STATS,
          req.query.regions
        ]
        return send200(
          rep,
          await cachedRoute(
            ctx,
            key,
            ENDPOINTS.POOL_MANAGER_STATS,
            () => getStats(ctx, req),
            req.query.overwriteCache
          )
        )
      }
    },

    // GET /auth/pool-manager/pools
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.POOL_MANAGER_POOLS,
      schema: POOL_MANAGER_SCHEMA,
      onRequest: async (req, rep) => {
        await authCheck(ctx, req, rep)
      },
      handler: async (req, rep) => {
        const key = [
          CACHE_KEYS.POOL_MANAGER_POOLS,
          req.query.regions
        ]
        return send200(
          rep,
          await cachedRoute(
            ctx,
            key,
            ENDPOINTS.POOL_MANAGER_POOLS,
            () => getPools(ctx, req),
            req.query.overwriteCache
          )
        )
      }
    },

    // GET /auth/pool-manager/miners
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.POOL_MANAGER_MINERS,
      schema: POOL_MANAGER_MINERS_SCHEMA,
      onRequest: async (req, rep) => {
        await authCheck(ctx, req, rep)
      },
      handler: async (req, rep) => {
        const key = [
          CACHE_KEYS.POOL_MANAGER_MINERS,
          req.query.regions,
          req.query.search,
          req.query.status,
          req.query.poolUrl,
          req.query.model,
          req.query.page,
          req.query.limit
        ]
        return send200(
          rep,
          await cachedRoute(
            ctx,
            key,
            ENDPOINTS.POOL_MANAGER_MINERS,
            () => getMiners(ctx, req),
            req.query.overwriteCache
          )
        )
      }
    },

    // GET /auth/pool-manager/units
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.POOL_MANAGER_UNITS,
      schema: POOL_MANAGER_SCHEMA,
      onRequest: async (req, rep) => {
        await authCheck(ctx, req, rep)
      },
      handler: async (req, rep) => {
        const key = [
          CACHE_KEYS.POOL_MANAGER_UNITS,
          req.query.regions
        ]
        return send200(
          rep,
          await cachedRoute(
            ctx,
            key,
            ENDPOINTS.POOL_MANAGER_UNITS,
            () => getUnits(ctx, req),
            req.query.overwriteCache
          )
        )
      }
    },

    // GET /auth/pool-manager/alerts
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.POOL_MANAGER_ALERTS,
      schema: POOL_MANAGER_SCHEMA,
      onRequest: async (req, rep) => {
        await authCheck(ctx, req, rep)
      },
      handler: async (req, rep) => {
        const key = [
          CACHE_KEYS.POOL_MANAGER_ALERTS,
          req.query.regions,
          req.query.limit
        ]
        return send200(
          rep,
          await cachedRoute(
            ctx,
            key,
            ENDPOINTS.POOL_MANAGER_ALERTS,
            () => getAlerts(ctx, req),
            req.query.overwriteCache
          )
        )
      }
    },

    // POST /auth/pool-manager/miners/assign
    {
      method: HTTP_METHODS.POST,
      url: ENDPOINTS.POOL_MANAGER_ASSIGN,
      schema: POOL_MANAGER_ASSIGN_SCHEMA,
      onRequest: async (req, rep) => {
        await authCheck(ctx, req, rep)
      },
      handler: async (req, rep) => {
        return send200(rep, await assignPool(ctx, req))
      }
    },

    // POST /auth/pool-manager/miners/power-mode
    {
      method: HTTP_METHODS.POST,
      url: ENDPOINTS.POOL_MANAGER_POWER_MODE,
      schema: POOL_MANAGER_POWER_MODE_SCHEMA,
      onRequest: async (req, rep) => {
        await authCheck(ctx, req, rep)
      },
      handler: async (req, rep) => {
        return send200(rep, await setPowerMode(ctx, req))
      }
    }
  ]
}
