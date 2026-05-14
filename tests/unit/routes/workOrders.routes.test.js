'use strict'

const test = require('brittle')
const {
  testModuleStructure,
  testHandlerFunctions,
  testOnRequestFunctions
} = require('../helpers/routeTestHelpers')
const { ENDPOINTS, HTTP_METHODS } = require('../../../workers/lib/constants')

const ROUTES_PATH = '../../../workers/lib/server/routes/workOrders.routes'

test('workOrders.routes: module structure', (t) => {
  const routes = testModuleStructure(t, ROUTES_PATH, 'workOrders')
  testHandlerFunctions(t, routes, 'workOrders')
  testOnRequestFunctions(t, routes, 'workOrders')
})

test('workOrders.routes: registers every WO endpoint', (t) => {
  const routes = require(ROUTES_PATH)({})
  const expected = [
    { method: HTTP_METHODS.POST, url: ENDPOINTS.WORK_ORDERS },
    { method: HTTP_METHODS.GET, url: ENDPOINTS.WORK_ORDERS },
    { method: HTTP_METHODS.GET, url: ENDPOINTS.WORK_ORDER_BY_ID },
    { method: HTTP_METHODS.GET, url: ENDPOINTS.WORK_ORDER_AUDIT },
    { method: HTTP_METHODS.PATCH, url: ENDPOINTS.WORK_ORDER_BY_ID },
    { method: HTTP_METHODS.POST, url: ENDPOINTS.WORK_ORDER_CLOSE },
    { method: HTTP_METHODS.POST, url: ENDPOINTS.WORK_ORDER_CANCEL },
    { method: HTTP_METHODS.POST, url: ENDPOINTS.WORK_ORDER_ASSIGN }
  ]
  for (const e of expected) {
    const found = routes.find(r => r.method === e.method && r.url === e.url)
    t.ok(found, `route ${e.method} ${e.url} present`)
  }
})

test('workOrders.routes: every route has onRequest auth guard', (t) => {
  const routes = require(ROUTES_PATH)({})
  for (const r of routes) {
    t.ok(typeof r.onRequest === 'function', `${r.method} ${r.url} has onRequest`)
  }
})
