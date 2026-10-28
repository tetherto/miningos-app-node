'use strict'

const test = require('brittle')
const { testModuleStructure, testHandlerFunctions, testOnRequestFunctions } = require('../helpers/routeTestHelpers')
const { createRoutesForTest } = require('../helpers/mockHelpers')
const { ENDPOINTS, HTTP_METHODS, AUTH_PERMISSIONS } = require('../../../workers/lib/constants')

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
  t.ok(routeUrls.includes(ENDPOINTS.ENERGY_CONSUMPTION), 'should have energy consumption route')
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
  t.is(route.schema.body.properties.available.type, 'boolean', 'available should be a boolean')
  t.is(route.schema.body.properties.availableMw.type, 'number', 'availableMw should be a number')
  t.is(route.schema.body.properties.availableMw.minimum, 0, 'availableMw min should be 0')
  t.is(route.schema.body.properties.availableMw.maximum, 48, 'availableMw max should be 48')
  t.pass()
})

test('energy routes - availableEnergy schema validates availableMw items', (t) => {
  const Ajv = require('ajv')
  const schemas = require('../../../workers/lib/server/schemas/energy.schemas')
  const ajv = new Ajv({ coerceTypes: true })
  const validate = ajv.compile(schemas.body.availableEnergy)
  const validateHist = ajv.compile(schemas.body.availableEnergyHistory)

  t.ok(validate({ data: [{ start: 1000, end: 2000, availableMw: 5.5 }] }), 'accepts availableMw item')
  t.ok(validate({ data: [{ start: 1000, availableMw: 0 }] }), 'accepts zero availableMw')
  t.ok(validate({ data: [{ start: 1000, end: 2000, available: 1 }] }), 'accepts legacy available item')
  t.ok(validate({ data: [{ start: 1000, availableMw: 10.1 }] }), 'accepts surplus above site consumption')
  t.absent(validate({ data: [{ start: 1000, availableMw: 48.1 }] }), 'rejects availableMw above 48')
  t.absent(validate({ data: [{ start: 1000, availableMw: -1 }] }), 'rejects negative availableMw')
  t.absent(validate({ data: [{ start: 1000 }] }), 'rejects item without availableMw or available')
  t.absent(validate({ data: [{ availableMw: 5 }] }), 'rejects item without start')

  t.ok(validateHist({ start: 1000, end: 2000, availableMw: 6.5 }), 'history accepts availableMw')
  t.ok(validateHist({ start: 1000, end: 2000, available: true }), 'history accepts legacy available')
  t.absent(validateHist({ start: 1000, end: 2000 }), 'history rejects missing both fields')
  t.absent(validateHist({ start: 1000, end: 2000, availableMw: 48.1 }), 'history rejects availableMw above 48')
  t.pass()
})

test('energy routes - consumption GET and POST', (t) => {
  const routes = createRoutesForTest(ROUTES_PATH).filter(r => r.url === ENDPOINTS.ENERGY_CONSUMPTION)
  t.alike(routes.map(r => r.method).sort(), [HTTP_METHODS.GET, HTTP_METHODS.POST].sort(), 'GET and POST only, no DELETE')

  const get = routes.find(r => r.method === HTTP_METHODS.GET)
  t.alike(get.schema.querystring.required, ['start', 'end'])
  t.ok(get.preValidation, 'GET rejects a timezone param')

  const post = routes.find(r => r.method === HTTP_METHODS.POST)
  t.ok(post.preValidation, 'POST rejects a timezone param')
  t.alike(post.schema.body.required, ['entries'])
})

test('energy routes - consumption GET and POST require the powermeter permission', async (t) => {
  const checks = []
  const ctx = {
    conf: { ttl: 3600 },
    authLib: {
      resolveToken: async () => ({ userId: 'u1' }),
      tokenHasPerms: async (token, write, perms) => {
        checks.push({ write, perms })
        return true
      }
    }
  }
  const routes = require(ROUTES_PATH)(ctx).filter(r => r.url === ENDPOINTS.ENERGY_CONSUMPTION)

  for (const method of [HTTP_METHODS.GET, HTTP_METHODS.POST]) {
    const route = routes.find(r => r.method === method)
    const req = { method, headers: { authorization: 'Bearer token' }, ip: '127.0.0.1', query: {} }
    const rep = { status: () => { t.fail(`${method} should not be denied`); return rep }, send: () => rep }
    await route.onRequest(req, rep)
  }

  t.alike(checks, [
    { write: false, perms: [AUTH_PERMISSIONS.POWERMETER] },
    { write: true, perms: [AUTH_PERMISSIONS.POWERMETER] }
  ], 'GET checks powermeter at read level, POST at write level')
  t.is(AUTH_PERMISSIONS.POWERMETER, 'powermeter', 'permission key is powermeter')
})

test('energy routes - energyConsumption schema validates partial entries', (t) => {
  const Ajv = require('ajv')
  const schemas = require('../../../workers/lib/server/schemas/energy.schemas')
  const validate = new Ajv().compile(schemas.body.energyConsumption)
  const validateQuery = new Ajv({ coerceTypes: true }).compile(schemas.query.energyConsumption)
  const TS = 1767225600000
  const FIELDS = ['totalConsumptionMWh', 'cduConsumptionMWh', 'rectifier1ConsumptionMWh', 'rectifier2ConsumptionMWh']
  const full = { ts: TS, totalConsumptionMWh: 10, cduConsumptionMWh: 1, rectifier1ConsumptionMWh: 4, rectifier2ConsumptionMWh: 4 }

  t.ok(validate({ entries: [full] }), 'accepts a full entry')
  for (const field of FIELDS) {
    t.ok(validate({ entries: [{ ts: TS, [field]: 3 }] }), `accepts ${field} alone`)
    t.ok(validate({ entries: [{ ts: TS, [field]: 0 }] }), `accepts a zero ${field}`)
    t.ok(validate({ entries: [{ ts: TS, [field]: null }] }), `accepts null ${field} (clears the value)`)
    t.absent(validate({ entries: [{ ts: TS, [field]: -1 }] }), `rejects negative ${field}`)
    t.absent(validate({ entries: [{ ts: TS, [field]: 'x' }] }), `rejects non-numeric ${field}`)
  }
  t.ok(validate({ entries: [{ ts: TS, totalConsumptionMWh: null, cduConsumptionMWh: 2, rectifier1ConsumptionMWh: 0 }] }), 'accepts mixed numbers, zeros and nulls')
  t.absent(validate({ entries: [{ ts: TS }] }), 'rejects an entry that passes no value')
  t.absent(validate({ entries: [{ cduConsumptionMWh: 1 }] }), 'rejects an entry without ts')
  t.absent(validate({ entries: [{ ts: 1.5, cduConsumptionMWh: 1 }] }), 'rejects non-integer ts')
  t.absent(validate({ entries: [{ ...full, note: 'x' }] }), 'rejects unknown fields')
  t.absent(validate({ entries: [] }), 'rejects empty entries')
  t.absent(validate({}), 'rejects missing entries')
  t.absent(validate({ entries: new Array(745).fill(full) }), 'rejects more than a month of hours')

  t.ok(validateQuery({ start: '0', end: '3600000' }), 'query coerces start/end')
  t.absent(validateQuery({ start: 0 }), 'query requires end')
})

test('energy routes - consumption POST rejects values Fastify would coerce', async (t) => {
  const Fastify = require('fastify')
  const route = createRoutesForTest(ROUTES_PATH)
    .find(r => r.url === ENDPOINTS.ENERGY_CONSUMPTION && r.method === HTTP_METHODS.POST)
  const app = Fastify()
  app.setErrorHandler((err, req, rep) => rep.code(400).send({ message: err.message }))
  // record the parsed body rather than echoing it back in the response
  let received
  app.post('/x', { schema: route.schema, preValidation: route.preValidation }, async (req) => { received = req.body; return {} })
  t.teardown(() => app.close())

  const send = (entry) => app.inject({ method: 'POST', url: '/x', payload: { entries: [entry] } })
  const TS = 3600000

  // sanity: without the hook these are silently coerced (the reason it exists)
  const plain = Fastify()
  let coerced
  plain.post('/x', { schema: route.schema }, async (req) => { coerced = req.body; return {} })
  t.teardown(() => plain.close())
  await plain.inject({ method: 'POST', url: '/x', payload: { entries: [{ ts: TS, cduConsumptionMWh: '' }] } })
  t.is(coerced.entries[0].cduConsumptionMWh, null, 'an empty string would otherwise become null, i.e. clear a value')

  for (const bad of ['', '7', false, true, [], {}]) {
    const res = await send({ ts: TS, cduConsumptionMWh: bad })
    t.is(res.statusCode, 400, `cdu=${JSON.stringify(bad)} rejected`)
    t.is(res.json().message, 'ERR_CONSUMPTION_INVALID')
  }
  for (const bad of ['3600000', false]) {
    const res = await send({ ts: bad, cduConsumptionMWh: 1 })
    t.is(res.statusCode, 400, `ts=${JSON.stringify(bad)} rejected`)
    t.is(res.json().message, 'ERR_TS_INVALID')
  }

  for (const good of [null, 0, 5.5]) {
    const res = await send({ ts: TS, cduConsumptionMWh: good })
    t.is(res.statusCode, 200, `cdu=${JSON.stringify(good)} accepted`)
    t.is(received.entries[0].cduConsumptionMWh, good, 'passed through unchanged')
  }
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
