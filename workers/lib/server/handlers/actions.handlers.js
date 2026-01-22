'use strict'

const { requestRpcEachLimit, parseJsonQueryParam } = require('../../utils')

async function queryActionsBatch (ctx, req) {
  const payload = {
    ids: req.query.ids.split(',')
  }

  return await requestRpcEachLimit(ctx, 'getActionsBatch', payload, (res, resultsArray) => {
    if (res.error) {
      console.error(new Date().toISOString(), res.error)
    } else {
      resultsArray.push(...res)
    }
  })
}

async function queryActions (ctx, req, rep) {
  const payload = {}

  if (req.query.queries) {
    payload.queries = parseJsonQueryParam(req.query.queries, 'ERR_QUERIES_INVALID_JSON')
  }
  if (req.query.groupBatch) {
    payload.groupBatch = req.query.groupBatch
  }
  if (req.query.suffix) {
    payload.suffix = req.query.suffix
  }

  return await requestRpcEachLimit(ctx, 'queryActions', payload)
}

async function getAction (ctx, req) {
  const payload = {
    id: req.params.id,
    type: req.params.type
  }

  return await requestRpcEachLimit(ctx, 'getAction', payload)
}

async function pushActionsBatch (ctx, req, rep) {
  const { write, permissions } = await ctx.authLib.getTokenPerms(req._info.authToken)
  if (!write) {
    throw new Error('ERR_WRITE_PERM_REQUIRED')
  }

  if (req.body.batchActionsPayload) {
    if (!Array.isArray(req.body.batchActionsPayload)) {
      throw new Error('ERR_BATCH_ACTIONS_PAYLOAD_INVALID_ARRAY')
    }
  }

  const payload = {
    batchActionsPayload: req.body.batchActionsPayload,
    batchActionUID: req.body.batchActionUID,
    suffix: req.body.suffix,
    voter: req._info.user.metadata.email,
    authPerms: permissions
  }

  return await requestRpcEachLimit(ctx, 'pushActionsBatch', payload, (res, resultsArray) => {
    if (res.error) {
      resultsArray.push({ id: null, errors: [res.error] })
    } else {
      resultsArray.push(res)
    }
  })
}

async function pushAction (ctx, req) {
  const { write, permissions } = await ctx.authLib.getTokenPerms(req._info.authToken)
  if (!write) {
    throw new Error('ERR_WRITE_PERM_REQUIRED')
  }

  const payload = {
    query: req.body.query,
    action: req.body.action,
    params: req.body.params,
    voter: req._info.user.metadata.email,
    authPerms: permissions
  }

  return await requestRpcEachLimit(ctx, 'pushAction', payload, (res, resultsArray) => {
    if (res.error) {
      resultsArray.push({ id: null, errors: [res.error] })
    } else {
      resultsArray.push(res)
    }
  })
}

async function voteAction (ctx, req) {
  const { write, caps } = await ctx.authLib.getTokenPerms(req._info.authToken)
  if (!write) {
    throw new Error('ERR_WRITE_PERM_REQUIRED')
  }

  const payload = {
    id: req.params.id,
    approve: req.body.approve,
    voter: req._info.user.metadata.email,
    authPerms: caps
  }

  return await requestRpcEachLimit(ctx, 'voteAction', payload, (res, resultsArray) => {
    if (res.error) {
      resultsArray.push({ res: { success: false, error: res.error } })
    } else {
      resultsArray.push({ res })
    }
  })
}

async function cancelActionsBatch (ctx, req) {
  const { write } = await ctx.authLib.getTokenPerms(req._info.authToken)
  if (!write) {
    throw new Error('ERR_WRITE_PERM_REQUIRED')
  }

  const payload = {
    ids: req.query.ids.split(','),
    voter: req._info.user.metadata.email
  }

  return await requestRpcEachLimit(ctx, 'cancelActionsBatch', payload, (res, resultsArray) => {
    if (res.error) {
      resultsArray.push({ res: { success: false, error: res.error } })
    } else {
      resultsArray.push({ res })
    }
  })
}

module.exports = {
  queryActionsBatch,
  queryActions,
  getAction,
  pushAction,
  voteAction,
  cancelActionsBatch,
  pushActionsBatch
}
