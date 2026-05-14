'use strict'

const { parseJsonQueryParam, flattenRpcResults, submitWorkOrderAction } = require('../../utils')
const { WORK_ORDER_THING_TYPE } = require('../../constants')

async function createWorkOrder (ctx, req) {
  return submitWorkOrderAction(ctx, req, 'registerThing', { info: { ...req.body } })
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
    const escaped = String(qs.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    query.$or = [
      { code: { $regex: escaped } },
      { 'info.issue': { $regex: escaped, $options: 'i' } }
    ]
  }
  return query
}

async function listWorkOrders (ctx, req) {
  const offset = req.query.offset ?? 0
  const limit = req.query.limit ?? 100
  const query = _buildWorkOrderQuery(req.query)
  const params = { query, offset, limit }
  if (req.query.sort) params.sort = parseJsonQueryParam(req.query.sort, 'ERR_SORT_INVALID_JSON')
  if (req.query.fields) params.fields = parseJsonQueryParam(req.query.fields, 'ERR_FIELDS_INVALID_JSON')

  const [listResults, countResults] = await Promise.all([
    ctx.dataProxy.requestData('listThings', params),
    ctx.dataProxy.requestData('getThingsCount', { query })
  ])

  const data = flattenRpcResults(listResults)
  const totalCount = countResults.reduce((acc, c) => acc + (Number(c) || 0), 0)
  return { data, totalCount, offset, limit, hasMore: offset + data.length < totalCount }
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
  getWorkOrderAudit
}
