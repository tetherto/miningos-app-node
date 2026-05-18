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

function buildSubmitFlow ({ rackId = RACK, parts = [] } = {}) {
  let lastPush
  const handler = async (_key, method, params) => {
    if (method === 'pushAction') {
      lastPush = params
      return { id: 'action-1', errors: [] }
    }
    if (method === 'listThings') return parts
    return null
  }
  const ctx = createMockCtxWithOrks([{ rpcPublicKey: 'k' }], handler)
  ctx.authLib = mockAuthLib
  ctx.conf = { ...ctx.conf, workOrderRackId: rackId }
  return { ctx, get lastPush () { return lastPush } }
}

test('handlers: createWorkOrder Type 2 resolves part and forwards body as info', async (t) => {
  const flow = buildSubmitFlow({ parts: [{ id: 'part-1', code: 'PSU-1', type: 'inventory-miner_part-psu', info: { serialNum: 'AM-1' } }] })
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
  t.is(flow.lastPush.params[0].info.partsMoves[0].partId, 'part-1')
  t.is(flow.lastPush.params[0].info.partsMoves[0].role, 'diagnosis')
})

test('handlers: createWorkOrder rejects unknown deviceType with ERR_INVALID_DEVICE_TYPE', async (t) => {
  const flow = buildSubmitFlow()
  await t.exception(
    () => handlers.createWorkOrder(flow.ctx, {
      ...userMeta(),
      body: { type: 2, deviceType: 'cooling', deviceModel: 'm', deviceIdentifier: 'x', issue: 'i' }
    }),
    /ERR_INVALID_DEVICE_TYPE/
  )
})

test('handlers: createWorkOrder 400s ERR_PART_NOT_FOUND when deviceIdentifier resolves to nothing', async (t) => {
  const flow = buildSubmitFlow({ parts: [] })
  await t.exception(
    () => handlers.createWorkOrder(flow.ctx, {
      ...userMeta(),
      body: { type: 2, deviceType: 'psu', deviceModel: 'm', deviceIdentifier: 'unknown-sn', issue: 'i' }
    }),
    /ERR_PART_NOT_FOUND/
  )
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

function listFlow ({ items = [], total = 0 } = {}) {
  let lastList, lastCount
  const handler = async (_key, method, params) => {
    if (method === 'listThings') { lastList = params; return items }
    if (method === 'getThingsCount') { lastCount = params; return total }
    return null
  }
  const ctx = createMockCtxWithOrks([{ rpcPublicKey: 'k' }], handler)
  return {
    ctx,
    get lastList () { return lastList },
    get lastCount () { return lastCount }
  }
}

test('handlers: listWorkOrders returns paginated envelope with type pinned', async (t) => {
  const flow = listFlow({ items: [{ id: 'a' }, { id: 'b' }], total: 7 })
  const out = await handlers.listWorkOrders(flow.ctx, { query: { offset: 0, limit: 2 } })
  t.is(flow.lastList.query.type, 'inventory-work_order', 'list pinned to WO type')
  t.is(flow.lastCount.query.type, 'inventory-work_order', 'count pinned to WO type')
  t.alike(out.data.map(o => o.id), ['a', 'b'])
  t.is(out.totalCount, 7)
  t.is(out.offset, 0)
  t.is(out.limit, 2)
  t.is(out.hasMore, true)
})

test('handlers: listWorkOrders passes a JSON-encoded mingo query straight through', async (t) => {
  const flow = listFlow()
  await handlers.listWorkOrders(flow.ctx, { query: { query: '{"info.status":"open"}' } })
  t.is(flow.lastList.query['info.status'], 'open', 'mingo passthrough')
  t.is(flow.lastList.query.type, 'inventory-work_order', 'type still pinned')
})

test('handlers: listWorkOrders ?q builds a regex $or against code and info.issue', async (t) => {
  const flow = listFlow()
  await handlers.listWorkOrders(flow.ctx, { query: { q: 'IVI-2-0001' } })
  const or = flow.lastList.query.$or
  t.is(or.length, 2)
  t.alike(or[0], { code: { $regex: 'IVI-2-0001' } })
  t.alike(or[1], { 'info.issue': { $regex: 'IVI-2-0001', $options: 'i' } })
})

test('handlers: listWorkOrders ?q escapes regex metacharacters', async (t) => {
  const flow = listFlow()
  await handlers.listWorkOrders(flow.ctx, { query: { q: 'a.b+c*' } })
  t.is(flow.lastList.query.$or[0].code.$regex, 'a\\.b\\+c\\*')
})

test('handlers: listWorkOrders shortcuts map to mingo paths', async (t) => {
  const flow = listFlow()
  await handlers.listWorkOrders(flow.ctx, {
    query: {
      assignee: 'u123',
      creator: 'op@test',
      partId: 'PSU-WM-CB6_V5-01',
      status: 'open',
      type: 2,
      from: 1700000000000,
      to: 1700864000000
    }
  })
  t.is(flow.lastList.query['info.assignedTo'], 'u123')
  t.is(flow.lastList.query['info.createdBy'], 'op@test')
  t.is(flow.lastList.query['info.partsMoves.partCode'], 'PSU-WM-CB6_V5-01')
  t.is(flow.lastList.query['info.status'], 'open')
  t.is(flow.lastList.query['info.type'], 2)
  t.alike(flow.lastList.query['info.createdAt'], { $gte: 1700000000000, $lte: 1700864000000 })
})

test('handlers: listWorkOrders ?from alone produces a $gte-only range', async (t) => {
  const flow = listFlow()
  await handlers.listWorkOrders(flow.ctx, { query: { from: 100 } })
  t.alike(flow.lastList.query['info.createdAt'], { $gte: 100 })
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

test('handlers: appendWorkLogEntry rejects when WO is closed/cancelled', async (t) => {
  const ctx = createMockCtxWithOrks(
    [{ rpcPublicKey: 'k' }],
    async (_k, method) => method === 'listThings' ? [{ id: 'wo-1', info: { status: 'closed' } }] : null
  )
  ctx.conf = { workOrderRackId: RACK }
  await t.exception(
    () => handlers.appendWorkLogEntry(ctx, {
      ...userMeta(), params: { id: 'wo-1' }, body: { text: 'late entry' }
    }),
    /ERR_WO_INVALID_STATUS_TRANSITION/
  )
})

test('handlers: appendWorkLogEntry 404s when WO is missing', async (t) => {
  const ctx = createMockCtxWithOrks(
    [{ rpcPublicKey: 'k' }],
    async (_k, method) => method === 'listThings' ? [] : null
  )
  ctx.conf = { workOrderRackId: RACK }
  await t.exception(
    () => handlers.appendWorkLogEntry(ctx, {
      ...userMeta(), params: { id: 'wo-missing' }, body: { text: 'x' }
    }),
    /ERR_WORK_ORDER_NOT_FOUND/
  )
})

test('handlers: appendWorkLogEntry calls saveThingComment with the right rack/thingId/user', async (t) => {
  let captured
  const ctx = createMockCtxWithOrks(
    [{ rpcPublicKey: 'k' }],
    async (_k, method, params) => {
      if (method === 'listThings') return [{ id: 'wo-1', info: { status: 'open' } }]
      if (method === 'saveThingComment') { captured = params; return 1 }
      return null
    }
  )
  ctx.conf = { workOrderRackId: RACK }
  await handlers.appendWorkLogEntry(ctx, {
    ...userMeta(),
    params: { id: 'wo-1' },
    body: { text: 'replaced PSU' }
  })
  t.is(captured.rackId, RACK)
  t.is(captured.thingId, 'wo-1')
  t.is(captured.comment, 'replaced PSU')
  t.is(captured.user, 'op@test')
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
