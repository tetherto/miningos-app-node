'use strict'

const { ENDPOINTS, HTTP_METHODS } = require('../../constants')
const { getSiteLiveStatus } = require('../handlers/site.handlers')
const { createCachedAuthRoute } = require('../lib/routeHelpers')

module.exports = (ctx) => [
  {
    method: HTTP_METHODS.GET,
    url: ENDPOINTS.SITE_STATUS_LIVE,
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
      ['site-status-live'],
      ENDPOINTS.SITE_STATUS_LIVE,
      getSiteLiveStatus
    )
  }
]
