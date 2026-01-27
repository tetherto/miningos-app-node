'use strict'

const test = require('brittle')
const { testModuleStructure, testHandlerFunctions, testPreHandlerFunctions } = require('../helpers/routeTestHelpers')
const { createRoutesForTest } = require('../helpers/mockHelpers')

test('auth routes - module structure', (t) => {
  testModuleStructure(t, '../../../workers/lib/server/routes/auth.routes.js', 'auth')
  t.pass()
})

test('auth routes - route definitions', (t) => {
  const routes = createRoutesForTest('../../../workers/lib/server/routes/auth.routes.js')

  const routeUrls = routes.map(route => route.url)
  t.ok(routeUrls.includes('/oauth/google/callback'), 'should have OAuth Google callback route')
  t.ok(routeUrls.includes('/auth/userinfo'), 'should have userinfo route')
  t.ok(routeUrls.includes('/auth/token'), 'should have token route')
  t.ok(routeUrls.includes('/auth/permissions'), 'should have permissions route')
  t.ok(routeUrls.includes('/auth/ext-data'), 'should have ext-data route')

  t.pass()
})

test('auth routes - HTTP methods', (t) => {
  const routes = createRoutesForTest('../../../workers/lib/server/routes/auth.routes.js')

  const userinfoRoute = routes.find(r => r.url === '/auth/userinfo')
  t.is(userinfoRoute.method, 'GET', 'userinfo route should be GET')

  const tokenRoute = routes.find(r => r.url === '/auth/token')
  t.is(tokenRoute.method, 'POST', 'token route should be POST')

  const permissionsRoute = routes.find(r => r.url === '/auth/permissions')
  t.is(permissionsRoute.method, 'GET', 'permissions route should be GET')

  const extDataRoute = routes.find(r => r.url === '/auth/ext-data')
  t.is(extDataRoute.method, 'GET', 'ext-data route should be GET')

  t.pass()
})

test('auth routes - OAuth callback handler', (t) => {
  const mockCtx = {
    auth_a0: {
      authCallbackHandler: async () => 'test-token'
    },
    httpdOauth2_h0: {
      callbackUriUI: () => 'http://localhost:3000/callback'
    }
  }
  const routes = require('../../../workers/lib/server/routes/auth.routes.js')(mockCtx)

  const oauthRoute = routes.find(r => r.url === '/oauth/google/callback')
  t.ok(oauthRoute, 'should have OAuth callback route')
  t.ok(typeof oauthRoute.handler === 'function', 'OAuth callback should have handler')

  t.pass()
})

test('auth routes - schema validation', (t) => {
  const routes = createRoutesForTest('../../../workers/lib/server/routes/auth.routes.js')

  const extDataRoute = routes.find(r => r.url === '/auth/ext-data')
  t.ok(extDataRoute.schema, 'ext-data route should have schema')
  t.ok(extDataRoute.schema.querystring, 'ext-data route should have querystring schema')
  t.ok(extDataRoute.schema.querystring.required.includes('type'), 'type should be required')

  t.pass()
})

test('auth routes - handler functions', (t) => {
  const routes = createRoutesForTest('../../../workers/lib/server/routes/auth.routes.js')
  testHandlerFunctions(t, routes, 'auth')
  t.pass()
})

test('auth routes - preHandler functions', (t) => {
  const routes = createRoutesForTest('../../../workers/lib/server/routes/auth.routes.js')
  testPreHandlerFunctions(t, routes, 'auth')
  t.pass()
})
