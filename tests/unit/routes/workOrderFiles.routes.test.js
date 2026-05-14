'use strict'

const test = require('brittle')
const {
  testModuleStructure,
  testHandlerFunctions,
  testOnRequestFunctions
} = require('../helpers/routeTestHelpers')
const { ENDPOINTS, HTTP_METHODS } = require('../../../workers/lib/constants')

const ROUTES_PATH = '../../../workers/lib/server/routes/workOrderFiles.routes'

test('workOrderFiles.routes: module structure', (t) => {
  const routes = testModuleStructure(t, ROUTES_PATH, 'workOrderFiles')
  testHandlerFunctions(t, routes, 'workOrderFiles')
  testOnRequestFunctions(t, routes, 'workOrderFiles')
})

test('workOrderFiles.routes: registers POST/GET/DELETE on the right urls', (t) => {
  const routes = require(ROUTES_PATH)({})
  for (const e of [
    { method: HTTP_METHODS.POST, url: ENDPOINTS.WORK_ORDER_FILES },
    { method: HTTP_METHODS.GET, url: ENDPOINTS.WORK_ORDER_FILE_BY_ID },
    { method: HTTP_METHODS.DELETE, url: ENDPOINTS.WORK_ORDER_FILE_BY_ID }
  ]) {
    t.ok(routes.find(r => r.method === e.method && r.url === e.url), `${e.method} ${e.url}`)
  }
})
