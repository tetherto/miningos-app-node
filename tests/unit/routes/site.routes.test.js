'use strict'

const test = require('brittle')
const { testModuleStructure, testHandlerFunctions } = require('../helpers/routeTestHelpers')
const { createRoutesForTest } = require('../helpers/mockHelpers')

test('site routes - module structure', (t) => {
  testModuleStructure(t, '../../../workers/lib/server/routes/site.routes.js', '/site')
  t.pass()
})

test('site routes - route definitions', (t) => {
  const routes = createRoutesForTest('../../../workers/lib/server/routes/site.routes.js')

  const routeUrls = routes.map(route => route.url)
  t.ok(routeUrls.includes('/auth/site/status/live'), 'should have site status live route')

  t.pass()
})

test('site routes - HTTP methods', (t) => {
  const routes = createRoutesForTest('../../../workers/lib/server/routes/site.routes.js')

  const siteStatusRoute = routes.find(r => r.url === '/auth/site/status/live')
  t.is(siteStatusRoute.method, 'GET', 'site status live route should be GET')

  t.pass()
})

test('site routes - schema validation', (t) => {
  const routes = createRoutesForTest('../../../workers/lib/server/routes/site.routes.js')

  const siteStatusRoute = routes.find(r => r.url === '/auth/site/status/live')
  t.ok(siteStatusRoute.schema, 'site status live route should have schema')
  t.ok(siteStatusRoute.schema.querystring, 'should have querystring schema')
  t.is(siteStatusRoute.schema.querystring.properties.overwriteCache.type, 'boolean', 'overwriteCache should be boolean')

  t.pass()
})

test('site routes - handler functions', (t) => {
  const routes = createRoutesForTest('../../../workers/lib/server/routes/site.routes.js')
  testHandlerFunctions(t, routes, '/site')
  t.pass()
})

test('site routes - onRequest functions', (t) => {
  const routes = createRoutesForTest('../../../workers/lib/server/routes/site.routes.js')

  routes.forEach(route => {
    t.ok(typeof route.onRequest === 'function', `/site route ${route.url} should have onRequest function`)
  })

  t.pass()
})
