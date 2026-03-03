'use strict'

const authRoutes = require('./routes/auth.routes')
const usersRoutes = require('./routes/users.routes')
const actionsRoutes = require('./routes/actions.routes')
const logsRoutes = require('./routes/logs.routes')
const globalRoutes = require('./routes/global.routes')
const thingsRoutes = require('./routes/things.routes')
const settingsRoutes = require('./routes/settings.routes')
const wsRoutes = require('./routes/ws.routes')
const financeRoutes = require('./routes/finance.routes')
const poolsRoutes = require('./routes/pools.routes')
const poolManagerRoutes = require('./routes/poolManager.routes')
const siteRoutes = require('./routes/site.routes')
const alertsRoutes = require('./routes/alerts.routes')

/**
 * Collect all routes into a flat array for server injection.
 * Each route is a Fastify-style object: { method, url, handler, ... }
 */
function routes (ctx) {
  return [
    ...authRoutes(ctx),
    ...actionsRoutes(ctx),
    ...logsRoutes(ctx),
    ...globalRoutes(ctx),
    ...thingsRoutes(ctx),
    ...usersRoutes(ctx),
    ...settingsRoutes(ctx),
    ...wsRoutes(ctx),
    ...financeRoutes(ctx),
    ...poolsRoutes(ctx),
    ...poolManagerRoutes(ctx),
    ...siteRoutes(ctx),
    ...alertsRoutes(ctx)
  ]
}

module.exports = {
  routes
}
