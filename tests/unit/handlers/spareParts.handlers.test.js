'use strict'

const test = require('brittle')
const handlers = require('../../../workers/lib/server/handlers/spareParts.handlers')
const { createMockCtxWithOrks } = require('../helpers/mockHelpers')

const WO_RACK = 'inventory-work_order-rack-x'
const PART_RACK = 'inventory-miner_part-psu-rack-1'
const PART = {
  id: 'p-1',
  code: 'PSU-WM-CB6_V5-01',
  rack: PART_RACK,
  info: { location: 'Lab', status: 'active' }
}
const OPEN_WO = {
  id: 'wo-1',
  code: 'IVI-2-0001',
  type: 'inventory-work_order',
  info: { status: 'open', partsMoves: [] }
}
const CLOSED_WO = {
  id: 'wo-1',
  code: 'IVI-2-0001',
  type: 'inventory-work_order',
  info: { status: 'closed', partsMoves: [] }
}

const mockAuthLib = {
  getTokenPerms: async () => ({ permissions: ['inventory:rw', 'actions:rw'] })
}
const userMeta = (email = 'op@test') => ({
  _info: { authToken: 'tok', user: { metadata: { email } } }
})

function buildCtx ({ wo = OPEN_WO, part = PART, pushResults = {} } = {}) {
  const pushed = []
  const handler = async (_key, method, params) => {
    if (method === 'listThings') {
      if (params.query?.type === 'inventory-work_order') return wo ? [wo] : []
      if (params.query?.id === PART.id) return part ? [part] : []
      return []
    }
    if (method === 'pushAction') {
      pushed.push(params)
      return pushResults[params.params[0].rackId] ?? { id: `act-${pushed.length}`, errors: [] }
    }
    return null
  }
  const ctx = createMockCtxWithOrks([{ rpcPublicKey: 'k' }], handler)
  ctx.authLib = mockAuthLib
  ctx.conf = { ...ctx.conf, workOrderRackId: WO_RACK }
  return { ctx, pushed }
}

test('handlers: updateSparePart rejects location/status changes without workOrderId', async (t) => {
  const { ctx } = buildCtx()
  await t.exception(
    () => handlers.updateSparePart(ctx, {
      ...userMeta(),
      params: { id: PART.id },
      body: { rackId: PART_RACK, info: { location: 'Site Lab' } }
    }),
    /ERR_PART_MOVE_REQUIRES_WO/
  )
})

test('handlers: updateSparePart rejects when WO is closed', async (t) => {
  const { ctx } = buildCtx({ wo: CLOSED_WO })
  await t.exception(
    () => handlers.updateSparePart(ctx, {
      ...userMeta(),
      params: { id: PART.id },
      body: { rackId: PART_RACK, workOrderId: 'wo-1', info: { location: 'Site Lab' } }
    }),
    /ERR_WO_INVALID_STATUS_TRANSITION/
  )
})

test('handlers: updateSparePart 404s when WO is missing', async (t) => {
  const { ctx } = buildCtx({ wo: null })
  await t.exception(
    () => handlers.updateSparePart(ctx, {
      ...userMeta(),
      params: { id: PART.id },
      body: { rackId: PART_RACK, workOrderId: 'wo-missing', info: { location: 'Site Lab' } }
    }),
    /ERR_WORK_ORDER_NOT_FOUND/
  )
})

test('handlers: updateSparePart pushes part update + WO partsMoves append on a valid move', async (t) => {
  const { ctx, pushed } = buildCtx()
  const out = await handlers.updateSparePart(ctx, {
    ...userMeta(),
    params: { id: PART.id },
    body: { rackId: PART_RACK, workOrderId: 'wo-1', info: { location: 'Site Lab' } }
  })

  t.is(pushed.length, 2, 'two actions pushed (part + WO)')

  const partAction = pushed.find(p => p.params[0].rackId === PART_RACK)
  t.is(partAction.action, 'updateThing')
  t.is(partAction.params[0].info.location, 'Site Lab')
  t.is(partAction.params[0].info.workOrderId, 'wo-1', 'workOrderId injected into part info')
  t.is(partAction.params[0].info.workOrderCode, 'IVI-2-0001', 'workOrderCode injected too')

  const woAction = pushed.find(p => p.params[0].rackId === WO_RACK)
  const moves = woAction.params[0].info.partsMoves
  t.is(moves.length, 1)
  t.is(moves[0].partId, PART.id)
  t.is(moves[0].partCode, PART.code)
  t.is(moves[0].fromLocation, 'Lab')
  t.is(moves[0].toLocation, 'Site Lab')
  t.is(moves[0].workOrderCode, 'IVI-2-0001')

  t.ok(out.move, 'response includes the move record')
})

test('handlers: updateSparePart skips WO checks when only non-move fields change', async (t) => {
  const { ctx, pushed } = buildCtx()
  await handlers.updateSparePart(ctx, {
    ...userMeta(),
    params: { id: PART.id },
    body: { rackId: PART_RACK, info: { serialNum: 'SN-NEW' } }
  })
  t.is(pushed.length, 1, 'only part update pushed; no WO append')
  t.is(pushed[0].params[0].info.serialNum, 'SN-NEW')
  t.absent(pushed[0].params[0].info.workOrderId, 'no WO injected for non-move')
})

test('handlers: getRepairHistory returns moves matching part id, newest first', async (t) => {
  const wos = [
    {
      id: 'wo-a',
      code: 'IVI-2-0001',
      info: {
        partsMoves: [
          { partId: 'p-1', ts: 100, fromLocation: 'Lab', toLocation: 'Field' },
          { partId: 'other', ts: 110 }
        ]
      }
    },
    {
      id: 'wo-b',
      code: 'IVI-2-0002',
      info: {
        partsMoves: [
          { partId: 'p-1', ts: 200, fromLocation: 'Field', toLocation: 'Lab' }
        ]
      }
    }
  ]
  const ctx = createMockCtxWithOrks(
    [{ rpcPublicKey: 'k' }],
    async (_k, _m, params) => params.query?.['info.partsMoves.partId'] === 'p-1' ? wos : []
  )
  const out = await handlers.getRepairHistory(ctx, { params: { id: 'p-1' }, query: {} })
  t.is(out.totalCount, 2)
  t.is(out.data[0].ts, 200, 'newest first')
  t.is(out.data[0].workOrderCode, 'IVI-2-0002')
  t.is(out.data[1].ts, 100)
  t.is(out.data[1].workOrderCode, 'IVI-2-0001')
})
