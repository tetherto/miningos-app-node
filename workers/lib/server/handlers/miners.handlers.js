'use strict'

const { parseJsonQueryParam, requestRpcMapLimit } = require('../../utils')
const {
  mapFilterFields,
  mapSortFields,
  buildSearchQuery,
  flattenOrkResults,
  sortItems,
  paginateResults
} = require('../lib/queryUtils')

/**
 * Maps clean miner field names to internal dot-paths.
 * Users can filter/sort using clean names; unknown keys pass through as-is.
 */
const MINER_FIELD_MAP = {
  status: 'last.snap.stats.status',
  hashrate: 'last.snap.stats.hashrate_mhs',
  power: 'last.snap.stats.power_w',
  efficiency: 'last.snap.stats.efficiency_w_ths',
  temperature: 'last.snap.stats.temperature_c',
  powerMode: 'last.snap.config.power_mode',
  firmware: 'last.snap.config.firmware_ver',
  model: 'last.snap.model',
  ip: 'opts.address',
  container: 'info.container',
  rack: 'rack',
  serialNum: 'info.serialNum',
  macAddress: 'info.macAddress',
  pool: 'last.snap.config.pool_config.url',
  led: 'last.snap.config.led_status',
  alerts: 'last.alerts'
}

/**
 * Internal fields searched when using the `search` query param.
 */
const MINER_SEARCH_FIELDS = [
  'id',
  'opts.address',
  'info.serialNum',
  'info.macAddress',
  'info.container',
  'code',
  'type'
]

/**
 * Default field projection when user doesn't specify fields.
 * Includes all fields needed for formatMiner.
 */
const MINER_DEFAULT_FIELDS = {
  id: 1,
  type: 1,
  code: 1,
  info: 1,
  tags: 1,
  rack: 1,
  comments: 1,
  'last.alerts': 1,
  'last.snap.stats': 1,
  'last.snap.config': 1,
  'last.snap.model': 1,
  'last.uptime': 1,
  'last.ts': 1,
  'opts.address': 1,
  ts: 1
}

const MAX_LIMIT = 200
const DEFAULT_LIMIT = 50

/**
 * Transforms a raw miner thing into the clean response format.
 *
 * @param {Object} raw - Raw miner object from listThings RPC
 * @param {Object|null} poolWorkers - Pool worker lookup { minerId: { hashrate } }
 * @returns {Object} Clean miner response object
 */
function formatMiner (raw, poolWorkers) {
  const snap = raw.last?.snap || {}
  const stats = snap.stats || {}
  const config = snap.config || {}

  const miner = {
    id: raw.id,
    type: raw.type,
    model: snap.model || raw.type,
    code: raw.code,
    ip: raw.opts?.address,
    container: raw.info?.container,
    rack: raw.rack,
    position: raw.info?.pos,
    status: stats.status,
    hashrate: stats.hashrate_mhs || 0,
    power: stats.power_w || 0,
    temperature: stats.temperature_c,
    efficiency: stats.efficiency_w_ths || 0,
    uptime: raw.last?.uptime,
    firmware: config.firmware_ver,
    powerMode: config.power_mode,
    ledStatus: config.led_status,
    poolConfig: config.pool_config,
    alerts: raw.last?.alerts,
    comments: raw.comments,
    serialNum: raw.info?.serialNum,
    macAddress: raw.info?.macAddress,
    lastSeen: raw.last?.ts || raw.ts
  }

  if (poolWorkers) {
    const poolWorker = poolWorkers[raw.id] || poolWorkers[raw.code]
    if (poolWorker) {
      miner.poolHashrate = poolWorker.hashrate || 0
    }
  }

  return miner
}

/**
 * Extracts a worker hashrate lookup from pool data RPC results.
 * Builds a map: workerId → { hashrate }
 *
 * @param {Array} poolDataResults - Array of ork responses from getWrkExtData
 * @returns {Object} Worker lookup map
 */
function extractPoolWorkers (poolDataResults) {
  const workers = {}
  for (const orkResult of poolDataResults) {
    if (!Array.isArray(orkResult)) continue
    for (const pool of orkResult) {
      if (!pool || !pool.workers) continue
      for (const [workerId, workerData] of Object.entries(pool.workers)) {
        workers[workerId] = workerData
      }
    }
  }
  return workers
}

/**
 * GET /auth/miners
 *
 * Lists miners with unified filter/sort/search/pagination.
 * Auto-injects miner type filter, maps clean field names to internal paths,
 * aggregates multi-ork results, and returns a paginated response.
 *
 * Replaces: GET /auth/list-things?query={"tags":{"$in":["t-miner"]}}&status=1&...
 */
async function listMiners (ctx, req) {
  const userFilter = req.query.filter
    ? parseJsonQueryParam(req.query.filter, 'ERR_FILTER_INVALID_JSON')
    : {}

  const mappedFilter = mapFilterFields(userFilter, MINER_FIELD_MAP)

  const query = {
    $and: [
      { tags: { $in: ['t-miner'] } },
      ...(Object.keys(mappedFilter).length ? [mappedFilter] : []),
      ...(req.query.search ? [buildSearchQuery(req.query.search, MINER_SEARCH_FIELDS)] : [])
    ]
  }

  const mappedSort = req.query.sort
    ? mapSortFields(parseJsonQueryParam(req.query.sort, 'ERR_SORT_INVALID_JSON'), MINER_FIELD_MAP)
    : undefined

  const fields = req.query.fields
    ? parseJsonQueryParam(req.query.fields, 'ERR_FIELDS_INVALID_JSON')
    : MINER_DEFAULT_FIELDS

  const offset = req.query.offset || 0
  const limit = Math.min(req.query.limit || DEFAULT_LIMIT, MAX_LIMIT)

  const rpcPayload = {
    query,
    fields,
    status: 1
  }

  if (mappedSort) {
    rpcPayload.sort = mappedSort
  }

  const orkResults = await requestRpcMapLimit(ctx, 'listThings', rpcPayload)
  let items = flattenOrkResults(orkResults)

  if (mappedSort) {
    items = sortItems(items, mappedSort)
  }

  let poolWorkers = null
  if (ctx.conf.featureConfig?.poolStats) {
    try {
      const poolData = await requestRpcMapLimit(ctx, 'getWrkExtData', {
        type: 'minerpool',
        query: { key: 'stats' }
      })
      poolWorkers = extractPoolWorkers(poolData)
    } catch {
      // Pool enrichment is optional — don't fail the request
    }
  }

  const paginated = paginateResults(items, offset, limit)

  return {
    data: paginated.data.map(miner => formatMiner(miner, poolWorkers)),
    totalCount: paginated.totalCount,
    offset: paginated.offset,
    limit: paginated.limit,
    hasMore: paginated.hasMore
  }
}

module.exports = {
  listMiners,
  formatMiner,
  extractPoolWorkers,
  MINER_FIELD_MAP,
  MINER_SEARCH_FIELDS,
  MINER_DEFAULT_FIELDS
}
