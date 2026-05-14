'use strict'

const test = require('brittle')
const handlers = require('../../../workers/lib/server/handlers/workOrders.handlers')
const { createMockCtxWithOrks } = require('../helpers/mockHelpers')

const RACK = 'inventory-work_order-rack-x'

const userMeta = (email = 'op@test') => ({
  _info: { authToken: 'tok', user: { metadata: { email } } }
})

const mockAuthLib = {
  getTokenPerms: async () => ({ permissions: ['inventory:rw', 'work_order:rw', 'actions:rw'] })
}

function buildSubmitFlow ({ rackId = RACK } = {}) {
  let lastPush
  const handler = async (_key, method, params) => {
    if (method === 'pushAction') {
      lastPush = params
      return { id: 'action-1', errors: [] }
    }
    return null
  }
  const ctx = createMockCtxWithOrks([{ rpcPublicKey: 'k' }], handler)
  ctx.authLib = mockAuthLib
  ctx.conf = { ...ctx.conf, workOrderRackId: rackId }
  return { ctx, get lastPush () { return lastPush } }
}

test('handlers: createWorkOrder forwards request body as the new thing info', async (t) => {
  const flow = buildSubmitFlow()
  await handlers.createWorkOrder(flow.ctx, {
    ...userMeta(),
    body: {
      type: 2,
      deviceType: 'miner',
      deviceModel: 'antminer-s19xp',
      deviceIdentifier: 'AM-1',
      issue: 'fan stopped'
    }
  })
  t.is(flow.lastPush.action, 'registerThing')
  t.is(flow.lastPush.params[0].info.deviceIdentifier, 'AM-1')
})

test('handlers: closeWorkOrder maps to updateThing with status=closed and finalResult', async (t) => {
  const flow = buildSubmitFlow()
  await handlers.closeWorkOrder(flow.ctx, {
    ...userMeta(),
    params: { id: 'wo-1' },
    body: { finalResult: 'replaced PSU' }
  })
  t.is(flow.lastPush.action, 'updateThing')
  t.is(flow.lastPush.params[0].id, 'wo-1')
  t.is(flow.lastPush.params[0].info.status, 'closed')
  t.is(flow.lastPush.params[0].info.finalResult, 'replaced PSU')
})

test('handlers: cancelWorkOrder maps to updateThing with status=cancelled', async (t) => {
  const flow = buildSubmitFlow()
  await handlers.cancelWorkOrder(flow.ctx, {
    ...userMeta(),
    params: { id: 'wo-1' },
    body: { reason: 'duplicate' }
  })
  t.is(flow.lastPush.params[0].info.status, 'cancelled')
  t.is(flow.lastPush.params[0].info.cancelReason, 'duplicate')
})

test('handlers: assignWorkOrder maps to updateThing with assignedTo', async (t) => {
  const flow = buildSubmitFlow()
  await handlers.assignWorkOrder(flow.ctx, {
    ...userMeta(),
    params: { id: 'wo-1' },
    body: { assignedTo: 'tech@test' }
  })
  t.is(flow.lastPush.params[0].info.assignedTo, 'tech@test')
})

test('handlers: listWorkOrders pins the type filter to inventory-work_order', async (t) => {
  let received
  const ctx = createMockCtxWithOrks(
    [{ rpcPublicKey: 'k1' }, { rpcPublicKey: 'k2' }],
    async (key, method, params) => {
      received = { method, params }
      return key === 'k1' ? [{ id: 'a' }] : [{ id: 'b' }]
    }
  )
  const out = await handlers.listWorkOrders(ctx, { query: {} })
  t.is(received.method, 'listThings')
  t.is(received.params.query.type, 'inventory-work_order')
  t.is(out.length, 2)
})

test('handlers: listWorkOrders passes a JSON-encoded mingo query straight through', async (t) => {
  let received
  const ctx = createMockCtxWithOrks(
    [{ rpcPublicKey: 'k' }],
    async (_k, _m, params) => { received = params; return [] }
  )
  await handlers.listWorkOrders(ctx, { query: { query: '{"info.status":"open"}' } })
  t.is(received.query['info.status'], 'open')
  t.is(received.query.type, 'inventory-work_order')
})

test('handlers: getWorkOrder filters by id+type and 404s when nothing found', async (t) => {
  const ctx = createMockCtxWithOrks(
    [{ rpcPublicKey: 'k' }],
    async (_k, _m, params) => params.query?.id === 'found' ? [{ id: 'found', code: 'IVI-2-0001' }] : []
  )
  const ok = await handlers.getWorkOrder(ctx, { params: { id: 'found' } })
  t.is(ok.id, 'found')
  await t.exception(
    () => handlers.getWorkOrder(ctx, { params: { id: 'missing' } }),
    /ERR_WORK_ORDER_NOT_FOUND/
  )
})

test('handlers: getWorkOrderAudit calls getHistoricalLogs filtered by id', async (t) => {
  let received
  const ctx = createMockCtxWithOrks(
    [{ rpcPublicKey: 'k' }],
    async (_k, method, params) => {
      received = { method, params }
      return [{ ts: 1, changes: { status: { oldValue: 'open', newValue: 'closed' } } }]
    }
  )
  const out = await handlers.getWorkOrderAudit(ctx, {
    params: { id: 'wo-1' },
    query: { limit: 50 }
  })
  t.is(received.method, 'getHistoricalLogs')
  t.is(received.params.logType, 'info')
  t.is(received.params.query['thing.id'], 'wo-1')
  t.is(out.length, 1)
})
