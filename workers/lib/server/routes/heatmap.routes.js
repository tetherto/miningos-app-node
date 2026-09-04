'use strict'

const { AUTH_PERMISSIONS, ENDPOINTS, HTTP_METHODS } = require('../../constants')
const { getHeatmap, getHeatmapDates } = require('../handlers/heatmap.handlers')
const { createAuthRoute, createCachedAuthRoute } = require('../lib/routeHelpers')

module.exports = (ctx) => [
  {
    method: HTTP_METHODS.GET,
    url: ENDPOINTS.HEATMAP,
    schema: {
      querystring: {
        type: 'object',
        properties: {
          dates: {
            type: 'string',
            description: 'Comma separated snapshot dates (YYYY-MM-DD, max 10). Omit for the live site snapshot'
          },
          overwriteCache: {
            type: 'boolean'
          }
        }
      }
    },
    ...createCachedAuthRoute(
      ctx,
      (req) => ['heatmap', req.query.dates],
      ENDPOINTS.HEATMAP,
      getHeatmap,
      [AUTH_PERMISSIONS.MINER]
    )
  },
  {
    method: HTTP_METHODS.GET,
    url: ENDPOINTS.HEATMAP_DATES,
    ...createAuthRoute(ctx, getHeatmapDates, [AUTH_PERMISSIONS.MINER])
  }
]
