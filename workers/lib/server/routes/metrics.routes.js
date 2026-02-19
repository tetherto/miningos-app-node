'use strict'

const {
  ENDPOINTS,
  HTTP_METHODS
} = require('../../constants')
const {
  getHashrate,
  getConsumption,
  getEfficiency,
  getMinerStatus
} = require('../handlers/metrics.handlers')
const { createCachedAuthRoute } = require('../lib/routeHelpers')

module.exports = (ctx) => {
  const schemas = require('../schemas/metrics.schemas.js')

  return [
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.METRICS_HASHRATE,
      schema: {
        querystring: schemas.query.hashrate
      },
      ...createCachedAuthRoute(
        ctx,
        (req) => [
          'metrics/hashrate',
          req.query.start,
          req.query.end
        ],
        ENDPOINTS.METRICS_HASHRATE,
        getHashrate
      )
    },
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.METRICS_CONSUMPTION,
      schema: {
        querystring: schemas.query.consumption
      },
      ...createCachedAuthRoute(
        ctx,
        (req) => [
          'metrics/consumption',
          req.query.start,
          req.query.end
        ],
        ENDPOINTS.METRICS_CONSUMPTION,
        getConsumption
      )
    },
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.METRICS_EFFICIENCY,
      schema: {
        querystring: schemas.query.efficiency
      },
      ...createCachedAuthRoute(
        ctx,
        (req) => [
          'metrics/efficiency',
          req.query.start,
          req.query.end
        ],
        ENDPOINTS.METRICS_EFFICIENCY,
        getEfficiency
      )
    },
    {
      method: HTTP_METHODS.GET,
      url: ENDPOINTS.METRICS_MINER_STATUS,
      schema: {
        querystring: schemas.query.minerStatus
      },
      ...createCachedAuthRoute(
        ctx,
        (req) => [
          'metrics/miner-status',
          req.query.start,
          req.query.end
        ],
        ENDPOINTS.METRICS_MINER_STATUS,
        getMinerStatus
      )
    }
  ]
}
