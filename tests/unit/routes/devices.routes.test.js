'use strict'

const test = require('brittle')
const { testModuleStructure, testHandlerFunctions, testOnRequestFunctions } = require('../helpers/routeTestHelpers')
const { createRoutesForTest } = require('../helpers/mockHelpers')

const ROUTES_PATH = '../../../workers/lib/server/routes/devices.routes.js'

test('devices routes - module structure', (t) => {
  testModuleStructure(t, ROUTES_PATH, 'devices')
  t.pass()
})

test('devices routes - route definitions', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  const routeUrls = routes.map(route => route.url)
  t.ok(routeUrls.includes('/auth/miners'), 'should have miners route')
  t.ok(routeUrls.includes('/auth/containers'), 'should have containers route')
  t.ok(routeUrls.includes('/auth/cabinets'), 'should have cabinets route')
  t.ok(routeUrls.includes('/auth/cabinets/:id'), 'should have cabinet by id route')
  t.pass()
})

test('devices routes - HTTP methods', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  routes.forEach(route => {
    t.is(route.method, 'GET', `route ${route.url} should be GET`)
  })
  t.pass()
})

test('devices routes - handler functions', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  testHandlerFunctions(t, routes, 'devices')
  t.pass()
})

test('devices routes - onRequest functions', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  testOnRequestFunctions(t, routes, 'devices')
  t.pass()
})
