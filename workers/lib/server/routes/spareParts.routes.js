'use strict'

const {
  ENDPOINTS,
  HTTP_METHODS,
  AUTH_PERMISSIONS
} = require('../../constants')
const schemas = require('../schemas/spareParts.schemas')
const { updateSparePart, getRepairHistory } = require('../handlers/spareParts.handlers')
const { createAuthRoute, createCachedAuthRoute } = require('../lib/routeHelpers')

module.exports = (ctx) => [
  {
    method: HTTP_METHODS.PUT,
    url: ENDPOINTS.SPARE_PART_BY_ID,
    schema: schemas.update,
    ...createAuthRoute(ctx, updateSparePart, [AUTH_PERMISSIONS.INVENTORY])
  },
  {
    method: HTTP_METHODS.GET,
    url: ENDPOINTS.SPARE_PART_REPAIR_HISTORY,
    schema: schemas.repairHistory,
    ...createCachedAuthRoute(
      ctx,
      (req) => ['spare-parts/repair-history', req.params.id, req.query.offset, req.query.limit],
      ENDPOINTS.SPARE_PART_REPAIR_HISTORY,
      getRepairHistory,
      [AUTH_PERMISSIONS.INVENTORY]
    )
  }
]
