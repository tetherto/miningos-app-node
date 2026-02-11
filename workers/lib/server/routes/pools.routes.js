'use strict'

const {
  ENDPOINTS,
  HTTP_METHODS
} = require('../../constants')
const {
  getPoolStatsAggregate
} = require('../handlers/pools.handlers')
const { createCachedAuthRoute } = require('../lib/routeHelpers')

module.exports = (ctx) => {
  const schemas = require('../schemas/pools.schemas.js')

  return [
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.POOL_STATS_AGGREGATE,
      schema: {
        querystring: schemas.query.poolStatsAggregate
      },
      ...createCachedAuthRoute(
        ctx,
        (req) => [
          'pool-stats/aggregate',
          req.query.start,
          req.query.end,
          req.query.range,
          req.query.pool
        ],
        ENDPOINTS.POOL_STATS_AGGREGATE,
        getPoolStatsAggregate
      )
    }
  ]
}
