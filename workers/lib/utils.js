'use strict'

const async = require('async')
const { RPC_TIMEOUT, RPC_CONCURRENCY_LIMIT } = require('./constants')

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
  const emailRegex = /^[a-zA-Z0-9.!#$%&’*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/
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

/**
 * Executes RPC requests across multiple orks
 * @param {Object} ctx - Context object
 * @param {string} method - RPC method name
 * @param {Object} payload - RPC payload
 * @param {Function} errorHandler - Optional error handler function
 * @returns {Promise<Array>} Array of results
 */
const requestRpcEachLimit = async (ctx, method, payload, errorHandler = null) => {
  const results = []
  const concurrency = ctx.conf?.rpcConcurrencyLimit || RPC_CONCURRENCY_LIMIT

  await async.eachLimit(ctx.conf.orks, concurrency, async (store) => {
    try {
      const res = await ctx.net_r0.jRequest(
        store.rpcPublicKey,
        method,
        payload,
        { timeout: getRpcTimeout(ctx.conf) }
      )
      if (errorHandler) {
        errorHandler(res, results)
      } else {
        results.push(res)
      }
    } catch (err) {
      if (errorHandler) {
        errorHandler({ error: err.message }, results)
      } else {
        results.push({ error: err.message })
      }
    }
  })

  return results
}

/**
 * Executes RPC requests across multiple orks
 * @param {Object} ctx - Context object
 * @param {string} method - RPC method name
 * @param {Object} payload - RPC payload
 * @returns {Promise<Array>} Array of results
 */
const requestRpcMapLimit = async (ctx, method, payload) => {
  const concurrency = ctx.conf?.rpcConcurrencyLimit || RPC_CONCURRENCY_LIMIT

  return await async.mapLimit(ctx.conf.orks, concurrency, async (store) => {
    return ctx.net_r0.jRequest(
      store.rpcPublicKey,
      method,
      payload,
      { timeout: getRpcTimeout(ctx.conf) }
    )
  })
}

module.exports = {
  dateNowSec,
  extractIps,
  isValidJsonObject,
  isValidEmail,
  getRpcTimeout,
  getAuthTokenFromHeaders,
  parseJsonQueryParam,
  requestRpcEachLimit,
  requestRpcMapLimit
}
