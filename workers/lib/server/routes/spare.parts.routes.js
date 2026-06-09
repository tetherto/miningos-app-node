'use strict'

const {
  ENDPOINTS,
  HTTP_METHODS,
  AUTH_PERMISSIONS
} = require('../../constants')
const schemas = require('../schemas/spare.parts.schemas')
const { registerSparePart, listSpareParts, updateSparePart, getRepairHistory } = require('../handlers/spare.parts.handlers')
const { createAuthRoute, createCachedAuthRoute } = require('../lib/routeHelpers')
const { stableJsonString } = require('../../utils')

module.exports = (ctx) => [
  {
    method: HTTP_METHODS.POST,
    url: ENDPOINTS.SPARE_PARTS,
    schema: schemas.register,
    ...createAuthRoute(ctx, registerSparePart, [AUTH_PERMISSIONS.INVENTORY])
  },
  {
    method: HTTP_METHODS.GET,
    url: ENDPOINTS.SPARE_PARTS,
    schema: schemas.list,
    ...createCachedAuthRoute(
      ctx,
      (req) => [
        'spare-parts',
        stableJsonString(req.query.query),
        stableJsonString(req.query.sort),
        stableJsonString(req.query.fields),
        req.query.offset, req.query.limit,
        req.query.q, req.query.location, req.query.status
      ],
      ENDPOINTS.SPARE_PARTS,
      listSpareParts,
      [AUTH_PERMISSIONS.INVENTORY]
    )
  },
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
