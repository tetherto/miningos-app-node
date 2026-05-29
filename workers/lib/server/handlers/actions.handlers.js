'use strict'

const { parseJsonQueryParam } = require('../../utils')
const { ACTIONS_MAX_QUERIES } = require('../../constants')

async function queryActionsBatch (ctx, req) {
  const payload = {
    ids: req.query.ids.split(',')
  }

  return await ctx.dataProxy.requestData('getActionsBatch', payload, (res, resultsArray) => {
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
    if (!Array.isArray(payload.queries)) {
      throw new Error('ERR_QUERIES_INVALID')
    }
    if (payload.queries.length > ACTIONS_MAX_QUERIES) {
      throw new Error('ERR_QUERIES_LIMIT_EXCEEDED')
    }
  }
  if (req.query.groupBatch) {
    payload.groupBatch = req.query.groupBatch
  }
  if (req.query.suffix) {
    payload.suffix = req.query.suffix
  }

  return await ctx.dataProxy.requestData('queryActions', payload)
}

async function getAction (ctx, req) {
  const payload = {
    id: req.params.id,
    type: req.params.type
  }

  return await ctx.dataProxy.requestData('getAction', payload)
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

  return await ctx.dataProxy.requestData('pushActionsBatch', payload, (res, resultsArray) => {
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

  return await ctx.dataProxy.requestData('pushAction', payload, (res, resultsArray) => {
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

  return await ctx.dataProxy.requestData('voteAction', payload, (res, resultsArray) => {
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

  return await ctx.dataProxy.requestData('cancelActionsBatch', payload, (res, resultsArray) => {
    if (res.error) {
      resultsArray.push({ res: { success: false, error: res.error } })
    } else {
      resultsArray.push({ res })
    }
  })
}

/**
 * Stream a miner log file to the HTTP client.
 *
 * The action result (stored by ork) contains only metadata: { coreKey, byteLength, expiresAt }.
 * The actual log bytes are fetched directly from the wrk-miner via Hypercore/Hyperswarm P2P,
 * bypassing the HRPC action pipeline entirely.
 *
 * Route: GET /auth/download-logs/:id
 */
async function downloadLogFile (ctx, req, reply) {
  const { id } = req.params

  // Fetch the completed action from ork
  const results = await ctx.dataProxy.requestData('getAction', { id, type: 'done' })
  const action = Array.isArray(results) ? results.find(r => r && !r.error) : results

  if (!action || !action.targets) {
    return reply.code(404).send({ error: 'ERR_ACTION_NOT_FOUND' })
  }

  // Walk targets to find the first successful downloadLogs result
  let meta = null
  for (const rack of Object.values(action.targets)) {
    for (const call of (rack.calls || [])) {
      if (call.result?.success && call.result?.data?.coreKey) {
        meta = call.result.data
        break
      }
    }
    if (meta) break
  }

  if (!meta) {
    return reply.code(404).send({ error: 'ERR_LOG_NOT_AVAILABLE' })
  }

  if (meta.expiresAt && Date.now() > meta.expiresAt) {
    return reply.code(410).send({ error: 'ERR_LOG_EXPIRED' })
  }

  // Set streaming headers — Content-Length enables browser download progress
  const filename = `miner-log-${meta.minerId || 'unknown'}-${id}.log`
  reply.header('Content-Type', 'application/octet-stream')
  reply.header('Content-Disposition', `attachment; filename="${filename}"`)
  reply.header('Content-Length', meta.byteLength)
  reply.header('Cache-Control', 'no-store')

  let stream
  try {
    stream = await ctx.logDownloader.stream(meta.coreKey, meta.byteLength)
  } catch (err) {
    const code = err.message === 'ERR_LOG_PEER_TIMEOUT' || err.message === 'ERR_LOG_PEER_NOT_FOUND'
      ? 503
      : 500
    return reply.code(code).send({ error: err.message })
  }

  // Fastify pipes a Readable stream directly to the HTTP response — no buffering
  return reply.send(stream)
}

module.exports = {
  queryActionsBatch,
  queryActions,
  getAction,
  pushAction,
  voteAction,
  cancelActionsBatch,
  pushActionsBatch,
  downloadLogFile
}
