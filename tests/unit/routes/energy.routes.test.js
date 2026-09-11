'use strict'

const test = require('brittle')
const { testModuleStructure, testHandlerFunctions, testOnRequestFunctions } = require('../helpers/routeTestHelpers')
const { createRoutesForTest } = require('../helpers/mockHelpers')
const { ENDPOINTS, HTTP_METHODS } = require('../../../workers/lib/constants')

const ROUTES_PATH = '../../../workers/lib/server/routes/energy.routes.js'

test('energy routes - module structure', (t) => {
  testModuleStructure(t, ROUTES_PATH, 'energy')
  t.pass()
})

test('energy routes - route definitions', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  const routeUrls = routes.map(route => route.url)

  t.ok(routeUrls.includes(ENDPOINTS.ENERGY_FORECAST), 'should have forecast route')
  t.ok(routeUrls.includes(ENDPOINTS.ENERGY_FORECAST_HISTORY), 'should have forecast history route')
  t.ok(routeUrls.includes(ENDPOINTS.ENERGY_FORECAST_SETTINGS), 'should have forecast settings route')
  t.ok(routeUrls.includes(ENDPOINTS.ENERGY_FORECAST_OVERRIDE), 'should have forecast override route')
  t.ok(routeUrls.includes(ENDPOINTS.ENERGY_FORECAST_OVERRIDE_HISTORY), 'should have forecast override history route')
  t.ok(routeUrls.includes(ENDPOINTS.ENERGY_AVAILABLE), 'should have available energy route')
  t.ok(routeUrls.includes(ENDPOINTS.ENERGY_AVAILABLE_HISTORY), 'should have available energy history route')
  t.pass()
})

test('energy routes - HTTP methods', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)

  const overrideHistRoute = routes.find(r => r.url === ENDPOINTS.ENERGY_FORECAST_OVERRIDE_HISTORY)
  t.ok(overrideHistRoute, 'should register override-history route')
  t.is(overrideHistRoute.method, HTTP_METHODS.POST, 'override-history should be POST')

  const overrideRoute = routes.find(r => r.url === ENDPOINTS.ENERGY_FORECAST_OVERRIDE)
  t.is(overrideRoute.method, HTTP_METHODS.POST, 'override should be POST')

  const availableHistRoute = routes.find(r => r.url === ENDPOINTS.ENERGY_AVAILABLE_HISTORY)
  t.ok(availableHistRoute, 'should register available-history route')
  t.is(availableHistRoute.method, HTTP_METHODS.POST, 'available-history should be POST')
  t.pass()
})

test('energy routes - override-history schema matches forecastOverride', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  const route = routes.find(r => r.url === ENDPOINTS.ENERGY_FORECAST_OVERRIDE_HISTORY)

  t.ok(route.schema, 'should have schema')
  t.ok(route.schema.body, 'should have body schema')
  t.ok(route.schema.body.required.includes('start'), 'start should be required')
  t.ok(route.schema.body.required.includes('end'), 'end should be required')
  t.ok(route.schema.body.required.includes('manualOverrideMine'), 'manualOverrideMine should be required')
  t.pass()
})

test('energy routes - available-history schema matches availableEnergyHistory', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  const route = routes.find(r => r.url === ENDPOINTS.ENERGY_AVAILABLE_HISTORY)

  t.ok(route.schema, 'should have schema')
  t.ok(route.schema.body, 'should have body schema')
  t.ok(route.schema.body.required.includes('start'), 'start should be required')
  t.ok(route.schema.body.required.includes('end'), 'end should be required')
  t.ok(route.schema.body.required.includes('available'), 'available should be required')
  t.is(route.schema.body.properties.available.type, 'boolean', 'available should be a boolean')
  t.pass()
})

test('energy routes - handler functions', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  testHandlerFunctions(t, routes, 'energy')
  t.pass()
})

test('energy routes - onRequest functions', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  testOnRequestFunctions(t, routes, 'energy')
  t.pass()
})
