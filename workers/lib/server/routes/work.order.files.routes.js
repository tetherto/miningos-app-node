'use strict'

const {
  ENDPOINTS,
  HTTP_METHODS,
  AUTH_PERMISSIONS
} = require('../../constants')
const {
  uploadWorkOrderFile,
  downloadWorkOrderFile,
  deleteWorkOrderFile
} = require('../handlers/work.order.files.handlers')
const { createAuthRoute } = require('../lib/routeHelpers')

const idParams = {
  type: 'object',
  required: ['id'],
  properties: { id: { type: 'string', minLength: 1 } }
}
const idAndFileParams = {
  type: 'object',
  required: ['id', 'fileId'],
  properties: {
    id: { type: 'string', minLength: 1 },
    fileId: { type: 'string', minLength: 1 }
  }
}

module.exports = (ctx) => [
  {
    method: HTTP_METHODS.POST,
    url: ENDPOINTS.WORK_ORDER_FILES,
    schema: { params: idParams },
    ...createAuthRoute(ctx, uploadWorkOrderFile, [AUTH_PERMISSIONS.WORK_ORDER])
  },
  {
    method: HTTP_METHODS.GET,
    url: ENDPOINTS.WORK_ORDER_FILE_BY_ID,
    schema: { params: idAndFileParams },
    ...createAuthRoute(ctx, downloadWorkOrderFile, [AUTH_PERMISSIONS.WORK_ORDER])
  },
  {
    method: HTTP_METHODS.DELETE,
    url: ENDPOINTS.WORK_ORDER_FILE_BY_ID,
    schema: { params: idAndFileParams },
    ...createAuthRoute(ctx, deleteWorkOrderFile, [AUTH_PERMISSIONS.WORK_ORDER])
  }
]
