'use strict'

const async = require('async')
const { RPC_TIMEOUT } = require('./constants')
const { getStartOfDay } = require('./period.utils')

const dateNowSec = () => Math.floor(Date.now() / 1000)

const extractIps = (req) => {
  const ips = new Set()

  if (req.headers['x-forwarded-for']) {
    req.headers['x-forwarded-for'].split(',').forEach(ip => {
      ips.add(ip.trim())
    })
  }

  if (req.ip) {
    ips.add(req.ip)
  }

  if (req.ips) {
    req.ips.map(ip => ips.add(ip))
  }

  if (req.socket?.remoteAddress) {
    ips.add(req.socket.remoteAddress)
  }

  if (!ips.size) {
    throw new Error('ERR_IP_RESOLVE_FAIL')
  }

  return Array.from(ips.values())
}

const isValidJsonObject = (data) => {
  return typeof data === 'object' && data !== null && !Array.isArray(data)
}

const isValidEmail = (email) => {
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/
  return emailRegex.test(email)
}

const getRpcTimeout = (conf) => {
  return conf.rpcTimeout || RPC_TIMEOUT
}

const getAuthTokenFromHeaders = (headers) => {
  const authHeader = headers.authorization || headers.Authorization
  if (authHeader?.toLowerCase().startsWith('bearer ')) {
    return authHeader.split(' ')[1]
  }

  return null
}

/**
 * Safely parses a JSON string from query parameters
 * @param {string} jsonString - The JSON string to parse
 * @param {string} errorCode - Error code to throw if parsing fails
 * @returns {any} Parsed JSON object
 * @throws {Error} If JSON parsing fails
 */
const parseJsonQueryParam = (jsonString, errorCode = 'ERR_INVALID_JSON') => {
  if (!jsonString) return undefined
  try {
    return JSON.parse(jsonString)
  } catch {
    throw new Error(errorCode)
  }
}

const runParallel = (tasks) =>
  new Promise((resolve, reject) => {
    async.parallel(tasks, (err, results) => {
      if (err) reject(err)
      else resolve(results)
    })
  })

const flattenRpcResults = (results) => {
  const items = []
  const seen = new Set()
  if (!Array.isArray(results)) return items

  for (const orkResult of results) {
    if (!orkResult || orkResult.error) continue
    const data = Array.isArray(orkResult) ? orkResult : (orkResult.data || orkResult.result || [])
    if (!Array.isArray(data)) continue

    for (const item of data) {
      if (!item) continue
      const id = item.id || item._id
      if (id && seen.has(id)) continue
      if (id) seen.add(id)
      items.push(item)
    }
  }

  return items
}

const safeDiv = (numerator, denominator) =>
  typeof numerator === 'number' &&
    typeof denominator === 'number' &&
    denominator !== 0
    ? numerator / denominator
    : null

function deduplicateAlerts (alerts) {
  const seen = new Set()
  const result = []
  for (const alert of alerts) {
    if (!alert.uuid) {
      result.push(alert)
    } else if (!seen.has(alert.uuid)) {
      seen.add(alert.uuid)
      result.push(alert)
    }
  }
  return result
}

async function submitWorkOrderAction (ctx, req, action, paramObj) {
  const rackId = ctx.conf.workOrderRackId
  if (!rackId) throw new Error('ERR_WORK_ORDER_RACK_ID_NOT_CONFIGURED')

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

function escapeRegex (s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stableJsonString (raw) {
  if (typeof raw !== 'string') return raw
  try {
    const parsed = JSON.parse(raw)
    if (parsed === null || typeof parsed !== 'object') return raw
    return JSON.stringify(parsed, Object.keys(parsed).sort())
  } catch {
    return raw
  }
}

async function listThingsWithCount (ctx, query, { offset = 0, limit = 100, sort, fields } = {}) {
  const params = { query, offset, limit }
  if (sort !== undefined) params.sort = sort
  if (fields !== undefined) params.fields = fields

  const [listResults, countResults] = await Promise.all([
    ctx.dataProxy.requestData('listThings', params),
    ctx.dataProxy.requestData('getThingsCount', { query })
  ])

  // Each ork applies offset/limit locally so the union can be up to N*limit
  // items across N orks. Cap to the requested page so we never return more
  // than the caller asked for. Pagination across multiple racks is still
  // best-effort because each rack uses the same offset locally.
  const flat = flattenRpcResults(listResults)
  const data = flat.slice(0, limit)
  const totalCount = countResults.reduce((acc, c) => acc + (Number(c) || 0), 0)
  return { data, totalCount, offset, limit, hasMore: offset + limit < totalCount }
}

function matchesFilter (item, filter, allowedFields) {
  if (!filter) return true
  for (const key of allowedFields) {
    if (filter[key] === undefined) continue
    const filterVal = filter[key]
    const itemVal = item[key]
    if (Array.isArray(filterVal)) {
      if (!filterVal.includes(itemVal)) return false
    } else if (itemVal !== filterVal) {
      return false
    }
  }
  return true
}

module.exports = {
  dateNowSec,
  extractIps,
  isValidJsonObject,
  isValidEmail,
  getRpcTimeout,
  getAuthTokenFromHeaders,
  parseJsonQueryParam,
  getStartOfDay,
  flattenRpcResults,
  safeDiv,
  runParallel,
  deduplicateAlerts,
  matchesFilter,
  submitWorkOrderAction,
  escapeRegex,
  stableJsonString,
  listThingsWithCount
}
