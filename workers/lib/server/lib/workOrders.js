'use strict'

const { WORK_ORDER_THING_TYPE } = require('../../constants')
const { flattenRpcResults } = require('../../utils')

/**
 * Resolve the Work Order rack id from the ork's rack registry.
 *
 * The rack id is not deployment config — it's discovered by asking the ork
 * which rack carries the `inventory-work_order` type. Resolved once and
 * cached on `ctx` so it costs a single `listRacks` round-trip per process,
 * not one per request.
 */
async function getWorkOrderRackId (ctx) {
  if (ctx._workOrderRackId) return ctx._workOrderRackId
  const results = await ctx.dataProxy.requestData('listRacks', {
    type: WORK_ORDER_THING_TYPE
  })
  const rack = flattenRpcResults(results)[0]
  if (!rack || !rack.id) throw new Error('ERR_WORK_ORDER_RACK_NOT_FOUND')
  ctx._workOrderRackId = rack.id
  return rack.id
}

/**
 * Submit a single Work Order action (registerThing / updateThing) through
 * the action-approver pipeline against the resolved WO rack.
 */
async function submitWorkOrderAction (ctx, req, action, paramObj) {
  const rackId = await getWorkOrderRackId(ctx)
  const { permissions } = await ctx.authLib.getTokenPerms(req._info.authToken)

  return ctx.dataProxy.requestData('pushAction', {
    action,
    query: { rack: rackId },
    params: [{ rackId, ...paramObj }],
    voter: req._info.user.metadata.email,
    authPerms: permissions || []
  }, (res, arr) => {
    if (res?.error) arr.push({ id: null, errors: [res.error] })
    else arr.push(res)
  })
}

module.exports = { getWorkOrderRackId, submitWorkOrderAction }
