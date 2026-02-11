'use strict'

const {
  ENDPOINTS,
  HTTP_METHODS
} = require('../../constants')
const {
  getPoolBalanceHistory
} = require('../handlers/pools.handlers')
const { createCachedAuthRoute } = require('../lib/routeHelpers')

module.exports = (ctx) => {
  const schemas = require('../schemas/pools.schemas.js')

  return [
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.POOLS_BALANCE_HISTORY,
      schema: {
        querystring: schemas.query.balanceHistory
      },
      ...createCachedAuthRoute(
        ctx,
        (req) => [
          'pools/balance-history',
          req.params.pool,
          req.query.start,
          req.query.end,
          req.query.range
        ],
        ENDPOINTS.POOLS_BALANCE_HISTORY,
        getPoolBalanceHistory
      )
    }
  ]
}
