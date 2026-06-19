'use strict'

const test = require('brittle')
const handlers = require('../../../workers/lib/server/handlers/work.orders.handlers')
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
  ctx._workOrderRackId = rackId
  return { ctx, get lastPush () { return lastPush } }
}

test('handlers: createWorkOrder Type 3 resolves part and forwards body as info', async (t) => {
  const flow = buildSubmitFlow({ parts: [{ id: 'part-1', code: 'PSU-1', type: 'inventory-miner_part-psu', info: { serialNum: 'AM-1' } }] })
  await handlers.createWorkOrder(flow.ctx, {
    ...userMeta(),
    body: {
      type: 3,
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

test('handlers: createWorkOrder Type 2 (move) seeds a move parts-move with from/to locations', async (t) => {
  const flow = buildSubmitFlow({ parts: [{ id: 'part-1', code: 'PSU-1', type: 'inventory-miner_part-psu', info: { serialNum: 'SN-1', location: 'site.lab' } }] })
  await handlers.createWorkOrder(flow.ctx, {
    ...userMeta(),
    body: {
      type: 2,
      deviceType: 'psu',
      deviceModel: 'PSU-1',
      deviceIdentifier: 'SN-1',
      info: { location: 'site.warehouse' }
    }
  })
  const move = flow.lastPush.params[0].info.partsMoves[0]
  t.is(move.role, 'move')
  t.is(move.partId, 'part-1')
  t.is(move.fromLocation, 'site.lab')
  t.is(move.toLocation, 'site.warehouse')
})

test('handlers: createWorkOrder Type 2 (move) relocates the part on its own rack', async (t) => {
  const pushed = []
  const ctx = createMockCtxWithOrks([{ rpcPublicKey: 'k' }], async (_k, method, params) => {
    if (method === 'pushAction') { pushed.push(params); return { id: 'a', errors: [] } }
    if (method === 'listThings') return [{ id: 'part-1', type: 'inventory-miner_part-psu', rack: 'psu-rack-1', info: { location: 'site.lab' } }]
    return null
  })
  ctx.authLib = mockAuthLib
  ctx._workOrderRackId = RACK
  await handlers.createWorkOrder(ctx, {
    ...userMeta(),
    body: { type: 2, deviceType: 'psu', deviceModel: 'P', deviceIdentifier: 'SN-1', info: { location: 'site.warehouse' } }
  })
  const partPush = pushed.find(p => p.action === 'updateThing')
  t.is(partPush.params[0].rackId, 'psu-rack-1', 'relocation targets the part rack')
  t.is(partPush.params[0].info.location, 'site.warehouse', 'part moved to the destination')
  t.ok(partPush.params[0].info.workOrderId, 'relocation carries a workOrderId (else ERR_PART_MOVE_REQUIRES_WO)')
})

test('handlers: createWorkOrdersBatch Type 2 (move) relocates every part', async (t) => {
  const pushed = []
  const ctx = createMockCtxWithOrks([{ rpcPublicKey: 'k' }], async (_k, method, params) => {
    if (method === 'pushAction') { pushed.push(params); return { id: 'a', errors: [] } }
    if (method === 'listThings') {
      const sn = (params.query?.$or || []).map(c => c['info.serialNum']).find(Boolean)
      return [{ id: sn, type: 'inventory-miner_part-psu', rack: 'psu-rack-1', info: { location: 'site.warehouse' } }]
    }
    return null
  })
  ctx.authLib = mockAuthLib
  ctx._workOrderRackId = RACK
  await handlers.createWorkOrdersBatch(ctx, {
    ...userMeta(),
    body: {
      type: 2,
      devices: [
        { deviceType: 'psu', deviceModel: 'P', deviceIdentifier: 'SN-1' },
        { deviceType: 'psu', deviceModel: 'P', deviceIdentifier: 'SN-2' }
      ],
      info: { location: 'site.miner-room' }
    }
  })
  const partPushes = pushed.filter(p => p.action === 'updateThing')
  t.is(partPushes.length, 2, 'one relocation per device')
  t.is(partPushes[0].params[0].info.location, 'site.miner-room')
  t.ok(partPushes[0].params[0].info.workOrderId, 'relocation carries a workOrderId (else ERR_PART_MOVE_REQUIRES_WO)')
})

test('handlers: createWorkOrder merges info.notes, info.remarks, info.site, info.location into thing info', async (t) => {
  const flow = buildSubmitFlow({ parts: [{ id: 'part-1', code: 'PSU-1', type: 'inventory-miner_part-psu', info: { serialNum: 'SN-1' } }] })
  await handlers.createWorkOrder(flow.ctx, {
    ...userMeta(),
    body: {
      type: 1,
      deviceType: 'psu',
      deviceModel: 'PSU-WM-CB6_V5',
      deviceIdentifier: 'SN-1',
      info: {
        notes: 'batch registration',
        remarks: 'test remark',
        site: 'Ivinhema',
        location: 'site.warehouse'
      }
    }
  })
  const info = flow.lastPush.params[0].info
  t.is(info.notes, 'batch registration')
  t.is(info.remarks, 'test remark')
  t.is(info.site, 'Ivinhema')
  t.is(info.location, 'site.warehouse')
  t.is(info.deviceType, 'psu', 'top-level fields still present')
  t.ok(!info.info, 'no nested info.info')
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
      body: { type: 3, deviceType: 'psu', deviceModel: 'm', deviceIdentifier: 'unknown-sn', issue: 'i' }
    }),
    /ERR_PART_NOT_FOUND/
  )
})

test('handlers: createWorkOrdersBatch builds one WO with a parts-move per device, first device as summary', async (t) => {
  const parts = [
    { id: 'part-1', code: 'WMM-1', type: 'inventory-miner_part-controller', info: { serialNum: 'WMM63S-2024-04829', location: 'site.warehouse' } },
    { id: 'part-2', code: 'WMM-2', type: 'inventory-miner_part-controller', info: { serialNum: 'WMM63S-2024-04830', location: 'site.warehouse' } },
    { id: 'part-3', code: 'WMM-3', type: 'inventory-miner_part-controller', info: { serialNum: 'WMM63S-2024-04831', location: 'site.warehouse' } }
  ]
  let lastPush
  const handler = async (_key, method, params) => {
    if (method === 'pushAction') { lastPush = params; return { id: 'action-1', errors: [] } }
    if (method === 'listThings') {
      const or = params.query?.$or || []
      const sn = or.map(c => c.id || c.code || c['info.serialNum'] || c['info.macAddress']).find(Boolean)
      return parts.filter(p => p.info.serialNum === sn)
    }
    return null
  }
  const ctx = createMockCtxWithOrks([{ rpcPublicKey: 'k' }], handler)
  ctx.authLib = mockAuthLib
  ctx._workOrderRackId = RACK

  await handlers.createWorkOrdersBatch(ctx, {
    ...userMeta(),
    body: {
      type: 2,
      devices: [
        { deviceType: 'miner', deviceModel: 'whatsminer-m63s', deviceIdentifier: 'WMM63S-2024-04829' },
        { deviceType: 'miner', deviceModel: 'whatsminer-m63s', deviceIdentifier: 'WMM63S-2024-04830' },
        { deviceType: 'miner', deviceModel: 'whatsminer-m63s', deviceIdentifier: 'WMM63S-2024-04831' }
      ],
      info: { location: 'site.miner-room' }
    }
  })

  const info = lastPush.params[0].info
  t.is(lastPush.action, 'registerThing')
  t.is(info.deviceCount, 3, 'records device count for the scope badge')
  t.is(info.deviceIdentifier, 'WMM63S-2024-04829', 'first device is the summary identifier')
  t.is(info.partsMoves.length, 3, 'one parts-move per device')
  t.alike(info.partsMoves.map(m => m.deviceIdentifier), ['WMM63S-2024-04829', 'WMM63S-2024-04830', 'WMM63S-2024-04831'])
  t.alike(info.partsMoves.map(m => m.partId), ['part-1', 'part-2', 'part-3'], 'each move resolves its own part')
  t.is(info.partsMoves[0].role, 'move')
  t.is(info.partsMoves[0].fromLocation, 'site.warehouse')
  t.is(info.partsMoves[0].toLocation, 'site.miner-room', 'all moved to the WO target location')
})

test('handlers: createWorkOrdersBatch rejects the whole batch if any device type is invalid', async (t) => {
  const flow = buildSubmitFlow({ parts: [{ id: 'p', code: 'c', type: 'inventory-miner_part-psu', info: { serialNum: 'SN-1' } }] })
  await t.exception(
    () => handlers.createWorkOrdersBatch(flow.ctx, {
      ...userMeta(),
      body: {
        type: 2,
        devices: [
          { deviceType: 'miner', deviceModel: 'm', deviceIdentifier: 'SN-1' },
          { deviceType: 'cooling', deviceModel: 'm', deviceIdentifier: 'SN-2' }
        ]
      }
    }),
    /ERR_INVALID_DEVICE_TYPE/
  )
  t.absent(flow.lastPush, 'nothing pushed when validation fails')
})

test('handlers: updateWorkOrder forwards warranty payload to updateThing', async (t) => {
  const flow = buildSubmitFlow()
  await handlers.updateWorkOrder(flow.ctx, {
    ...userMeta(),
    params: { id: 'wo-1' },
    body: { warranty: { vendor: 'microbt', fields: { rmaNumber: 'RMA-1', faultCode: 'E03' } } }
  })
  t.is(flow.lastPush.action, 'updateThing')
  t.is(flow.lastPush.params[0].info.warranty.vendor, 'microbt')
  t.is(flow.lastPush.params[0].info.warranty.fields.rmaNumber, 'RMA-1')
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
  t.ok(flow.lastPush.params[0].info.closedAt, 'stamps closedAt')
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
  ctx._workOrderRackId = RACK
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
  ctx._workOrderRackId = RACK
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
  ctx._workOrderRackId = RACK
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

function mkRep () {
  const headers = {}
  let body
  let status = 200
  return {
    header: (k, v) => { headers[k] = v },
    status: (s) => { status = s; return { send: (b) => { body = b } } },
    send: (b) => { body = b; return this },
    get _headers () { return headers },
    get _body () { return body },
    get _status () { return status }
  }
}

test('handlers: exportWorkOrder pdf returns 501 (deferred to phase 2)', async (t) => {
  const ctx = createMockCtxWithOrks([{ rpcPublicKey: 'k' }], async () => [])
  const rep = mkRep()
  await handlers.exportWorkOrder(ctx, { params: { id: 'IVI-2-0001' }, query: { format: 'pdf' } }, rep)
  t.is(rep._status, 501)
  t.ok(/^ERR_EXPORT_FORMAT_NOT_IMPLEMENTED:(pdf|docx)$/.test(rep._body.message))
})

test('handlers: exportWorkOrder docx returns 501 (deferred to phase 2)', async (t) => {
  const ctx = createMockCtxWithOrks([{ rpcPublicKey: 'k' }], async () => [])
  const rep = mkRep()
  await handlers.exportWorkOrder(ctx, { params: { id: 'IVI-2-0001' }, query: { format: 'docx' } }, rep)
  t.is(rep._status, 501)
  t.ok(/^ERR_EXPORT_FORMAT_NOT_IMPLEMENTED:(pdf|docx)$/.test(rep._body.message))
})

test('handlers: exportWorkOrder 404s when WO not found by id or code', async (t) => {
  const ctx = createMockCtxWithOrks([{ rpcPublicKey: 'k' }], async () => [])
  await t.exception(
    () => handlers.exportWorkOrder(ctx, { params: { id: 'nope' }, query: { format: 'csv' } }, mkRep()),
    /ERR_WORK_ORDER_NOT_FOUND/
  )
})

test('handlers: exportWorkOrder csv sets text/csv content-type and attachment filename', async (t) => {
  const wo = { id: 'wo-1', code: 'IVI-2-0001', info: { status: 'open', type: 2, partsMoves: [] } }
  const ctx = createMockCtxWithOrks([{ rpcPublicKey: 'k' }], async () => [wo])
  const rep = mkRep()
  await handlers.exportWorkOrder(ctx, { params: { id: 'IVI-2-0001' }, query: { format: 'csv' } }, rep)
  t.is(rep._headers['content-type'], 'text/csv; charset=utf-8')
  t.ok(rep._headers['content-disposition'].includes('IVI-2-0001.csv'))
  t.ok(typeof rep._body === 'string' && rep._body.startsWith('code,status,type'))
})

test('handlers: exportWorkOrdersRma returns CSV of only the MicroBT Miner WOs selected', async (t) => {
  const miner = { id: 'wo-3', code: 'IVI-3-0001', info: { type: 3, deviceModel: 'M63S++_VL28', deviceIdentifier: 'MINER-SN-1', issue: 'low hashrate', finalResult: 'replaced HB', remarks: 'r', assignedTo: 'eng@test', createdAt: 1, partsMoves: [{ role: 'diagnosis', partCode: 'HB-OLD' }, { role: 'replacement', partCode: 'HB-NEW' }] } }
  const move = { id: 'wo-2', code: 'IVI-2-0002', info: { type: 2, partsMoves: [] } }
  const ctx = createMockCtxWithOrks([{ rpcPublicKey: 'k' }], async () => [miner, move])
  const rep = mkRep()
  await handlers.exportWorkOrdersRma(ctx, { query: { ids: 'IVI-3-0001,IVI-2-0002' } }, rep)
  t.is(rep._headers['content-type'], 'text/csv; charset=utf-8')
  t.ok(rep._headers['content-disposition'].includes('rma.csv'))
  const lines = rep._body.trim().split('\r\n')
  t.is(lines.length, 2, 'header + 1 MicroBT Miner row (Move WO ignored)')
  t.ok(lines[0].startsWith('Ticket,Repaired type'))
  t.ok(lines[1].startsWith('IVI-3-0001,'))
  t.ok(lines[1].includes('HB-OLD') && lines[1].includes('HB-NEW'))
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
