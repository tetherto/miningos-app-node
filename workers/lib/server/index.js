'use strict'

const authRoutes = require('./routes/auth.routes')
const usersRoutes = require('./routes/users.routes')
const actionsRoutes = require('./routes/actions.routes')
const logsRoutes = require('./routes/logs.routes')
const globalRoutes = require('./routes/global.routes')
const thingsRoutes = require('./routes/things.routes')
const settingsRoutes = require('./routes/settings.routes')
const wsRoutes = require('./routes/ws.routes')

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
    ...wsRoutes(ctx)
  ]
}

module.exports = {
  routes
}
