'use strict'

const {
  ENDPOINTS,
  HTTP_METHODS
} = require('../../constants')
const {
  getPools
} = require('../handlers/pools.handlers')
const { createCachedAuthRoute } = require('../lib/routeHelpers')

module.exports = (ctx) => {
  const schemas = require('../schemas/pools.schemas.js')

  return [
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.POOLS,
      schema: {
        querystring: schemas.query.pools
      },
      ...createCachedAuthRoute(
        ctx,
        (req) => [
          'pools',
          req.query.filter,
          req.query.sort,
          req.query.fields
        ],
        ENDPOINTS.POOLS,
        getPools
      )
    }
  ]
}
