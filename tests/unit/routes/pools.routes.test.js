'use strict'

const test = require('brittle')
const { testModuleStructure, testHandlerFunctions, testOnRequestFunctions } = require('../helpers/routeTestHelpers')
const { createRoutesForTest } = require('../helpers/mockHelpers')

const ROUTES_PATH = '../../../workers/lib/server/routes/pools.routes.js'

test('pools routes - module structure', (t) => {
  testModuleStructure(t, ROUTES_PATH, 'pools')
  t.pass()
})

test('pools routes - route definitions', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  const routeUrls = routes.map(route => route.url)
  t.ok(routeUrls.includes('/auth/pools'), 'should have pools route')
  t.ok(routeUrls.includes('/auth/pools/:pool/balance-history'), 'should have balance-history route')
  t.ok(routeUrls.includes('/auth/pool-stats/aggregate'), 'should have pool-stats aggregate route')
  t.ok(routeUrls.includes('/auth/pools/config/:id'), 'should have pools thing config route')
  t.pass()
})

test('pools routes - HTTP methods', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  routes.forEach(route => {
    t.is(route.method, 'GET', `route ${route.url} should be GET`)
  })
  t.pass()
})

test('pools routes - handler functions', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  testHandlerFunctions(t, routes, 'pools')
  t.pass()
})

test('pools routes - onRequest functions', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  testOnRequestFunctions(t, routes, 'pools')
  t.pass()
})
