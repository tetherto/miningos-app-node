'use strict'

const test = require('brittle')
const { testModuleStructure, testHandlerFunctions } = require('../helpers/routeTestHelpers')
const { createRoutesForTest } = require('../helpers/mockHelpers')

const ROUTES_PATH = '../../../workers/lib/server/routes/power.consumption.routes.js'

test('power consumption routes - module structure', (t) => {
  testModuleStructure(t, ROUTES_PATH, '/site/power-consumption')
  t.pass()
})

test('power consumption routes - route definitions', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)

  const routeUrls = routes.map(route => route.url)
  t.ok(routeUrls.includes('/auth/site/power-consumption'), 'should have power consumption route')

  t.pass()
})

test('power consumption routes - HTTP methods', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)

  const route = routes.find(r => r.url === '/auth/site/power-consumption')
  t.is(route.method, 'GET', 'power consumption route should be GET')

  t.pass()
})

test('power consumption routes - schema validation', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)

  const route = routes.find(r => r.url === '/auth/site/power-consumption')
  t.ok(route.schema, 'route should have schema')
  t.ok(route.schema.querystring, 'should have querystring schema')
  t.is(route.schema.querystring.properties.start.type, 'integer', 'start should be integer')
  t.is(route.schema.querystring.properties.end.type, 'integer', 'end should be integer')
  t.is(route.schema.querystring.properties.interval.type, 'string', 'interval should be string')
  t.is(route.schema.querystring.properties.tag.type, 'string', 'tag should be string')
  t.is(route.schema.querystring.properties.overwriteCache.type, 'boolean', 'overwriteCache should be boolean')
  t.alike(route.schema.querystring.required, ['start', 'end'], 'start and end should be required')

  t.pass()
})

test('power consumption routes - handler functions', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)
  testHandlerFunctions(t, routes, '/site/power-consumption')
  t.pass()
})

test('power consumption routes - onRequest functions', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH)

  routes.forEach(route => {
    t.ok(typeof route.onRequest === 'function', `route ${route.url} should have onRequest function`)
  })

  t.pass()
})
