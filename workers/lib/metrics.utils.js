'use strict'

const { getStartOfDay, zoneOffsetMs, localDayStart, localWeekStart, localMonthStartTs, requireZone } = require('./period.utils')
const { METRICS_TIME, LOG_KEYS, LOCKED_TIMEZONE_DEFAULT } = require('./constants')

/**
 * Parse timestamp from RPC entry.
 * With groupRange, ts may be a range string like "1770854400000-1771459199999".
 * Extracts the start of the range in that case.
 */
function parseEntryTs (ts) {
  if (typeof ts === 'number') return ts
  if (typeof ts === 'string') {
    const dashIdx = ts.indexOf('-')
    if (dashIdx > 0) return Number(ts.slice(0, dashIdx))
    return Number(ts)
  }
  return null
}

function parseEntryTimeRange (ts) {
  if (typeof ts !== 'string') return null
  const dashIdx = ts.indexOf('-')
  if (dashIdx <= 0) return null
  const startTs = Number(ts.slice(0, dashIdx))
  const endTs = Number(ts.slice(dashIdx + 1))
  if (!Number.isFinite(startTs) || !Number.isFinite(endTs)) return null
  return { startTs, endTs }
}

function validateStartEnd (req) {
  const start = Number(req.query.start)
  const end = Number(req.query.end)

  if (!start || !end) {
    throw new Error('ERR_MISSING_START_END')
  }

  if (start >= end) {
    throw new Error('ERR_INVALID_DATE_RANGE')
  }

  return { start, end }
}

function assertTimezone (timezone) {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone })
    return timezone
  } catch (err) {
    throw new Error('ERR_INVALID_TIMEZONE')
  }
}

// Always resolves to a real zone: the request's own `timezone`, else the site's
// featureConfig.lockedTimezone, else the constants default. Used only for local
// day/month bucketing - never to reinterpret start/end or to shift response timestamps,
// which are true UTC instants in and out.
function resolveTimezone (ctx, req) {
  const timezone = req.query.timezone || ctx.conf?.featureConfig?.lockedTimezone || LOCKED_TIMEZONE_DEFAULT
  return assertTimezone(timezone)
}

// start/end are always true UTC instants, exactly like /auth/export - `timezone` never
// reinterprets them as wall-clock time. It still resolves (request, else lockedTimezone,
// else the constants default) for callers that bucket by it.
function resolveStartEnd (ctx, req) {
  const { start, end } = validateStartEnd(req)
  const timezone = resolveTimezone(ctx, req)

  return { start, end, timezone }
}

// An optional start/end with a computed fallback: an explicitly-supplied value is a true
// UTC instant, same as resolveStartEnd - the computed default already is one too.
function resolveOptionalTimeMs (req, rawValue, defaultMs) {
  if (rawValue === undefined) return defaultMs
  return Number(rawValue)
}

function * iterateRpcEntries (results) {
  for (const res of results) {
    if (!res || res.error) continue
    const data = Array.isArray(res) ? res : (res.data || res.result || [])
    if (!Array.isArray(data)) continue
    for (const entry of data) {
      if (!entry || entry.error) continue
      yield entry
    }
  }
}

function forEachRangeAggrItem (entry, callback) {
  if (!entry) return
  const items = entry.data || entry.items || entry
  if (Array.isArray(items)) {
    for (const item of items) {
      const ts = getStartOfDay(parseEntryTs(item.ts || item.timestamp))
      if (!ts) continue
      callback(ts, item.val || item)
    }
  } else if (typeof items === 'object') {
    for (const [key, val] of Object.entries(items)) {
      const ts = getStartOfDay(parseEntryTs(Number(key)))
      if (!ts) continue
      callback(ts, val)
    }
  }
}

function sumObjectValues (obj) {
  if (!obj || typeof obj !== 'object') return 0
  return Object.values(obj).reduce((sum, val) => sum + (Number(val) || 0), 0)
}

/**
 * Extract container name from a device key.
 * Strips the last dash-separated segment (assumed to be position/index).
 * e.g. "bitdeer-9a-miner1" -> "bitdeer-9a"
 * NOTE: This is a heuristic based on naming convention in power_mode_group_aggr data.
 * Device keys are identifiers from aggregated data, not auto-generated IDs.
 */
function extractContainerFromMinerKey (deviceKey) {
  const lastDash = deviceKey.lastIndexOf('-')
  return lastDash > 0 ? deviceKey.slice(0, lastDash) : deviceKey
}

function resolveInterval (start, end, requested) {
  if (requested) return requested
  const range = end - start
  if (range <= METRICS_TIME.TWO_DAYS_MS) return '1h'
  if (range <= METRICS_TIME.NINETY_DAYS_MS) return '1d'
  return '1w'
}

function getIntervalConfig (interval) {
  switch (interval) {
    case '1h':
      // Sample the finer-grained stat-30m log and bucket it into 1h windows,
      // so hourly views aren't coarsened to the 3h stat cadence.
      return { key: LOG_KEYS.STAT_30M, groupRange: '1H' }
    case '1w':
      return { key: LOG_KEYS.STAT_3H, groupRange: '1W' }
    case '1M': // 30-day month; distinct from 1m (one minute)
      return { key: LOG_KEYS.STAT_3H, groupRange: '1M' }
    case '1d':
    default:
      return { key: LOG_KEYS.STAT_3H, groupRange: '1D' }
  }
}

function extractKeyEntry (orkResult, keyIndex) {
  if (!Array.isArray(orkResult)) return null
  const keyResult = orkResult[keyIndex]
  if (!Array.isArray(keyResult) || keyResult.length === 0) return null
  return keyResult[0] || null
}

// Hashrate conversion utilities
function mhsToPhs (mhs) {
  return Math.round((mhs / 1000000000) * 100) / 100
}

function mhsToThs (mhs) {
  return mhs / 1000000
}

// Rack/Group parsing utilities
function parseRackId (rackKey) {
  if (!rackKey || typeof rackKey !== 'string') return null
  const idx = rackKey.indexOf('_')
  if (idx === -1) return null
  return {
    group: rackKey.substring(0, idx),
    rack: rackKey.substring(idx + 1)
  }
}

function getGroupNumber (groupName) {
  const match = groupName.match(/group-(\d+)/i)
  return match ? parseInt(match[1], 10) : null
}

// The '*_pdu_rack_group_*' aggregations are keyed by physical position ('group-1_1-1'), while
// the rack grid is addressed by slot ('group-1_rack-1'). Both spellings reduce to group+ordinal.
function rackSlotKey (rackId) {
  const parsed = parseRackId(rackId)
  if (!parsed) return null
  const match = /(\d+)\s*$/.exec(parsed.rack)
  return match ? `${parsed.group}#${parseInt(match[1], 10)}` : null
}

function rackKeysByGroupOrdinal (...rackMaps) {
  const keysByGroup = new Map()

  for (const rackMap of rackMaps) {
    for (const rackKey of Object.keys(rackMap || {})) {
      const parsed = parseRackId(rackKey)
      if (!parsed) continue
      if (!keysByGroup.has(parsed.group)) keysByGroup.set(parsed.group, new Set())
      keysByGroup.get(parsed.group).add(rackKey)
    }
  }

  const byGroupOrdinal = new Map()
  for (const [groupId, rackKeys] of keysByGroup) {
    const byOrdinal = new Map()
    ;[...rackKeys]
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
      .forEach((rackKey, idx) => {
        const slot = rackSlotKey(rackKey)
        const ordinal = slot ? Number(slot.split('#')[1]) : idx + 1
        if (!byOrdinal.has(ordinal)) byOrdinal.set(ordinal, rackKey)
      })
    byGroupOrdinal.set(groupId, byOrdinal)
  }

  return byGroupOrdinal
}

function rackFilterFor (racks) {
  if (!racks?.length) return null
  const slots = new Set(racks.map(rackSlotKey).filter(Boolean))
  return (rackId) => slots.has(rackSlotKey(rackId))
}

function mergeGroupedField (target, source, isAverage = false) {
  if (!source || typeof source !== 'object') return

  for (const [key, value] of Object.entries(source)) {
    if (isAverage) {
      if (!target[key] || value > target[key]) {
        target[key] = value
      }
    } else {
      target[key] = (target[key] || 0) + (value || 0)
    }
  }
}

// DCS power meter utilities
function getMeterGroupMapping (meterId, energyLayout) {
  const branches = energyLayout?.branches || []

  for (const branch of branches) {
    if (branch.meter === meterId && branch.feeds) {
      const match = branch.feeds.match(/Groups?\s+(\d+)-(\d+)/i)
      if (match) {
        const start = parseInt(match[1], 10)
        const end = parseInt(match[2], 10)
        const groups = []
        for (let i = start; i <= end; i++) {
          groups.push(`group-${i}`)
        }
        return groups
      }
    }
  }
  return []
}

function buildGroupPowerFromDCS (powerMeters, hashrateByGroup, energyLayout, miningConfig) {
  const groupPower = {}

  const rackMeters = (powerMeters || []).filter(pm => pm.role === 'rack')

  for (const meter of rackMeters) {
    const meterPower = meter.power?.value || 0
    const coveredGroups = getMeterGroupMapping(meter.equipment, energyLayout)

    if (coveredGroups.length === 0 || meterPower === 0) continue

    let totalHashrate = 0
    for (const groupName of coveredGroups) {
      totalHashrate += hashrateByGroup[groupName] || 0
    }

    if (totalHashrate > 0) {
      for (const groupName of coveredGroups) {
        const groupHashrate = hashrateByGroup[groupName] || 0
        const proportion = groupHashrate / totalHashrate
        groupPower[groupName] = (groupPower[groupName] || 0) + (meterPower * proportion)
      }
    } else {
      const perGroup = meterPower / coveredGroups.length
      for (const groupName of coveredGroups) {
        groupPower[groupName] = (groupPower[groupName] || 0) + perGroup
      }
    }
  }

  return groupPower
}

const sum = (values) => values.reduce((total, value) => total + value, 0)
const mean = (values) => values.length ? sum(values) / values.length : null
const finiteValues = (entries, field) => entries.map((entry) => entry[field]).filter(Number.isFinite)

// Financial reports use pool data only: summed pool vs summed nominal over the
// buckets carrying both, so a pool polling gap never dilutes the share. This is
// the coverage basis used by the per-hour and per-day export rows.
function poolPctOfNominal (entries) {
  const pairs = entries.filter((entry) => Number.isFinite(entry.poolHashrateMhs) && entry.nominalHashrateMhs > 0)
  if (!pairs.length) return null
  return (sum(pairs.map((entry) => entry.poolHashrateMhs)) / sum(pairs.map((entry) => entry.nominalHashrateMhs))) * 100
}

// Pool share of nominal over the WHOLE invoice period: every bucket with a positive
// nominal counts in the denominator and a bucket without pool data counts as zero
// delivered. The invoice bills the calendar month, so hours the pool did not report
// (site not mining yet, pool outage) lower the percentage instead of being dropped -
// dropping them switched the denominator to "hours with pool data" and overstated a
// mid-month start by the coverage ratio (August 2026: 78.9% instead of 52.5%,
// inflating amortizationPayableUsd and monthlyInvoiceUsd). Null when the pool never
// reported in the period, so a missing feed is not misread as zero production.
// Mirrors moria-app-ui invoicePeriodPoolPctOfNominal (PR 3061).
function invoicePeriodPoolPctOfNominal (entries) {
  const nominalBuckets = entries.filter((entry) => entry.nominalHashrateMhs > 0)
  const poolEverReported = nominalBuckets.some((entry) => Number.isFinite(entry.poolHashrateMhs))
  if (!poolEverReported) return null

  const pool = sum(nominalBuckets.map((entry) => Number.isFinite(entry.poolHashrateMhs) ? entry.poolHashrateMhs : 0))
  return (pool / sum(nominalBuckets.map((entry) => entry.nominalHashrateMhs))) * 100
}

// Groups hourly buckets by the label `periodOf` gives them and aggregates each
// group the way the invoicing rows need it. `poolSeconds` counts only the hours
// that carried a pool sample, so a polling gap understates the period's delivered
// hashes rather than reading as lost hashrate - the export marks that, it does not
// silently fill it in.
function rollupLocalPeriods (log, periodOf) {
  const periods = new Map()

  for (const entry of log) {
    const key = periodOf.format(new Date(entry.ts))
    if (!periods.has(key)) periods.set(key, [])
    periods.get(key).push(entry)
  }

  return [...periods.values()].map((entries) => {
    const pool = finiteValues(entries, 'poolHashrateMhs')

    return {
      ts: entries[0].ts,
      hashrateMhs: mean(finiteValues(entries, 'hashrateMhs')),
      // The period's installed capacity, for callers that summarise a run of periods.
      // `pctOfNominal` is NOT this over hashrateMhs - it stays on the pool basis below,
      // which pairs the two series hour by hour and can only be computed here.
      nominalHashrateMhs: mean(finiteValues(entries, 'nominalHashrateMhs')),
      poolHashrateMhs: mean(pool),
      pctOfNominal: poolPctOfNominal(entries),
      poolSeconds: pool.length * 3600,
      // How many hours the site reported at all, against which poolSeconds says how
      // many carried a pool sample - the UI marks a period where the two disagree.
      reportedHours: entries.length
    }
  })
}

function localMonthKey (ts, timeZone) {
  const zone = requireZone(timeZone, 'localMonthKey')
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit' })
    .format(new Date(ts))
  return parts.slice(0, 7)
}

/**
 * Every calendar month in `timeZone` that [start, end] touches, chronologically, each
 * with its own bounds. The store has no calendar-month bucket (groupRange '1M' is a
 * rolling 30 days), so callers that need months build them from these.
 */
function localMonthsInRange (start, end, timeZone) {
  const months = []
  let [year, month] = localMonthKey(start, timeZone).split('-').map(Number)

  for (;;) {
    const monthStart = localMonthStartTs(year, month, timeZone)
    if (monthStart > end) return months

    const next = month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }
    months.push({
      key: `${year}-${String(month).padStart(2, '0')}`,
      start: monthStart,
      end: localMonthStartTs(next.year, next.month, timeZone) - 1
    })
    ;({ year, month } = next)
  }
}

function rollupLocalDays (log, timezone) {
  return rollupLocalPeriods(log, new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit'
  }))
}

// The backend has no calendar-month bucket (groupRange '1M' is a rolling 30 days),
// so a site-local month is rebuilt from its hourly buckets the same way a local day is.
function rollupLocalMonths (log, timezone) {
  return rollupLocalPeriods(log, new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit'
  }))
}

// First instant of the local month (in `timezone`) containing `ts`.
function localMonthStart (ts, timezone) {
  const [year, month] = localMonthKey(ts, timezone).split('-').map(Number)
  return localMonthStartTs(year, month, timezone)
}

// The day/week/month intervals the metrics endpoints cut in the site's zone. The store's
// groupRange buckets on the UTC epoch grid ('1W' even starts on a Thursday), so these are
// rebuilt app-side from hourly buckets - see groupLocalBuckets.
const LOCAL_BUCKET_STARTS = {
  '1d': localDayStart,
  '1w': localWeekStart,
  '1M': localMonthStart
}

// Stepping past the bucket's start by more than the longest local day/week/month and
// re-deriving the start keeps the next boundary right across a DST shift.
const LOCAL_BUCKET_STEPS_MS = {
  '1d': 1.5 * METRICS_TIME.ONE_DAY_MS,
  '1w': 7.5 * METRICS_TIME.ONE_DAY_MS,
  '1M': 32 * METRICS_TIME.ONE_DAY_MS
}

function isLocalInterval (interval) {
  return Object.hasOwn(LOCAL_BUCKET_STARTS, interval)
}

/**
 * Groups hourly entries into `interval` buckets in `timezone` ('1d', '1w' or '1M'). Each
 * bucket's ts/timeRange are clamped to [start, end], so a response never reaches outside
 * the requested range: the first entry starts at `start` and the last ends at `end`.
 * Returns { ts, timeRange, entries }; callers aggregate `entries` their own way.
 */
function groupLocalBuckets (log, { interval, timezone, start, end }) {
  const bucketStartOf = LOCAL_BUCKET_STARTS[interval]
  const zone = requireZone(timezone, 'groupLocalBuckets')
  const buckets = new Map()

  for (const entry of log) {
    if (!Number.isFinite(entry?.ts)) continue
    const bucketStart = bucketStartOf(entry.ts, zone)
    if (!buckets.has(bucketStart)) buckets.set(bucketStart, [])
    buckets.get(bucketStart).push(entry)
  }

  return [...buckets.entries()]
    .sort(([a], [b]) => a - b)
    .map(([bucketStart, entries]) => {
      const bucketEnd = bucketStartOf(bucketStart + LOCAL_BUCKET_STEPS_MS[interval], zone) - 1
      const startTs = Math.max(start, bucketStart)
      const endTs = Math.min(end, bucketEnd)
      return { ts: startTs, timeRange: { startTs, endTs }, entries }
    })
}

module.exports = {
  parseEntryTs,
  parseEntryTimeRange,
  validateStartEnd,
  assertTimezone,
  resolveTimezone,
  resolveStartEnd,
  resolveOptionalTimeMs,
  iterateRpcEntries,
  forEachRangeAggrItem,
  sumObjectValues,
  extractContainerFromMinerKey,
  extractKeyEntry,
  resolveInterval,
  getIntervalConfig,
  zoneOffsetMs,
  rollupLocalDays,
  rollupLocalMonths,
  isLocalInterval,
  groupLocalBuckets,
  localMonthStart,
  localMonthsInRange,
  localMonthStartTs,
  localMonthKey,
  poolPctOfNominal,
  invoicePeriodPoolPctOfNominal,
  mhsToPhs,
  mhsToThs,
  parseRackId,
  getGroupNumber,
  rackSlotKey,
  rackKeysByGroupOrdinal,
  rackFilterFor,
  mergeGroupedField,
  getMeterGroupMapping,
  buildGroupPowerFromDCS
}
