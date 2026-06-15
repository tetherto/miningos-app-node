'use strict'

const { RPC_METHODS, WORKER_TAGS } = require('../../constants')
const { validateStartEnd } = require('../../metrics.utils')

// Default historical points cap — mirrors the UI's LIMIT (288) used by the
// consumption line chart's tail-log fetch.
const DEFAULT_LIMIT = 288
// Default interval when the caller does not specify one — mirrors the UI's
// useLineChartTimeline default of '5m'.
const DEFAULT_INTERVAL = '5m'
// Power values pass through with a static unit; no dynamic kW/MW scaling here
// (that stays a UI concern).
const POWER_UNIT = 'W'

// Field projections the consumption line chart sends to /auth/tail-log today.
const CONSUMPTION_FIELDS = { 'last.snap.stats.power_w': 1, info: 1 }
const CONSUMPTION_AGGR_FIELDS = {
  site_power_w: 1,
  power_w_sum_aggr: 1,
  container_power_w_aggr: 1,
  transformer_power_w: 1
}

// Site power-meter lookup used by the UI header stats (useHeaderStats) to derive
// the "current" consumption value when charting site power (site_power_w).
const SITE_POWERMETER_QUERY = { 'info.pos': { $eq: 'site' } }
const SITE_POWERMETER_FIELDS = { id: 1, 'last.snap.stats.power_w': 1, tags: 1 }
const SITE_POWERMETER_LIMIT = 100
const SITE_POWER_W_PATH = 'last.snap.stats.power_w'

/**
 * Resolve the chart "type" from a tag — mirrors getChartType in
 * ConsumptionLineChart.tsx.
 */
function getChartType (tag) {
  if (tag.includes('container')) return 'container'
  if (tag.includes('miner')) return 'miner'
  return tag.replace(/^t-/, '')
}

/**
 * Strip the leading "container-" prefix — mirrors removeContainerPrefix in
 * deviceUtils.ts.
 */
function removeContainerPrefix (text) {
  return text.replace(/^container-/, '')
}

/**
 * Resolve which back-end attribute holds the power value for a given tag —
 * mirrors getPowerBEAttribute in ConsumptionLineChart.tsx.
 */
function getPowerBEAttribute (tag, totalTransformerConsumption) {
  if (tag.includes('container')) {
    return `container_power_w_aggr.${removeContainerPrefix(tag)}`
  }
  if (totalTransformerConsumption) return 'transformer_power_w'
  if (tag.includes('powermeter')) return 'site_power_w'
  return 'power_w_sum_aggr'
}

/**
 * Dot-path getter, equivalent to lodash _get for the simple paths used here
 * (e.g. "container_power_w_aggr.<name>", "last.snap.stats.power_w").
 */
function getByPath (obj, path) {
  if (!obj || !path) return undefined
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj)
}

/**
 * Build the historical timeseries (log) of power points for the requested
 * attribute. Mirrors the per-entry mapping in getConsumptionGraphData:
 * `powerConsumptionData.push({ x: entry.ts, y: sumY || 0 })`.
 */
function buildConsumptionLog (points, powerBEAttribute) {
  return points.map((entry) => ({
    ts: entry.ts,
    value: getByPath(entry, powerBEAttribute) || 0,
    unit: POWER_UNIT
  }))
}

/**
 * Compute min/max/avg over the raw power values, replicating the arithmetic in
 * getConsumptionGraphData (sum of `value || 0`, avg = total / count). Values are
 * raw watts with a static unit — no unit scaling. Empty range yields null
 * min/max/avg (clean-null convention, matching the other metrics handlers).
 */
function computeConsumptionSummary (points, powerBEAttribute) {
  if (!points.length) {
    return {
      min: { value: null, unit: POWER_UNIT },
      max: { value: null, unit: POWER_UNIT },
      avg: { value: null, unit: POWER_UNIT }
    }
  }

  let total = 0
  let min = Number.MAX_SAFE_INTEGER
  let max = Number.MIN_SAFE_INTEGER

  for (const entry of points) {
    const value = getByPath(entry, powerBEAttribute) || 0
    total += value
    if (value < min) min = value
    if (value > max) max = value
  }

  return {
    min: { value: min, unit: POWER_UNIT },
    max: { value: max, unit: POWER_UNIT },
    avg: { value: total / points.length, unit: POWER_UNIT }
  }
}

/**
 * Resolve the "current" consumption value. Mirrors the conditional in
 * getConsumptionGraphData:
 *   - site_power_w  -> the site power-meter's live power_w (from list-things),
 *                      the same source useHeaderStats reads for rawConsumptionW.
 *   - otherwise     -> the last historical point's attribute value.
 * This is the conditional second source the UI fetches today.
 */
async function resolveCurrentValue (ctx, points, powerBEAttribute) {
  if (powerBEAttribute === 'site_power_w') {
    const listRes = await ctx.dataProxy.requestDataMap(RPC_METHODS.LIST_THINGS, {
      status: 1,
      query: SITE_POWERMETER_QUERY,
      fields: SITE_POWERMETER_FIELDS,
      limit: SITE_POWERMETER_LIMIT
    })

    const things = Array.isArray(listRes) && Array.isArray(listRes[0]) ? listRes[0] : []
    const head = things[0]
    return Number(getByPath(head, SITE_POWER_W_PATH)) || 0
  }

  const last = points[points.length - 1]
  return getByPath(last, powerBEAttribute) || 0
}

/**
 * GET /site/power-consumption
 *
 * Server-side reproduction of the consumption line chart's client logic: fetch
 * the power tail-log for the requested tag/interval over a time range, select
 * the tag-appropriate power attribute, and return the historical points (log)
 * plus min/max/avg + current (summary). Values pass through as raw watts with a
 * static unit; the UI keeps any kW/MW display scaling.
 */
async function getSitePowerConsumption (ctx, req) {
  const { start, end } = validateStartEnd(req)

  const tag = req.query.tag || WORKER_TAGS.MINER
  const interval = req.query.interval || DEFAULT_INTERVAL
  const limit = Number(req.query.limit) || DEFAULT_LIMIT
  const totalTransformerConsumption = !!req.query.totalTransformerConsumption
  const powerBEAttribute = req.query.powerAttribute ||
    getPowerBEAttribute(tag, totalTransformerConsumption)

  const res = await ctx.dataProxy.requestDataMap(RPC_METHODS.TAIL_LOG, {
    key: `stat-${interval}`,
    type: getChartType(tag),
    tag,
    fields: CONSUMPTION_FIELDS,
    aggrFields: CONSUMPTION_AGGR_FIELDS,
    start,
    end,
    limit
  })

  // The chart consumes the first site's series (`_head(tailLogData)`); mirror that.
  const points = Array.isArray(res) && Array.isArray(res[0]) ? res[0] : []

  const log = buildConsumptionLog(points, powerBEAttribute)
  const summary = computeConsumptionSummary(points, powerBEAttribute)
  summary.current = {
    value: await resolveCurrentValue(ctx, points, powerBEAttribute),
    unit: POWER_UNIT
  }

  return { log, summary }
}

module.exports = {
  getSitePowerConsumption,
  getChartType,
  removeContainerPrefix,
  getPowerBEAttribute,
  getByPath,
  buildConsumptionLog,
  computeConsumptionSummary,
  resolveCurrentValue
}
