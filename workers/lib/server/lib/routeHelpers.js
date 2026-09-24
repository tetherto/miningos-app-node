'use strict'

const { authCheck } = require('./authCheck')
const { send200 } = require('./send200')
const { cachedRoute } = require('./cachedRoute')
const { capCheck } = require('./capCheck')

const READ_METHODS = ['GET', 'HEAD']

/**
 * Creates a standard authenticated route handler
 * @param {Function} handler - The handler function (ctx, req, rep)
 * @returns {Function} Route handler
 */
function createAuthHandler (ctx, handler) {
  return async (req, rep) => {
    const result = await handler(ctx, req, rep)
    return send200(rep, result)
  }
}

/**
 * Creates an authenticated route.
 * GET/HEAD requests are checked at read level, all other methods at write level.
 * @param {Object} ctx - Context object
 * @param {Array} perms - Optional permissions
 * @returns {Function} onRequest handler
 */
function createAuthOnRequest (ctx, perms = null) {
  return async (req, rep) => {
    await authCheck(ctx, req, rep)
    if (perms && !ctx.noAuth) {
      const write = !READ_METHODS.includes(req.method)
      await capCheck(ctx, req, rep, perms, write)
    }
  }
}

/**
 * Creates an authenticated route that is always checked at read level, whatever
 * the HTTP method. For endpoints that use POST for transport reasons (kicking off
 * an async job, passing a body) but do not mutate anything the caller owns —
 * e.g. requesting a miner log archive.
 * @param {Object} ctx - Context object
 * @param {Array} perms - Optional permissions
 * @returns {Function} onRequest handler
 */
function createReadAuthOnRequest (ctx, perms = null) {
  return async (req, rep) => {
    await authCheck(ctx, req, rep)
    if (perms && !ctx.noAuth) {
      await capCheck(ctx, req, rep, perms, false)
    }
  }
}

/**
 * Creates a cached route handler. A keyParts function may return null to
 * bypass the cache for that request (e.g. keys that embed caller-supplied
 * timestamps and would never be requested again).
 * @param {Object} ctx - Context object
 * @param {Array|Function} keyParts - Cache key parts or function to generate them
 * @param {string} endpoint - Endpoint path
 * @param {Function} handler - Handler function (ctx, req, rep)
 * @returns {Function} Route handler
 */
function createCachedHandler (ctx, keyParts, endpoint, handler) {
  return async (req, rep) => {
    const key = typeof keyParts === 'function' ? keyParts(req) : keyParts
    if (!key) {
      const result = await handler(ctx, req, rep)
      return send200(rep, result)
    }
    const handlerFunc = () => handler(ctx, req, rep)
    const result = await cachedRoute(ctx, key, endpoint, handlerFunc, !!req.query.overwriteCache)
    return send200(rep, result)
  }
}

/**
 * Creates a simple authenticated route
 * @param {Object} ctx - Context object
 * @param {Function} handler - Handler function (ctx, req, rep)
 * @param {Array} perms - Optional permissions array
 * @returns {Object} Route configuration
 */
function createAuthRoute (ctx, handler, perms = null) {
  return {
    onRequest: createAuthOnRequest(ctx, perms),
    handler: createAuthHandler(ctx, handler)
  }
}

/**
 * Creates a cached authenticated route
 * @param {Object} ctx - Context object
 * @param {Array|Function} keyParts - Cache key parts or function to generate them
 * @param {string} endpoint - Endpoint path
 * @param {Function} handler - Handler function (ctx, req, rep)
 * @param {Array} perms - Optional permissions array
 * @returns {Object} Route configuration
 */
function createCachedAuthRoute (ctx, keyParts, endpoint, handler, perms = null) {
  return {
    onRequest: createAuthOnRequest(ctx, perms),
    handler: createCachedHandler(ctx, keyParts, endpoint, handler)
  }
}

/**
 * preValidation hook for routes that do not use `timezone`. Runs before schema
 * validation (which would otherwise ignore or strip the unknown param), so a caller
 * that sends it gets a 400 instead of a silent no-op.
 * @param {Function} [allows] - (req) => true when this request does use the zone
 * @returns {Function} Fastify preValidation hook
 */
function rejectTimezone (allows = () => false) {
  return (req, rep, done) => {
    if (req.query?.timezone !== undefined && !allows(req)) {
      return done(new Error('ERR_TIMEZONE_UNSUPPORTED'))
    }
    done()
  }
}

module.exports = {
  rejectTimezone,
  createAuthHandler,
  createAuthOnRequest,
  createReadAuthOnRequest,
  createCachedHandler,
  createAuthRoute,
  createCachedAuthRoute
}
