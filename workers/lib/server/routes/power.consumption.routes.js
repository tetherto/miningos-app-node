'use strict'

const {
  ENDPOINTS,
  HTTP_METHODS
} = require('../../constants')
const { getSitePowerConsumption } = require('../handlers/power.consumption.handlers')
const { createCachedAuthRoute } = require('../lib/routeHelpers')

module.exports = (ctx) => {
  return [
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.SITE_POWER_CONSUMPTION,
      schema: {
        querystring: {
          type: 'object',
          properties: {
            start: { type: 'integer' },
            end: { type: 'integer' },
            interval: { type: 'string' },
            tag: { type: 'string' },
            powerAttribute: { type: 'string' },
            totalTransformerConsumption: { type: 'boolean' },
            limit: { type: 'integer' },
            overwriteCache: { type: 'boolean' }
          },
          required: ['start', 'end']
        }
      },
      ...createCachedAuthRoute(
        ctx,
        (req) => [
          'site-power-consumption', req.query.start, req.query.end,
          req.query.interval, req.query.tag, req.query.powerAttribute,
          req.query.totalTransformerConsumption, req.query.limit
        ],
        ENDPOINTS.SITE_POWER_CONSUMPTION,
        getSitePowerConsumption
      )
    }
  ]
}
