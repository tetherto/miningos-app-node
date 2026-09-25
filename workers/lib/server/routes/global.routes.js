'use strict'

const {
  ENDPOINTS,
  HTTP_METHODS,
  AUTH_CAPS,
  AUTH_PERMISSIONS,
  GLOBAL_DATA_TYPES
} = require('../../constants')
const {
  getGlobalData,
  setGlobalData,
  getFeatureConfig,
  getFeatures,
  setFeatures,
  getGlobalConfig,
  setGlobalConfig
} = require('../handlers/global.handlers')
const { getSiteName } = require('../handlers/auth.handlers')
const { createAuthRoute, createCachedAuthRoute, AUTH_ONLY } = require('../lib/routeHelpers')

const GLOBAL_DATA_READ_PERMS = {
  [GLOBAL_DATA_TYPES.ALERT_PARAMETERS]: [AUTH_PERMISSIONS.ALERT_CONFIG],
  [GLOBAL_DATA_TYPES.PRODUCTION_COSTS]: [AUTH_PERMISSIONS.REVENUE],
  [GLOBAL_DATA_TYPES.COST_PARAMETERS]: [AUTH_PERMISSIONS.REVENUE],
  [GLOBAL_DATA_TYPES.POOL_REBATES]: [AUTH_PERMISSIONS.REVENUE]
}

module.exports = (ctx) => {
  // Import schemas within the function scope where ctx is available
  const schemas = require('../schemas/global.schemas.js')

  const routes = [
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.GLOBAL_DATA,
      schema: {
        querystring: schemas.query.globalData
      },
      ...createCachedAuthRoute(
        ctx,
        (req) => [
          'global/data',
          req.query.type,
          req.query.gt,
          req.query.gte,
          req.query.lte,
          req.query.lt,
          req.query.limit,
          req.query.reverse,
          req.query.query,
          req.query.groupBy,
          req.query.model
        ],
        ENDPOINTS.GLOBAL_DATA,
        getGlobalData,
        (req) => GLOBAL_DATA_READ_PERMS[req.query.type] || AUTH_ONLY
      )
    },
    {
      method: HTTP_METHODS.POST,
      url: ENDPOINTS.GLOBAL_DATA,
      ...createAuthRoute(ctx, async (ctx, req) => {
        const success = await setGlobalData(ctx, req)
        return { success }
      }, [`${AUTH_CAPS.f}:w`]),
      schema: {
        body: schemas.body.globalData,
        querystring: schemas.query.type
      }
    },
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.FEATURE_CONFIG,
      ...createAuthRoute(ctx, getFeatureConfig, AUTH_ONLY)
    },
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.FEATURES,
      schema: {
        querystring: schemas.query.features
      },
      ...createCachedAuthRoute(
        ctx,
        ['features'],
        '/auth/features',
        getFeatures,
        AUTH_ONLY
      )
    },
    {
      method: HTTP_METHODS.POST,
      url: ENDPOINTS.FEATURES,
      ...createAuthRoute(ctx, async (ctx, req) => {
        const success = await setFeatures(ctx, req)
        return { success }
      }, [`${AUTH_CAPS.f}:w`]),
      schema: {
        body: schemas.body.features
      }
    },
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.GLOBAL_CONFIG,
      schema: {
        querystring: schemas.query.globalConfig
      },
      ...createCachedAuthRoute(
        ctx,
        ['global-config'],
        ENDPOINTS.GLOBAL_CONFIG,
        getGlobalConfig,
        AUTH_ONLY
      )
    },
    {
      method: HTTP_METHODS.POST,
      url: ENDPOINTS.GLOBAL_CONFIG,
      ...createAuthRoute(ctx, async (ctx, req) => {
        const success = await setGlobalConfig(ctx, req)
        return { success }
      }, [`${AUTH_CAPS.f}:w`]),
      schema: {
        body: schemas.body.globalConfig
      }
    },
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.SITE,
      ...createAuthRoute(ctx, () => getSiteName(ctx), AUTH_ONLY)
    }
  ]

  return routes
}
