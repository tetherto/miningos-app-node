'use strict'

const test = require('brittle')
const { testModuleStructure, testHandlerFunctions, testOnRequestFunctions } = require('../helpers/routeTestHelpers')
const { createRoutesForTest } = require('../helpers/mockHelpers')

const ROUTES_PATH = '../../../workers/lib/server/routes/finance.routes.js'

test('finance routes - module structure', (t) => {
  testModuleStructure(t, ROUTES_PATH, 'finance')
  t.pass()
})

test('finance routes - route definitions', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  const routeUrls = routes.map(route => route.url)
  t.ok(routeUrls.includes('/auth/finance/cost-summary'), 'should have cost-summary route')
  t.pass()
})

test('finance routes - HTTP methods', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  routes.forEach(route => {
    t.is(route.method, 'GET', `route ${route.url} should be GET`)
  })
  t.pass()
})

test('finance routes - handler functions', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  testHandlerFunctions(t, routes, 'finance')
  t.pass()
})

test('finance routes - onRequest functions', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  testOnRequestFunctions(t, routes, 'finance')
  t.pass()
})
