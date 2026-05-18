'use strict'

const { ENDPOINTS, HTTP_METHODS, AUTH_CAPS } = require('../../constants')
const { getEnergyForecast, setAvailableEnergy } = require('../handlers/energy.handlers')
const { createCachedAuthRoute, createAuthRoute } = require('../lib/routeHelpers')
const schemas = require('../schemas/energy.schemas')

module.exports = (ctx) => [
  {
    method: HTTP_METHODS.GET,
    url: ENDPOINTS.ENERGY_FORECAST,
    ...createCachedAuthRoute(
      ctx,
      (req) => ['energy-forecast'],
      ENDPOINTS.ENERGY_FORECAST,
      getEnergyForecast
    )
  },
  {
    method: HTTP_METHODS.POST,
    url: ENDPOINTS.ENERGY_AVAILABLE,
    ...createAuthRoute(ctx, async (ctx, req) => {
      return await setAvailableEnergy(ctx, req)
    }, [`${AUTH_CAPS.m}:w`]),
    schema: {
      body: schemas.body.availableEnergy
    }
  }
]
