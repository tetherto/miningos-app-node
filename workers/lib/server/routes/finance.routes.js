'use strict'

const {
  ENDPOINTS,
  HTTP_METHODS
} = require('../../constants')
const {
  getCostSummary
} = require('../handlers/finance.handlers')
const { createCachedAuthRoute } = require('../lib/routeHelpers')

module.exports = (ctx) => {
  const schemas = require('../schemas/finance.schemas.js')

  return [
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.FINANCE_COST_SUMMARY,
      schema: {
        querystring: schemas.query.costSummary
      },
      ...createCachedAuthRoute(
        ctx,
        (req) => [
          'finance/cost-summary',
          req.query.start,
          req.query.end,
          req.query.period
        ],
        ENDPOINTS.FINANCE_COST_SUMMARY,
        getCostSummary
      )
    }
  ]
}
