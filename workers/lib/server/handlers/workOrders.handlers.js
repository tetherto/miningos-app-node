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

async function listWorkOrders (ctx, req) {
  const params = {}
  if (req.query.query) params.query = parseJsonQueryParam(req.query.query, 'ERR_QUERY_INVALID_JSON')
  if (req.query.sort) params.sort = parseJsonQueryParam(req.query.sort, 'ERR_SORT_INVALID_JSON')
  if (req.query.fields) params.fields = parseJsonQueryParam(req.query.fields, 'ERR_FIELDS_INVALID_JSON')
  if (req.query.offset != null) params.offset = req.query.offset
  if (req.query.limit != null) params.limit = req.query.limit

  params.query = { ...(params.query || {}), type: WORK_ORDER_THING_TYPE }

  const results = await ctx.dataProxy.requestData('listThings', params)
  return flattenRpcResults(results)
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
