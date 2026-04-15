'use strict'

const {
  ENDPOINTS,
  HTTP_METHODS,
  AUTH_CAPS,
  AUTH_LEVELS
} = require('../../constants')
const { getSiteOverviewGroupsStats } = require('../handlers/siteOverview.handlers')
const { createCachedAuthRoute } = require('../lib/routeHelpers')

module.exports = (ctx) => {
  return [
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.SITE_OVERVIEW_GROUPS,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            overwriteCache: { type: 'boolean' }
          }
        }
      },
      ...createCachedAuthRoute(
        ctx,
        ['site-overview/groups'],
        ENDPOINTS.SITE_OVERVIEW_GROUPS,
        getSiteOverviewGroupsStats,
        [`${AUTH_CAPS.m}:${AUTH_LEVELS.READ}`]
      )
    }
  ]
}
