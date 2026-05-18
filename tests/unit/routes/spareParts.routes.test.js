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
    { method: HTTP_METHODS.GET, url: ENDPOINTS.SPARE_PARTS },
    { method: HTTP_METHODS.PUT, url: ENDPOINTS.SPARE_PART_BY_ID },
    { method: HTTP_METHODS.GET, url: ENDPOINTS.SPARE_PART_REPAIR_HISTORY }
  ]
  for (const e of expected) {
    const found = routes.find(r => r.method === e.method && r.url === e.url)
    t.ok(found, `${e.method} ${e.url}`)
  }
})

test('spareParts.routes: list cache key includes every filter shortcut', (t) => {
  const { createCachedAuthRoute } = require('../../../workers/lib/server/lib/routeHelpers')
  let capturedKeyFn
  const orig = createCachedAuthRoute
  require.cache[require.resolve('../../../workers/lib/server/lib/routeHelpers')].exports.createCachedAuthRoute =
    (ctx, keyParts, endpoint, handler, perms) => {
      if (endpoint === ENDPOINTS.SPARE_PARTS) capturedKeyFn = keyParts
      return orig(ctx, keyParts, endpoint, handler, perms)
    }
  delete require.cache[require.resolve(ROUTES_PATH)]
  require(ROUTES_PATH)({})

  const req = {
    query: {
      query: '{"info.foo":1}',
      sort: '{"code":1}',
      fields: '{}',
      offset: 0,
      limit: 10,
      q: 'AB:CD',
      location: 'Site Lab',
      status: 'faulty'
    }
  }
  const key = capturedKeyFn(req)
  for (const expected of ['{"info.foo":1}', '{"code":1}', '{}', 0, 10, 'AB:CD', 'Site Lab', 'faulty']) {
    t.ok(key.includes(expected), `cache key includes ${JSON.stringify(expected)}`)
  }

  require.cache[require.resolve('../../../workers/lib/server/lib/routeHelpers')].exports.createCachedAuthRoute = orig
})
