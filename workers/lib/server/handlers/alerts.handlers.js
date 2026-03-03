'use strict'

const { requestRpcMapLimit, parseJsonQueryParam } = require('../../utils')

const SITE_ALERTS_FILTER_FIELDS = ['severity', 'type', 'container', 'deviceId']
const SITE_ALERTS_SEARCH_FIELDS = ['id', 'code', 'container']

const HISTORY_FILTER_FIELDS = ['severity', 'code', 'deviceType', 'container', 'deviceId', 'tags']
const HISTORY_SEARCH_FIELDS = ['name', 'description', 'position', 'code']

const DEFAULT_LIMIT = 100
const MAX_SITE_LIMIT = 200
const MAX_HISTORY_LIMIT = 1000

function extractAlertsFromThings (things) {
  const alerts = []
  for (const thing of things) {
    if (Array.isArray(thing?.last?.alerts)) {
      for (const alert of thing.last.alerts) {
        if (alert && typeof alert === 'object' && !Array.isArray(alert)) {
          alerts.push({
            ...alert,
            id: thing.id,
            type: thing.type,
            code: thing.code,
            container: thing.info?.container
          })
        }
      }
    }
  }
  return alerts
}

function matchesFilter (item, filter, allowedFields) {
  if (!filter) return true
  for (const key of allowedFields) {
    if (filter[key] === undefined) continue
    const filterVal = filter[key]
    const itemVal = item[key]
    if (Array.isArray(filterVal)) {
      if (!filterVal.includes(itemVal)) return false
    } else if (itemVal !== filterVal) {
      return false
    }
  }
  return true
}

function matchesSearch (item, search, fields) {
  if (!search) return true
  const lowerSearch = search.toLowerCase()
  for (const field of fields) {
    const val = item[field]
    if (val != null && String(val).toLowerCase().includes(lowerSearch)) {
      return true
    }
  }
  return false
}

function applySort (items, sort) {
  if (!sort) return items
  const entries = Object.entries(sort)
  if (!entries.length) return items

  return items.slice().sort((a, b) => {
    for (const [field, dir] of entries) {
      const aVal = a[field]
      const bVal = b[field]
      if (aVal < bVal) return dir === 1 ? -1 : 1
      if (aVal > bVal) return dir === 1 ? 1 : -1
    }
    return 0
  })
}

function buildSeveritySummary (alerts) {
  const summary = { critical: 0, high: 0, medium: 0, low: 0, total: alerts.length }
  for (const alert of alerts) {
    const sev = alert.severity
    if (sev && summary[sev] !== undefined) {
      summary[sev]++
    }
  }
  return summary
}

function flattenHistoryAlert (alert) {
  const thing = alert.thing || {}
  const { thing: _, ...rest } = alert
  return {
    ...rest,
    deviceId: thing.id,
    deviceType: thing.type,
    code: thing.code,
    container: thing.info?.container,
    position: thing.info?.pos,
    tags: thing.tags
  }
}

function deduplicateAlerts (alerts) {
  const seen = new Map()
  for (const alert of alerts) {
    if (alert.uuid && !seen.has(alert.uuid)) {
      seen.set(alert.uuid, alert)
    } else if (!alert.uuid) {
      seen.set(Symbol('no-uuid'), alert)
    }
  }
  return Array.from(seen.values())
}

async function getSiteAlerts (ctx, req) {
  const filter = parseJsonQueryParam(req.query.filter, 'ERR_INVALID_FILTER')
  const sort = parseJsonQueryParam(req.query.sort, 'ERR_INVALID_SORT')
  const search = req.query.search || ''
  const offset = Number(req.query.offset) || 0
  const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_SITE_LIMIT)

  const results = await requestRpcMapLimit(ctx, 'listThings', {
    status: 1,
    query: { 'last.alerts': { $ne: null } },
    fields: {
      'last.alerts': 1,
      'info.container': 1,
      type: 1,
      id: 1,
      code: 1
    }
  })

  const things = results.flat()
  let alerts = extractAlertsFromThings(things)

  alerts = alerts.filter(a =>
    matchesFilter(a, filter, SITE_ALERTS_FILTER_FIELDS) &&
    matchesSearch(a, search, SITE_ALERTS_SEARCH_FIELDS)
  )

  const summary = buildSeveritySummary(alerts)
  alerts = applySort(alerts, sort)
  const total = alerts.length
  alerts = alerts.slice(offset, offset + limit)

  return { alerts, summary, total }
}

async function getAlertsHistory (ctx, req) {
  const start = Number(req.query.start)
  const end = Number(req.query.end)
  const logType = req.query.logType

  if (start >= end) {
    throw new Error('ERR_INVALID_DATE_RANGE')
  }

  const filter = parseJsonQueryParam(req.query.filter, 'ERR_INVALID_FILTER')
  const sort = parseJsonQueryParam(req.query.sort, 'ERR_INVALID_SORT') || { createdAt: -1 }
  const search = req.query.search || ''
  const offset = Number(req.query.offset) || 0
  const limit = Math.min(Number(req.query.limit) || DEFAULT_LIMIT, MAX_HISTORY_LIMIT)

  const results = await requestRpcMapLimit(ctx, 'getHistoricalLogs', {
    start,
    end,
    logType
  })

  let alerts = results.flat().map(flattenHistoryAlert)
  alerts = deduplicateAlerts(alerts)

  alerts = alerts.filter(a =>
    matchesFilter(a, filter, HISTORY_FILTER_FIELDS) &&
    matchesSearch(a, search, HISTORY_SEARCH_FIELDS)
  )

  alerts = applySort(alerts, sort)
  const total = alerts.length
  alerts = alerts.slice(offset, offset + limit)

  return { alerts, total }
}

module.exports = {
  getSiteAlerts,
  getAlertsHistory,
  extractAlertsFromThings,
  matchesFilter,
  matchesSearch,
  applySort,
  buildSeveritySummary,
  deduplicateAlerts,
  flattenHistoryAlert
}
