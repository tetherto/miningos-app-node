'use strict'

const { randomUUID } = require('crypto')
const { flattenRpcResults, waitForThing } = require('../../utils')
const {
  WORK_ORDER_THING_TYPE,
  WORK_ORDER_TYPES,
  WORK_ORDER_VALID_DEVICE_TYPES,
  SPARE_PART_INITIAL_LOCATION
} = require('../../constants')

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

async function registerSparePart (ctx, req) {
  const { rackId, info } = req.body
  const deviceType = info.deviceType || info.type
  if (!WORK_ORDER_VALID_DEVICE_TYPES.includes(deviceType)) {
    const err = new Error('ERR_INVALID_DEVICE_TYPE')
    err.statusCode = 400
    throw err
  }
  const workOrderRackId = ctx.conf.workOrderRackId
  if (!workOrderRackId) throw new Error('ERR_WORK_ORDER_RACK_ID_NOT_CONFIGURED')

  const voter = req._info.user.metadata.email
  const { permissions } = await ctx.authLib.getTokenPerms(req._info.authToken)
  const authPerms = permissions || []

  const partId = randomUUID()
  const partInfo = {
    ...info,
    location: info.location ?? SPARE_PART_INITIAL_LOCATION
  }

  const partActionResults = await ctx.dataProxy.requestData('pushAction', {
    action: 'registerThing',
    query: { rack: rackId },
    params: [{ rackId, id: partId, info: partInfo }],
    voter,
    authPerms
  }, (res, arr) => {
    if (res?.error) arr.push({ id: null, errors: [res.error] })
    else arr.push(res)
  })

  const part = await waitForThing(ctx, { id: partId })
  if (!part) {
    const failed = partActionResults.find(r => r?.errors?.length)
    throw new Error(failed?.errors?.[0] || 'ERR_SPARE_PART_REGISTER_FAILED')
  }

  const woId = randomUUID()
  const ts = Date.now()
  const woInfo = {
    type: WORK_ORDER_TYPES.REGISTER,
    deviceType,
    deviceModel: info.model || info.deviceModel || part.info?.model || 'unknown',
    deviceIdentifier: part.info?.serialNum || part.info?.macAddress || part.code || partId,
    createdBy: voter,
    createdAt: ts,
    partsMoves: [{
      partId,
      partCode: part.code,
      fromLocation: null,
      toLocation: SPARE_PART_INITIAL_LOCATION,
      role: 'register',
      ts,
      user: voter
    }]
  }

  const woActionResults = await ctx.dataProxy.requestData('pushAction', {
    action: 'registerThing',
    query: { rack: workOrderRackId },
    params: [{ rackId: workOrderRackId, id: woId, info: woInfo }],
    voter,
    authPerms
  }, (res, arr) => {
    if (res?.error) arr.push({ id: null, errors: [res.error] })
    else arr.push(res)
  })

  const wo = await waitForThing(ctx, { id: woId, type: WORK_ORDER_THING_TYPE })
  if (!wo) {
    const failed = woActionResults.find(r => r?.errors?.length)
    throw new Error(failed?.errors?.[0] || 'ERR_WORK_ORDER_REGISTER_FAILED')
  }

  return {
    partId,
    partCode: part.code,
    workOrderId: woId,
    workOrderCode: wo.code
  }
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

module.exports = { registerSparePart, updateSparePart, getRepairHistory }
