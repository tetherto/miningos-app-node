'use strict'

const {
  ENDPOINTS,
  HTTP_METHODS
} = require('../../constants')
const {
  getEbitda
} = require('../handlers/finance.handlers')
const { createCachedAuthRoute } = require('../lib/routeHelpers')

module.exports = (ctx) => {
  const schemas = require('../schemas/finance.schemas.js')

  return [
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.FINANCE_EBITDA,
      schema: {
        querystring: schemas.query.ebitda
      },
      ...createCachedAuthRoute(
        ctx,
        (req) => [
          'finance/ebitda',
          req.query.start,
          req.query.end,
          req.query.period
        ],
        ENDPOINTS.FINANCE_EBITDA,
        getEbitda
      )
    }
  ]
}
