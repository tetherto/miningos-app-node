'use strict'

const { extractIps, getAuthTokenFromHeaders } = require('../../utils')

// Basic in-memory cache
const tokenCache = new Map()
const CACHE_TTL = 1 * 60 * 1000 // 1 minutes

async function authCheck (ctx, req, rep, tokenFromQuery = null) {
  req._info = req._info || {}

  if (ctx.noAuth) return

  const token = tokenFromQuery || getAuthTokenFromHeaders(req.headers)
  if (!token) {
    return rep.status(401).send({
      statusCode: 401,
      error: 'Missing or invalid Authorization header',
      message: 'ERR_AUTH_FAIL'
    })
  }

  const ips = extractIps(req)

  const cacheKey = `${token}:${ips.join(',')}`
  const now = Date.now()

  const cached = tokenCache.get(cacheKey)
  if (cached && now - cached.timestamp < CACHE_TTL && (ctx.conf.ttl * 1000) > CACHE_TTL) {
    req._info.user = cached.user
    req._info.authToken = token
    return
  }

  try {
    const user = await ctx.authLib?.resolveToken(token, ips)

    if (!user) {
      return rep.status(401).send({
        statusCode: 401,
        error: 'Authentication failed',
        message: 'ERR_AUTH_FAIL'
      })
    }

    tokenCache.set(cacheKey, {
      user,
      timestamp: now
    })

    req._info.user = user
    req._info.authToken = token
  } catch (err) {
    console.error('[authCheck] ❌ Final error:', err)
    throw new Error('ERR_AUTH_FAIL')
  }
}

module.exports = { authCheck }
