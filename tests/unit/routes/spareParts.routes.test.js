'use strict'

const test = require('brittle')
const {
  testModuleStructure,
  testHandlerFunctions,
  testOnRequestFunctions
} = require('../helpers/routeTestHelpers')
const { ENDPOINTS, HTTP_METHODS } = require('../../../workers/lib/constants')

const ROUTES_PATH = '../../../workers/lib/server/routes/spareParts.routes'

test('spareParts.routes: module structure', (t) => {
  const routes = testModuleStructure(t, ROUTES_PATH, 'spareParts')
  testHandlerFunctions(t, routes, 'spareParts')
  testOnRequestFunctions(t, routes, 'spareParts')
})

test('spareParts.routes: registers expected endpoints', (t) => {
  const routes = require(ROUTES_PATH)({})
  const expected = [
    { method: HTTP_METHODS.POST, url: ENDPOINTS.SPARE_PARTS },
    { method: HTTP_METHODS.PUT, url: ENDPOINTS.SPARE_PART_BY_ID },
    { method: HTTP_METHODS.GET, url: ENDPOINTS.SPARE_PART_REPAIR_HISTORY }
  ]
  for (const e of expected) {
    const found = routes.find(r => r.method === e.method && r.url === e.url)
    t.ok(found, `${e.method} ${e.url}`)
  }
})
