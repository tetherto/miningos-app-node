'use strict'

const { parseJsonQueryParam, flattenRpcResults, submitWorkOrderAction, escapeRegex, listThingsWithCount } = require('../../utils')
const {
  WORK_ORDER_THING_TYPE,
  WORK_ORDER_TYPES,
  WORK_ORDER_VALID_DEVICE_TYPES,
  SPARE_PART_INITIAL_LOCATION
} = require('../../constants')
const { renderWorkOrderCsv } = require('../lib/workOrderExport')

async function _resolvePartByIdentifier (ctx, identifier) {
  const results = await ctx.dataProxy.requestData('listThings', {
    query: {
      $or: [
        { id: identifier },
        { code: identifier },
        { 'info.serialNum': identifier },
        { 'info.macAddress': identifier }
      ]
    }
  })
  return flattenRpcResults(results).find(t => t?.type !== WORK_ORDER_THING_TYPE) || null
}

async function createWorkOrder (ctx, req) {
  const { type, deviceType, deviceIdentifier } = req.body

  if (!WORK_ORDER_VALID_DEVICE_TYPES.includes(deviceType)) {
    const err = new Error('ERR_INVALID_DEVICE_TYPE')
    err.statusCode = 400
    throw err
  }

  const voter = req._info.user.metadata.email
  const info = { ...req.body, createdBy: voter, createdAt: Date.now() }

  if (type === WORK_ORDER_TYPES.REGULAR) {
    const part = await _resolvePartByIdentifier(ctx, deviceIdentifier)
    if (!part) {
      const err = new Error('ERR_PART_NOT_FOUND')
      err.statusCode = 400
      throw err
    }
    info.partsMoves = [{
      partId: part.id,
      partCode: part.code,
      role: 'diagnosis',
      ts: Date.now(),
      user: voter
    }]
  } else if (type === WORK_ORDER_TYPES.REGISTER) {
    const part = await _resolvePartByIdentifier(ctx, deviceIdentifier)
    if (!part) {
      const err = new Error('ERR_PART_NOT_FOUND')
      err.statusCode = 400
      throw err
    }
    info.partsMoves = [{
      partId: part.id,
      partCode: part.code,
      fromLocation: null,
      toLocation: SPARE_PART_INITIAL_LOCATION,
      role: 'register',
      ts: Date.now(),
      user: voter
    }]
  }

  return submitWorkOrderAction(ctx, req, 'registerThing', { info })
}

async function updateWorkOrder (ctx, req) {
  return submitWorkOrderAction(ctx, req, 'updateThing', { id: req.params.id, info: { ...req.body } })
}

async function closeWorkOrder (ctx, req) {
  const info = { status: 'closed' }
  if (req.body?.finalResult) info.finalResult = req.body.finalResult
  return submitWorkOrderAction(ctx, req, 'updateThing', { id: req.params.id, info })
}

async function cancelWorkOrder (ctx, req) {
  const info = { status: 'cancelled' }
  if (req.body?.reason) info.cancelReason = req.body.reason
  return submitWorkOrderAction(ctx, req, 'updateThing', { id: req.params.id, info })
}

async function assignWorkOrder (ctx, req) {
  return submitWorkOrderAction(ctx, req, 'updateThing', {
    id: req.params.id,
    info: { assignedTo: req.body.assignedTo }
  })
}

function _buildWorkOrderQuery (qs) {
  const query = qs.query
    ? parseJsonQueryParam(qs.query, 'ERR_QUERY_INVALID_JSON')
    : {}
  query.type = WORK_ORDER_THING_TYPE
  if (qs.assignee) query['info.assignedTo'] = qs.assignee
  if (qs.creator) query['info.createdBy'] = qs.creator
  if (qs.partId) query['info.partsMoves.partCode'] = qs.partId
  if (qs.status) query['info.status'] = qs.status
  if (qs.type != null) query['info.type'] = qs.type
  if (qs.from || qs.to) {
    query['info.createdAt'] = {}
    if (qs.from) query['info.createdAt'].$gte = qs.from
    if (qs.to) query['info.createdAt'].$lte = qs.to
  }
  if (qs.q) {
    const escaped = escapeRegex(qs.q)
    query.$or = [
      { code: { $regex: escaped } },
      { 'info.issue': { $regex: escaped, $options: 'i' } }
    ]
  }
  return query
}

async function listWorkOrders (ctx, req) {
  return listThingsWithCount(ctx, _buildWorkOrderQuery(req.query), {
    offset: req.query.offset ?? 0,
    limit: req.query.limit ?? 100,
    sort: req.query.sort && parseJsonQueryParam(req.query.sort, 'ERR_SORT_INVALID_JSON'),
    fields: req.query.fields && parseJsonQueryParam(req.query.fields, 'ERR_FIELDS_INVALID_JSON')
  })
}

async function getWorkOrder (ctx, req) {
  const params = { query: { id: req.params.id, type: WORK_ORDER_THING_TYPE } }
  const results = await ctx.dataProxy.requestData('listThings', params)
  const flat = flattenRpcResults(results)
  if (!flat.length) {
    const err = new Error('ERR_WORK_ORDER_NOT_FOUND')
    err.statusCode = 404
    throw err
  }
  return flat[0]
}

async function appendWorkLogEntry (ctx, req) {
  const rackId = ctx.conf.workOrderRackId
  if (!rackId) throw new Error('ERR_WORK_ORDER_RACK_ID_NOT_CONFIGURED')

  const wo = await ctx.dataProxy.requestData('listThings', {
    query: { id: req.params.id, type: WORK_ORDER_THING_TYPE }
  })
  const found = flattenRpcResults(wo)[0]
  if (!found) {
    const err = new Error('ERR_WORK_ORDER_NOT_FOUND')
    err.statusCode = 404
    throw err
  }
  if (['closed', 'cancelled'].includes(found.info?.status)) {
    const err = new Error('ERR_WO_INVALID_STATUS_TRANSITION')
    err.statusCode = 400
    throw err
  }

  return ctx.dataProxy.requestData('saveThingComment', {
    rackId,
    thingId: req.params.id,
    comment: req.body.text,
    user: req._info.user.metadata.email
  }, (res, arr) => {
    if (res?.error) arr.push({ error: res.error })
    else arr.push(res)
  })
}

async function _loadWorkOrderByIdOrCode (ctx, idOrCode) {
  const params = {
    query: {
      type: WORK_ORDER_THING_TYPE,
      $or: [{ id: idOrCode }, { code: idOrCode }]
    }
  }
  const results = await ctx.dataProxy.requestData('listThings', params)
  return flattenRpcResults(results)[0] || null
}

async function exportWorkOrder (ctx, req, rep) {
  const { format } = req.query
  if (format !== 'csv') {
    return rep.status(501).send({
      statusCode: 501,
      error: 'Not Implemented',
      message: `ERR_EXPORT_FORMAT_NOT_IMPLEMENTED:${format}`
    })
  }

  const wo = await _loadWorkOrderByIdOrCode(ctx, req.params.id)
  if (!wo) {
    const err = new Error('ERR_WORK_ORDER_NOT_FOUND')
    err.statusCode = 404
    throw err
  }

  const filename = wo.code || wo.id
  rep.header('content-type', 'text/csv; charset=utf-8')
  rep.header('content-disposition', `attachment; filename="${filename}.csv"`)
  return rep.send(renderWorkOrderCsv(wo))
}

async function getWorkOrderAudit (ctx, req) {
  const payload = {
    logType: 'info',
    limit: req.query.limit ?? 100,
    offset: req.query.offset ?? 0,
    start: req.query.start,
    end: req.query.end,
    query: { 'thing.id': req.params.id }
  }
  const results = await ctx.dataProxy.requestData('getHistoricalLogs', payload)
  return flattenRpcResults(results)
}

module.exports = {
  createWorkOrder,
  listWorkOrders,
  getWorkOrder,
  updateWorkOrder,
  closeWorkOrder,
  cancelWorkOrder,
  assignWorkOrder,
  appendWorkLogEntry,
  getWorkOrderAudit,
  exportWorkOrder
}
