'use strict'

const GLOBAL_DATA_TYPES = {
  PRODUCTION_COSTS: 'productionCosts',
  FEATURES: 'features',
  SITE_ENERGY: 'siteEnergy',
  CONTAINER_SETTINGS: 'containerSettings'
}

const USER_SETTINGS_TYPE = 'userSettings'

const SUPER_ADMIN_ID = '1'
const SUPER_ADMIN_ROLE = '*'

const MIGRATED_USER_ROLES = {
  DEFAULT: 'site_operator',
  READ_ONLY: 'read_only_user'
}

const AUTH_PERMISSIONS = {
  MINER: 'miner',
  CONTAINER: 'container',
  MINERPOOL: 'minerpool',
  POWERMETER: 'powermeter',
  TEMP: 'temp',
  ELECTRICITY: 'electricity',
  FEATURES: 'features',
  REVENUE: 'revenue',
  ACTIONS: 'actions',
  USERS: 'users',
  PRODUCTION: 'production',
  ALERTS: 'alerts',
  CABINETS: 'cabinets',
  COMMENTS: 'comments',
  EXPLORER: 'explorer',
  INVENTORY: 'inventory',
  REPORTING: 'reporting',
  SETTINGS: 'settings',
  TICKETS: 'tickets',
  POWER_SPOT_FORECAST: 'power_spot_forecast'
}

const AUTH_LEVELS = {
  READ: 'r',
  WRITE: 'w'
}

const AUTH_CAPS = Object.freeze({
  m: 'miner',
  c: 'container',
  mp: 'minerpool',
  p: 'powermeter',
  t: 'temp',
  e: 'electricity',
  f: 'features',
  r: 'revenue'
})

const COMMENT_ACTION = {
  ADD: 'saveThingComment',
  EDIT: 'editThingComment',
  DELETE: 'deleteThingComment'
}

const ENDPOINTS = {
  // OAuth endpoints
  OAUTH_GOOGLE_CALLBACK: '/oauth/google/callback',

  // Auth endpoints
  USERINFO: '/auth/userinfo',
  TOKEN: '/auth/token',
  PERMISSIONS: '/auth/permissions',
  EXT_DATA: '/auth/ext-data',

  // User endpoints
  USERS: '/auth/users',
  USERS_DELETE: '/auth/users/delete',
  USER_SETTINGS: '/auth/user/settings',

  // Global endpoints
  GLOBAL_CONFIG: '/auth/global-config',
  GLOBAL_DATA: '/auth/global/data',
  FEATURE_CONFIG: '/auth/featureConfig',
  FEATURES: '/auth/features',
  SITE: '/auth/site',

  // Actions endpoints
  ACTIONS: '/auth/actions',
  ACTIONS_BATCH: '/auth/actions/batch',
  ACTIONS_SINGLE: '/auth/actions/:type/:id',
  ACTIONS_VOTING: '/auth/actions/voting',
  ACTIONS_VOTING_BATCH: '/auth/actions/voting/batch',
  ACTIONS_VOTE: '/auth/actions/voting/:id/vote',
  ACTIONS_CANCEL: '/auth/actions/voting/cancel',

  // Logs endpoints
  TAIL_LOG: '/auth/tail-log',
  TAIL_LOG_MULTI: '/auth/tail-log/multi',
  TAIL_LOG_RANGE_AGGR: '/auth/tail-log/range-aggr',
  HISTORY_LOG: '/auth/history-log',

  // Things endpoints
  LIST_THINGS: '/auth/list-things',
  LIST_RACKS: '/auth/list-racks',
  THING_COMMENT: '/auth/thing/comment',
  SETTINGS: '/auth/settings',
  WORKER_CONFIG: '/auth/worker-config',
  THING_CONFIG: '/auth/thing-config',

  // WebSocket endpoint
  WEBSOCKET: '/ws'
}

const HTTP_METHODS = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH'
}

const OPERATIONS = {
  // Auth operations
  AUTH_USERINFO_READ: 'auth.userinfo.read',
  AUTH_TOKEN_GENERATE: 'auth.token.generate',
  AUTH_PERMISSIONS_READ: 'auth.permissions.read',
  AUTH_EXT_DATA_READ: 'auth.extData.read',

  // User operations
  USER_READ: 'user.read',
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',

  // Global operations
  GLOBAL_CONFIG_READ: 'global.config.read',
  GLOBAL_CONFIG_WRITE: 'global.config.write',
  GLOBAL_DATA_READ: 'global.data.read',
  GLOBAL_DATA_WRITE: 'global.data.write',
  GLOBAL_FEATURE_CONFIG_READ: 'global.featureConfig.read',
  GLOBAL_FEATURES_READ: 'global.features.read',
  GLOBAL_FEATURES_WRITE: 'global.features.write',
  GLOBAL_SITE_CONFIG_READ: 'global.siteConfig.read',

  // Actions operations
  ACTIONS_QUERY: 'actions.query',
  ACTIONS_BATCH_QUERY: 'actions.batch.query',
  ACTIONS_SINGLE_READ: 'actions.single.read',
  ACTIONS_VOTING: 'actions.voting',
  ACTIONS_VOTING_BATCH: 'actions.voting.batch',
  ACTIONS_VOTE: 'actions.vote',
  ACTIONS_CANCEL: 'actions.cancel',

  // Logs operations
  LOGS_TAIL_READ: 'logs.tail.read',
  LOGS_TAIL_MULTI_READ: 'logs.tail.multi.read',
  LOGS_TAIL_RANGE_AGGR_READ: 'logs.tail.range.aggr.read',
  LOGS_HISTORY_READ: 'logs.history.read',

  // Things operations
  THINGS_LIST_READ: 'things.list.read',
  RACKS_LIST_READ: 'racks.list.read',
  THING_COMMENT_READ: 'thing.comment.read',
  THING_COMMENT_WRITE: 'thing.comment.write',
  THING_COMMENT_DELETE: 'thing.comment.delete',
  THING_SETTINGS_READ: 'thing.settings.read',
  THING_SETTINGS_WRITE: 'thing.settings.write',
  WORKER_CONFIG_READ: 'worker.config.read',
  THING_CONFIG_READ: 'thing.config.read'
}

const DEFAULTS = {
  USER_ID: 'anonymous',
  OPERATION_COUNT: 1
}

const STATUS_CODES = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500
}

const RPC_TIMEOUT = 15000
const RPC_CONCURRENCY_LIMIT = 2

module.exports = {
  SUPER_ADMIN_ROLE,
  GLOBAL_DATA_TYPES,
  SUPER_ADMIN_ID,
  MIGRATED_USER_ROLES,
  COMMENT_ACTION,
  AUTH_PERMISSIONS,
  AUTH_LEVELS,
  AUTH_CAPS,
  ENDPOINTS,
  HTTP_METHODS,
  OPERATIONS,
  DEFAULTS,
  STATUS_CODES,
  RPC_TIMEOUT,
  RPC_CONCURRENCY_LIMIT,
  USER_SETTINGS_TYPE
}
