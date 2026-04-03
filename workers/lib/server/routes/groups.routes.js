'use strict'

const {
  ENDPOINTS,
  HTTP_METHODS,
  AUTH_CAPS,
  AUTH_LEVELS
} = require('../../constants')
const { getGroupStats } = require('../handlers/groups.handlers')
const { createCachedAuthRoute } = require('../lib/routeHelpers')

module.exports = (ctx) => {
  const schemas = require('../schemas/groups.schemas.js')

  return [
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.GROUPS_STATS,
      schema: {
        querystring: schemas.query.groupsStats
      },
      ...createCachedAuthRoute(
        ctx,
        (req) => [
          'groups/stats',
          req.query.racks
        ],
        ENDPOINTS.GROUPS_STATS,
        getGroupStats,
        [`${AUTH_CAPS.m}:${AUTH_LEVELS.READ}`]
      )
    }
  ]
}
