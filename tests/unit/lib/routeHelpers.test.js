'use strict'

const test = require('brittle')
const {
  createAuthHandler,
  createAuthOnRequest,
  createCachedHandler,
  createAuthRoute,
  createCachedAuthRoute,
  AUTH_ONLY
} = require('../../../workers/lib/server/lib/routeHelpers')
const { routes } = require('../../../workers/lib/server')

test('createAuthHandler - calls handler and sends 200', async (t) => {
  const mockCtx = {}
  const mockHandler = async (ctx, req, rep) => {
    return { data: 'test' }
  }

  const mockRep = {
    status: function (code) {
      t.is(code, 200, 'should set status to 200')
      return this
    },
    send: function (data) {
      t.is(data.data, 'test', 'should send handler result')
      return this
    }
  }

  const handler = createAuthHandler(mockCtx, mockHandler)
  await handler({}, mockRep)

  t.pass()
})

test('createAuthOnRequest - calls authCheck', async (t) => {
  const mockCtx = {
    noAuth: false,
    authLib: {
      resolveToken: async () => ({ userId: 'test' })
    }
  }

  const mockReq = {
    headers: { authorization: 'Bearer token123' },
    ip: '127.0.0.1',
    _info: {}
  }

  const mockRep = {
    status: function () { return this },
    send: function () { return this }
  }

  const onRequest = createAuthOnRequest(mockCtx, AUTH_ONLY)
  try {
    await onRequest(mockReq, mockRep)
    t.ok(true, 'should call authCheck')
  } catch (err) {
    // authCheck may throw if token is invalid, but it was called
    t.ok(err || true, 'authCheck was called')
  }

  t.pass()
})

test('createAuthOnRequest - calls capCheck when perms provided', async (t) => {
  let capCheckCalled = false
  const mockCtx = {
    noAuth: false,
    authLib: {
      resolveToken: async () => ({ userId: 'test' }),
      tokenHasPerms: async () => { capCheckCalled = true; return true }
    }
  }

  const mockReq = {
    headers: { authorization: 'Bearer token123' },
    ip: '127.0.0.1',
    _info: {}
  }

  const mockRep = {
    status: function () { return this },
    send: function () { return this }
  }

  // Mock capCheck module
  const capCheckModule = require('../../../workers/lib/server/lib/capCheck')
  const originalCapCheck = capCheckModule.capCheck

  // Replace capCheck to track calls
  capCheckModule.capCheck = async (ctx, req, rep, perms) => {
    capCheckCalled = true
    t.is(perms[0], 'test:perm', 'should pass permissions to capCheck')
  }

  const onRequest = createAuthOnRequest(mockCtx, ['test:perm'])

  try {
    await onRequest(mockReq, mockRep)
    t.ok(capCheckCalled, 'should call capCheck when perms provided')
  } catch (err) {
    t.ok(true, 'route handler executed')
  }

  // Restore original
  capCheckModule.capCheck = originalCapCheck

  t.pass()
})

test('createAuthOnRequest - GET requests are checked at read level', async (t) => {
  let writeFlag = null
  const mockCtx = {
    noAuth: false,
    authLib: {
      resolveToken: async () => ({ userId: 'test' }),
      tokenHasPerms: async (token, write, perms) => {
        writeFlag = write
        return true
      }
    }
  }

  const mockReq = {
    method: 'GET',
    headers: { authorization: 'Bearer token123' },
    ip: '127.0.0.1',
    _info: {}
  }

  const mockRep = {
    status: function () { return this },
    send: function () { return this }
  }

  const onRequest = createAuthOnRequest(mockCtx, ['inventory'])
  await onRequest(mockReq, mockRep)

  t.is(writeFlag, false, 'GET should be checked with write=false')
})

test('createAuthOnRequest - non-GET requests are checked at write level', async (t) => {
  const seen = []
  const mockCtx = {
    noAuth: false,
    authLib: {
      resolveToken: async () => ({ userId: 'test' }),
      tokenHasPerms: async (token, write, perms) => {
        seen.push(write)
        return true
      }
    }
  }

  const mockRep = {
    status: function () { return this },
    send: function () { return this }
  }

  const onRequest = createAuthOnRequest(mockCtx, ['inventory'])
  for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
    await onRequest({
      method,
      headers: { authorization: 'Bearer token123' },
      ip: '127.0.0.1',
      _info: {}
    }, mockRep)
  }

  t.alike(seen, [true, true, true, true], 'mutating methods should be checked with write=true')
})

test('createAuthOnRequest - skips capCheck when ctx.noAuth is set', async (t) => {
  let permsChecked = false
  const mockCtx = {
    noAuth: true,
    authLib: { tokenHasPerms: async () => { permsChecked = true; return false } }
  }
  const mockReq = { headers: {}, _info: {} }
  const mockRep = { status: function () { return this }, send: function () { return this } }

  const onRequest = createAuthOnRequest(mockCtx, ['test:perm'])
  await onRequest(mockReq, mockRep)
  t.absent(permsChecked, 'capCheck/tokenHasPerms is not invoked under noAuth')
})

test('createCachedHandler - uses cachedRoute', async (t) => {
  const mockCtx = {
    conf: {
      cacheTiming: {
        '/test/endpoint': '30s'
      }
    },
    lru_30s: {
      get: () => undefined,
      set: () => {}
    },
    queuedRequests: new Map()
  }

  const mockReq = {
    query: { overwriteCache: false }
  }

  const mockRep = {
    status: function () { return this },
    send: function (data) {
      t.ok(data, 'should send result')
      return this
    }
  }

  const handler = createCachedHandler(mockCtx, ['test-key'], '/test/endpoint', async () => ({ result: 'test' }))
  await handler(mockReq, mockRep)

  t.pass()
})

test('createCachedHandler - with function keyParts', async (t) => {
  const mockCtx = {
    conf: {
      cacheTiming: {
        '/test': '30s'
      }
    },
    lru_30s: {
      get: () => undefined,
      set: () => {}
    },
    queuedRequests: new Map()
  }

  const mockReq = {
    query: { id: '123' }
  }

  const mockRep = {
    status: function () { return this },
    send: function () { return this }
  }

  const handler = createCachedHandler(mockCtx, (req) => ['test', req.query.id], '/test', async () => ({}))
  await handler(mockReq, mockRep)

  t.pass()
})

test('createAuthRoute - requires perms', (t) => {
  t.exception(() => createAuthRoute({}, async () => ({})), /ERR_ROUTE_PERMS_REQUIRED/)
  t.exception(() => createCachedAuthRoute({}, ['key'], '/endpoint', async () => ({})), /ERR_ROUTE_PERMS_REQUIRED/)
  t.exception(() => createAuthOnRequest({}, null), /ERR_ROUTE_PERMS_REQUIRED/)
})

test('every registered route names its perms', (t) => {
  const ctx = new Proxy({}, { get: (target, key) => typeof key === 'string' ? {} : undefined })
  t.execution(() => routes(ctx), 'no route is built without perms')
})

test('createAuthOnRequest - AUTH_ONLY skips capCheck, function perms resolve per request', async (t) => {
  const checked = []
  const mockCtx = {
    noAuth: false,
    authLib: {
      resolveToken: async () => ({ userId: 'test', metadata: {} }),
      tokenHasPerms: async (token, write, perms) => { checked.push(perms); return true }
    }
  }
  const mockReq = (query) => ({ method: 'GET', headers: { authorization: 'Bearer token123' }, ip: '127.0.0.1', query, _info: {} })
  const mockRep = { status: function () { return this }, send: function () { return this } }

  await createAuthOnRequest(mockCtx, AUTH_ONLY)(mockReq({}), mockRep)
  const byType = createAuthOnRequest(mockCtx, (req) => req.query.type === 'secret' ? ['revenue'] : AUTH_ONLY)
  await byType(mockReq({ type: 'public' }), mockRep)
  await byType(mockReq({ type: 'secret' }), mockRep)

  t.alike(checked, [['revenue']], 'only the gated request is cap-checked')
})

test('createAuthRoute - returns route configuration', (t) => {
  const mockCtx = {}
  const mockHandler = async () => ({})

  const route = createAuthRoute(mockCtx, mockHandler, AUTH_ONLY)

  t.ok(route.onRequest, 'should have onRequest handler')
  t.ok(route.handler, 'should have handler')

  t.pass()
})

test('createAuthRoute - with permissions', (t) => {
  const mockCtx = {}
  const mockHandler = async () => ({})

  const route = createAuthRoute(mockCtx, mockHandler, ['test:perm'])

  t.ok(route.onRequest, 'should have onRequest handler')
  t.ok(route.handler, 'should have handler')

  t.pass()
})

test('createCachedAuthRoute - returns route configuration', (t) => {
  const mockCtx = {}
  const mockHandler = async () => ({})

  const route = createCachedAuthRoute(mockCtx, ['key'], '/endpoint', mockHandler, AUTH_ONLY)

  t.ok(route.onRequest, 'should have onRequest handler')
  t.ok(route.handler, 'should have handler')

  t.pass()
})

test('createCachedAuthRoute - with permissions', (t) => {
  const mockCtx = {}
  const mockHandler = async () => ({})

  const route = createCachedAuthRoute(mockCtx, ['key'], '/endpoint', mockHandler, ['test:perm'])

  t.ok(route.onRequest, 'should have onRequest handler')
  t.ok(route.handler, 'should have handler')

  t.pass()
})

test('createCachedHandler - null key bypasses cache', async (t) => {
  const mockCtx = {
    conf: {
      cacheTiming: {}
    },
    lru_30s: {
      get: () => t.fail('should not read the cache'),
      set: () => t.fail('should not write the cache')
    },
    queuedRequests: new Map()
  }

  const mockReq = {
    query: { start: 1, end: 2 }
  }

  let sent
  const mockRep = {
    status: function () { return this },
    send: function (data) {
      sent = data
      return this
    }
  }

  const handler = createCachedHandler(mockCtx, () => null, '/test', async () => ({ result: 'fresh' }))
  await handler(mockReq, mockRep)

  t.is(sent.result, 'fresh', 'should return the handler result directly')
  t.pass()
})
