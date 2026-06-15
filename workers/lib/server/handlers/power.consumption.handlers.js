'use strict'

const { RPC_METHODS, WORKER_TAGS, DCS_POWER_METER_FIELDS } = require('../../constants')
const { validateStartEnd } = require('../../metrics.utils')
const {
  isCentralDCSEnabled,
  getDCSTag,
  fetchDcsThing,
  extractSiteMainMeterPowerW
} = require('../../dcs.utils')

// Mirror the UI consumption chart's tail-log fetch (LIMIT 288, default interval 5m).
const DEFAULT_LIMIT = 288
const DEFAULT_INTERVAL = '5m'
// Raw watts pass through; the UI keeps any kW/MW display scaling.
const POWER_UNIT = 'W'

const CONSUMPTION_FIELDS = { 'last.snap.stats.power_w': 1, info: 1 }
const CONSUMPTION_AGGR_FIELDS = {
  site_power_w: 1,
  power_w_sum_aggr: 1,
  container_power_w_aggr: 1,
  transformer_power_w: 1
}

// Site power-meter lookup (useHeaderStats source for the live "current" value).
const SITE_POWERMETER_QUERY = { 'info.pos': { $eq: 'site' } }
const SITE_POWERMETER_FIELDS = { id: 1, 'last.snap.stats.power_w': 1, tags: 1 }
const SITE_POWERMETER_LIMIT = 100
const SITE_POWER_W_PATH = 'last.snap.stats.power_w'

const SITE_POWER_ATTRIBUTE = 'site_power_w'
const DCS_THING_FIELDS = { id: 1, code: 1, type: 1, tags: 1, ...DCS_POWER_METER_FIELDS }

// getChartType / removeContainerPrefix / getPowerBEAttribute mirror the same
// helpers in the UI's ConsumptionLineChart.tsx / deviceUtils.ts.
function getChartType (tag) {
  if (tag.includes('container')) return 'container'
  if (tag.includes('miner')) return 'miner'
  return tag.replace(/^t-/, '')
}

function removeContainerPrefix (text) {
  return text.replace(/^container-/, '')
}

function getPowerBEAttribute (tag, totalTransformerConsumption) {
  if (tag.includes('container')) {
    return `container_power_w_aggr.${removeContainerPrefix(tag)}`
  }
  if (totalTransformerConsumption) return 'transformer_power_w'
  if (tag.includes('powermeter')) return 'site_power_w'
  return 'power_w_sum_aggr'
}

// Dot-path getter (lodash _get equivalent for the simple paths used here).
function getByPath (obj, path) {
  if (!obj || !path) return undefined
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj)
}

function buildConsumptionLog (points, powerBEAttribute) {
  return points.map((entry) => ({
    ts: entry.ts,
    value: getByPath(entry, powerBEAttribute) || 0,
    unit: POWER_UNIT
  }))
}

// min/max/avg over raw values, replicating getConsumptionGraphData's arithmetic.
// Empty range yields null min/max/avg (clean-null convention).
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

// "current" value, mirroring getConsumptionGraphData: for site_power_w it's the
// live site power-meter (list-things, useHeaderStats' source); otherwise the last
// historical point. The site_power_w case is the UI's conditional second fetch.
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

// Central-DCS site consumption: current from the DCS site_main snapshot (kW->W),
// history from the DCS thing's site_power_w tail-log stat. Until the worker/ork
// pipeline is deployed the tail-log may error or be empty, so we degrade to
// current-only (empty log, null min/max/avg) rather than fabricating history.
async function getDCSSitePowerConsumption (ctx, { start, end, interval, limit }) {
  const dcsThing = await fetchDcsThing(ctx, DCS_THING_FIELDS)
  const currentValue = extractSiteMainMeterPowerW(dcsThing)

  let points = []
  try {
    const res = await ctx.dataProxy.requestDataMap(RPC_METHODS.TAIL_LOG, {
      key: `stat-${interval}`,
      type: dcsThing?.type || 'dcs',
      tag: getDCSTag(ctx),
      aggrFields: { [SITE_POWER_ATTRIBUTE]: 1 },
      start,
      end,
      limit
    })
    points = Array.isArray(res) && Array.isArray(res[0]) ? res[0] : []
  } catch (e) {
    points = []
  }

  const log = buildConsumptionLog(points, SITE_POWER_ATTRIBUTE)
  const summary = computeConsumptionSummary(points, SITE_POWER_ATTRIBUTE)
  summary.current = { value: currentValue, unit: POWER_UNIT }

  return { log, summary }
}

// GET /site/power-consumption — server-side reproduction of the consumption line
// chart: tail-log over a tag/interval/range, tag-appropriate power attribute,
// returning { summary: min/max/avg + current, log: timeseries } in raw watts.
async function getSitePowerConsumption (ctx, req) {
  const { start, end } = validateStartEnd(req)

  const tag = req.query.tag || WORKER_TAGS.MINER
  const interval = req.query.interval || DEFAULT_INTERVAL
  const limit = Number(req.query.limit) || DEFAULT_LIMIT
  const totalTransformerConsumption = !!req.query.totalTransformerConsumption
  const powerBEAttribute = req.query.powerAttribute ||
    getPowerBEAttribute(tag, totalTransformerConsumption)

  // Central-DCS: the site meter lives in the DCS thing, not a powermeter worker.
  if (isCentralDCSEnabled(ctx) && powerBEAttribute === SITE_POWER_ATTRIBUTE) {
    return getDCSSitePowerConsumption(ctx, { start, end, interval, limit })
  }

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
  getDCSSitePowerConsumption,
  getChartType,
  removeContainerPrefix,
  getPowerBEAttribute,
  getByPath,
  buildConsumptionLog,
  computeConsumptionSummary,
  resolveCurrentValue
}
