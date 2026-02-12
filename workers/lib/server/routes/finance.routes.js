'use strict'

const {
  ENDPOINTS,
  HTTP_METHODS
} = require('../../constants')
const {
  getEnergyBalance
} = require('../handlers/finance.handlers')
const { createCachedAuthRoute } = require('../lib/routeHelpers')

module.exports = (ctx) => {
  const schemas = require('../schemas/finance.schemas.js')

  return [
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.FINANCE_ENERGY_BALANCE,
      schema: {
        querystring: schemas.query.energyBalance
      },
      ...createCachedAuthRoute(
        ctx,
        (req) => [
          'finance/energy-balance',
          req.query.start,
          req.query.end,
          req.query.period,
          req.query.site
        ],
        ENDPOINTS.FINANCE_ENERGY_BALANCE,
        getEnergyBalance
      )
    }
  ]
}
