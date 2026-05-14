'use strict'

const { flattenRpcResults } = require('../../utils')
const { WORK_ORDER_THING_TYPE } = require('../../constants')

const TERMINAL_WO_STATUSES = new Set(['closed', 'cancelled'])

async function _loadWorkOrder (ctx, workOrderId) {
  const results = await ctx.dataProxy.requestData('listThings', {
    query: { id: workOrderId, type: WORK_ORDER_THING_TYPE }
  })
  return flattenRpcResults(results)[0] || null
}

async function _loadSparePart (ctx, partId) {
  const results = await ctx.dataProxy.requestData('listThings', {
    query: { id: partId }
  })
  return flattenRpcResults(results).find(t => t?.type !== WORK_ORDER_THING_TYPE) || null
}

async function updateSparePart (ctx, req) {
  const { id } = req.params
  const { rackId, workOrderId, info } = req.body

  const movesPart = info.location !== undefined || info.status !== undefined

  if (movesPart && !workOrderId) {
    const err = new Error('ERR_PART_MOVE_REQUIRES_WO')
    err.statusCode = 400
    throw err
  }

  let workOrderCode
  let part
  if (movesPart) {
    const [wo, p] = await Promise.all([
      _loadWorkOrder(ctx, workOrderId),
      _loadSparePart(ctx, id)
    ])
    if (!wo) {
      const err = new Error('ERR_WORK_ORDER_NOT_FOUND')
      err.statusCode = 400
      throw err
    }
    if (TERMINAL_WO_STATUSES.has(wo.info?.status)) {
      const err = new Error('ERR_WO_INVALID_STATUS_TRANSITION')
      err.statusCode = 400
      throw err
    }
    if (!p) {
      const err = new Error('ERR_SPARE_PART_NOT_FOUND')
      err.statusCode = 404
      throw err
    }
    workOrderCode = wo.code
    part = p
  }

  const { permissions } = await ctx.authLib.getTokenPerms(req._info.authToken)
  const voter = req._info.user.metadata.email

  const partInfo = { ...info }
  if (movesPart) {
    partInfo.workOrderId = workOrderId
    partInfo.workOrderCode = workOrderCode
  }

  const partResults = await ctx.dataProxy.requestData('pushAction', {
    action: 'updateThing',
    query: { rack: rackId },
    params: [{ rackId, id, info: partInfo }],
    voter,
    authPerms: permissions || []
  }, (res, arr) => {
    if (res?.error) arr.push({ id: null, errors: [res.error] })
    else arr.push(res)
  })

  if (!movesPart) return partResults

  const moveEntry = {
    partId: id,
    partCode: part.code,
    workOrderId,
    workOrderCode,
    fromLocation: part.info?.location ?? null,
    toLocation: info.location ?? part.info?.location ?? null,
    fromStatus: part.info?.status ?? null,
    toStatus: info.status ?? part.info?.status ?? null,
    role: 'original',
    ts: Date.now(),
    user: voter
  }

  const woRackId = ctx.conf.workOrderRackId
  const wo = await _loadWorkOrder(ctx, workOrderId)
  const currentMoves = Array.isArray(wo?.info?.partsMoves) ? wo.info.partsMoves : []

  const woResults = await ctx.dataProxy.requestData('pushAction', {
    action: 'updateThing',
    query: { rack: woRackId },
    params: [{ rackId: woRackId, id: workOrderId, info: { partsMoves: [...currentMoves, moveEntry] } }],
    voter,
    authPerms: permissions || []
  }, (res, arr) => {
    if (res?.error) arr.push({ id: null, errors: [res.error] })
    else arr.push(res)
  })

  return { part: partResults, workOrder: woResults, move: moveEntry }
}

async function getRepairHistory (ctx, req) {
  const offset = req.query.offset ?? 0
  const limit = req.query.limit ?? 100
  const partId = req.params.id

  const results = await ctx.dataProxy.requestData('listThings', {
    query: { type: WORK_ORDER_THING_TYPE, 'info.partsMoves.partId': partId }
  })
  const wos = flattenRpcResults(results)

  const rows = []
  for (const wo of wos) {
    for (const move of (wo.info?.partsMoves || [])) {
      if (move.partId !== partId) continue
      rows.push({ ...move, workOrderId: wo.id, workOrderCode: wo.code })
    }
  }
  rows.sort((a, b) => b.ts - a.ts)

  return {
    data: rows.slice(offset, offset + limit),
    totalCount: rows.length,
    offset,
    limit,
    hasMore: offset + limit < rows.length
  }
}

module.exports = { updateSparePart, getRepairHistory }
