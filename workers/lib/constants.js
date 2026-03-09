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
  POWER_SPOT_FORECAST: 'power_spot_forecast',
  POOL_CONFIG: 'pool_config',
  POOL_CONFIG_APPROVE: 'pool_config_approve'
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
  ROLES_PERMISSIONS: '/auth/roles/permissions',

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
  WEBSOCKET: '/ws',

  // Finance endpoints
  FINANCE_ENERGY_BALANCE: '/auth/finance/energy-balance',
  FINANCE_EBITDA: '/auth/finance/ebitda',
  FINANCE_COST_SUMMARY: '/auth/finance/cost-summary',
  FINANCE_SUBSIDY_FEES: '/auth/finance/subsidy-fees',
  FINANCE_REVENUE: '/auth/finance/revenue',
  FINANCE_REVENUE_SUMMARY: '/auth/finance/revenue-summary',
  FINANCE_HASH_REVENUE: '/auth/finance/hash-revenue',

  // Pools endpoints
  POOLS: '/auth/pools',
  POOLS_BALANCE_HISTORY: '/auth/pools/:pool/balance-history',

  // Pool stats endpoints
  POOL_STATS_AGGREGATE: '/auth/pool-stats/aggregate',

  // Pool Manager endpoints
  POOL_MANAGER_STATS: '/auth/pool-manager/stats',
  POOL_MANAGER_POOLS: '/auth/pool-manager/pools',
  POOL_MANAGER_MINERS: '/auth/pool-manager/miners',
  POOL_MANAGER_UNITS: '/auth/pool-manager/units',
  POOL_MANAGER_ALERTS: '/auth/pool-manager/alerts',
  SITE_STATUS_LIVE: '/auth/site/status/live',

  // Generic Config endpoints (type passed as parameter)
  // Note: Config mutations (register, update, delete) go through pushAction endpoint
  CONFIGS: '/auth/configs/:type',
  // Device listing endpoints
  CONTAINERS: '/auth/containers',
  CABINETS: '/auth/cabinets',
  CABINET_BY_ID: '/auth/cabinets/:id',

  // Metrics endpoints
  METRICS_HASHRATE: '/auth/metrics/hashrate',
  METRICS_CONSUMPTION: '/auth/metrics/consumption',
  METRICS_EFFICIENCY: '/auth/metrics/efficiency',
  METRICS_MINER_STATUS: '/auth/metrics/miner-status',
  METRICS_POWER_MODE: '/auth/metrics/power-mode',
  METRICS_POWER_MODE_TIMELINE: '/auth/metrics/power-mode/timeline',
  METRICS_TEMPERATURE: '/auth/metrics/temperature',
  METRICS_CONTAINER_TELEMETRY: '/auth/metrics/containers/:id',
  METRICS_CONTAINER_HISTORY: '/auth/metrics/containers/:id/history',

  // Alerts endpoints
  ALERTS_SITE: '/auth/alerts/site',
  ALERTS_HISTORY: '/auth/alerts/history'
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

  // User operations
  USER_CREATE: 'user.create',
  USER_UPDATE: 'user.update',
  USER_DELETE: 'user.delete',

  // Actions operations
  ACTIONS_QUERY: 'actions.query',
  ACTIONS_VOTING: 'actions.voting',
  ACTIONS_VOTING_BATCH: 'actions.voting.batch',
  ACTIONS_VOTE: 'actions.vote',
  ACTIONS_CANCEL: 'actions.cancel',

  // Things operations
  THING_COMMENT_WRITE: 'thing.comment.write'
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

const LIST_THINGS = 'listThings'
const GET_HISTORICAL_LOGS = 'getHistoricalLogs'

const RPC_METHODS = {
  TAIL_LOG_RANGE_AGGR: 'tailLogCustomRangeAggr',
  GET_WRK_EXT_DATA: 'getWrkExtData',
  LIST_THINGS: 'listThings',
  GET_HISTORICAL_LOGS: 'getHistoricalLogs',
  TAIL_LOG: 'tailLog',
  GLOBAL_CONFIG: 'getGlobalConfig',
  GET_CONFIGS: 'getConfigs'
}

const WORKER_TYPES = {
  MINER: 'miner',
  CONTAINER: 'container',
  POWERMETER: 'powermeter',
  MINERPOOL: 'minerpool',
  MEMPOOL: 'mempool',
  ELECTRICITY: 'electricity'
}

const CACHE_KEYS = {
  POOL_MANAGER_STATS: 'pool-manager/stats',
  POOL_MANAGER_POOLS: 'pool-manager/pools',
  POOL_MANAGER_MINERS: 'pool-manager/miners',
  POOL_MANAGER_UNITS: 'pool-manager/units',
  POOL_MANAGER_ALERTS: 'pool-manager/alerts'
}

const SEVERITY_LEVELS = new Set(['critical', 'high', 'medium', 'low'])

const ALERTS_DEFAULT_LIMIT = 100
const ALERTS_MAX_SITE_LIMIT = 200
const ALERTS_MAX_HISTORY_LIMIT = 1000

const SITE_ALERTS_FILTER_FIELDS = ['severity', 'type', 'container', 'deviceId']
const SITE_ALERTS_SEARCH_FIELDS = ['id', 'code', 'container']

const HISTORY_FILTER_FIELDS = ['severity', 'code', 'deviceType', 'container', 'deviceId', 'tags']
const HISTORY_SEARCH_FIELDS = ['name', 'description', 'position', 'code']

const POOL_ALERT_TYPES = [
  'all_pools_dead',
  'wrong_miner_pool',
  'wrong_miner_subaccount',
  'wrong_worker_name',
  'ip_worker_name'
]

const MINER_POOL_STATUS = {
  ONLINE: 'online',
  OFFLINE: 'offline',
  INACTIVE: 'inactive'
}

const METRICS_TIME = {
  ONE_DAY_MS: 24 * 60 * 60 * 1000,
  TWO_DAYS_MS: 2 * 24 * 60 * 60 * 1000,
  NINETY_DAYS_MS: 90 * 24 * 60 * 60 * 1000,
  THREE_HOURS_MS: 3 * 60 * 60 * 1000,
  ONE_MONTH_MS: 30 * 24 * 60 * 60 * 1000
}

const METRICS_DEFAULTS = {
  TIMELINE_LIMIT: 10080,
  CONTAINER_HISTORY_LIMIT: 10080
}

const MINER_CATEGORIES = {
  LOW: 'low',
  NORMAL: 'normal',
  HIGH: 'high',
  SLEEP: 'sleep',
  OFFLINE: 'offline',
  ERROR: 'error',
  NOT_MINING: 'notMining',
  MAINTENANCE: 'maintenance'
}

const LOG_KEYS = {
  STAT_3H: 'stat-3h',
  STAT_5M: 'stat-5m'
}

const WORKER_TAGS = {
  MINER: 't-miner',
  CONTAINER: 't-container',
  POWERMETER: 't-powermeter',
  TEMP_SENSOR: 't-sensor-temp'
}

const DEVICE_LIST_FIELDS = {
  id: 1, type: 1, code: 1, ip: 1, tags: 1, info: 1, rack: 1
}

const AGGR_FIELDS = {
  HASHRATE_SUM: 'hashrate_mhs_5m_sum_aggr',
  SITE_POWER: 'site_power_w',
  ENERGY_AGGR: 'energy_aggr',
  ACTIVE_ENERGY_IN: 'active_energy_in_aggr',
  UTE_ENERGY: 'ute_energy_aggr',
  EFFICIENCY: 'efficiency_w_ths_avg_aggr',
  POWER_MODE_GROUP: 'power_mode_group_aggr',
  STATUS_GROUP: 'status_group_aggr',
  TEMP_MAX: 'temperature_c_group_max_aggr',
  TEMP_AVG: 'temperature_c_group_avg_aggr',
  TYPE_CNT: 'type_cnt',
  OFFLINE_CNT: 'offline_cnt',
  SLEEP_CNT: 'power_mode_sleep_cnt',
  MAINTENANCE_CNT: 'maintenance_type_cnt',
  CONTAINER_SPECIFIC_STATS: 'container_specific_stats_group_aggr'
}

const PERIOD_TYPES = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly'
}

const MINERPOOL_EXT_DATA_KEYS = {
  TRANSACTIONS: 'transactions',
  STATS: 'stats'
}

const NON_METRIC_KEYS = [
  'ts',
  'site',
  'year',
  'monthName',
  'month',
  'period'
]

const BTC_SATS = 100000000

const RANGE_BUCKETS = {
  '1D': 86400000,
  '1W': 604800000,
  '1M': 2592000000
}

const RPC_TIMEOUT = 15000
const RPC_CONCURRENCY_LIMIT = 2
const RPC_PAGE_LIMIT = 100

// Allowed config types for generic config CRUD
const CONFIG_TYPES = {
  POOL: 'pool'
}

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
  RPC_PAGE_LIMIT,
  USER_SETTINGS_TYPE,
  LIST_THINGS,
  GET_HISTORICAL_LOGS,
  RPC_METHODS,
  WORKER_TYPES,
  CACHE_KEYS,
  POOL_ALERT_TYPES,
  MINER_POOL_STATUS,
  AGGR_FIELDS,
  PERIOD_TYPES,
  MINERPOOL_EXT_DATA_KEYS,
  NON_METRIC_KEYS,
  BTC_SATS,
  RANGE_BUCKETS,
  CONFIG_TYPES,
  METRICS_TIME,
  METRICS_DEFAULTS,
  MINER_CATEGORIES,
  LOG_KEYS,
  WORKER_TAGS,
  SEVERITY_LEVELS,
  ALERTS_DEFAULT_LIMIT,
  ALERTS_MAX_SITE_LIMIT,
  ALERTS_MAX_HISTORY_LIMIT,
  SITE_ALERTS_FILTER_FIELDS,
  SITE_ALERTS_SEARCH_FIELDS,
  HISTORY_FILTER_FIELDS,
  HISTORY_SEARCH_FIELDS,
  DEVICE_LIST_FIELDS
}
