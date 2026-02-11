'use strict'

const { PERIOD_TYPES, NON_METRIC_KEYS } = require('./constants')

const getStartOfDay = (ts) => Math.floor(ts / 86400000) * 86400000

const PERIOD_CALCULATORS = {
  daily: (timestamp) => getStartOfDay(timestamp),
  monthly: (timestamp) => {
    const date = new Date(timestamp)
    return new Date(date.getFullYear(), date.getMonth(), 1).getTime()
  },
  yearly: (timestamp) => {
    const date = new Date(timestamp)
    return new Date(date.getFullYear(), 0, 1).getTime()
  }
}

const aggregateByPeriod = (log, period, nonMetricKeys = []) => {
  if (period === PERIOD_TYPES.DAILY) {
    return log
  }

  const allNonMetricKeys = new Set([...NON_METRIC_KEYS, ...nonMetricKeys])

  const grouped = log.reduce((acc, entry) => {
    let date
    try {
      date = new Date(Number(entry.ts))
      if (isNaN(date.getTime())) {
        return acc
      }
    } catch (error) {
      return acc
    }

    let groupKey
    if (period === PERIOD_TYPES.MONTHLY) {
      groupKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`
    } else if (period === PERIOD_TYPES.YEARLY) {
      groupKey = `${date.getFullYear()}`
    } else {
      groupKey = `${entry.ts}`
    }

    if (!acc[groupKey]) {
      acc[groupKey] = []
    }
    acc[groupKey].push(entry)
    return acc
  }, {})

  const aggregatedResults = Object.entries(grouped).map(([groupKey, entries]) => {
    const aggregated = entries.reduce((acc, entry) => {
      Object.entries(entry).forEach(([key, val]) => {
        if (allNonMetricKeys.has(key)) {
          if (!acc[key] || acc[key] === null || acc[key] === undefined) {
            acc[key] = val
          }
        } else {
          const numVal = Number(val) || 0
          acc[key] = (acc[key] || 0) + numVal
        }
      })
      return acc
    }, {})

    if (period === PERIOD_TYPES.MONTHLY) {
      const [year, month] = groupKey.split('-').map(Number)
      const newDate = new Date(year, month - 1, 1)
      aggregated.ts = newDate.getTime()
      aggregated.month = month
      aggregated.year = year
      aggregated.monthName = newDate.toLocaleString('en-US', { month: 'long' })
    } else if (period === PERIOD_TYPES.YEARLY) {
      const year = parseInt(groupKey)
      const newDate = new Date(year, 0, 1)
      aggregated.ts = newDate.getTime()
      aggregated.year = year
    }

    return aggregated
  })

  return aggregatedResults.sort((a, b) => Number(a.ts) - Number(b.ts))
}

const getPeriodKey = (timestamp, period) => {
  const calculator = PERIOD_CALCULATORS[period] || PERIOD_CALCULATORS.daily
  return calculator(timestamp)
}

const isTimestampInPeriod = (timestamp, periodTs, period) => {
  if (period === PERIOD_TYPES.DAILY) return timestamp === periodTs

  const periodEnd = new Date(periodTs)
  if (period === PERIOD_TYPES.MONTHLY) {
    periodEnd.setMonth(periodEnd.getMonth() + 1)
  } else if (period === PERIOD_TYPES.YEARLY) {
    periodEnd.setFullYear(periodEnd.getFullYear() + 1)
  }

  return timestamp >= periodTs && timestamp < periodEnd.getTime()
}

const getFilteredPeriodData = (sourceData, periodTs, period, filterFn) => {
  if (period === PERIOD_TYPES.DAILY) {
    return sourceData[periodTs] || null
  }

  const entriesInPeriod = Object.entries(sourceData).filter(([tsStr]) => {
    const timestamp = Number(tsStr)
    return isTimestampInPeriod(timestamp, periodTs, period)
  })

  return filterFn(entriesInPeriod, sourceData)
}

module.exports = {
  getStartOfDay,
  aggregateByPeriod,
  getPeriodKey,
  isTimestampInPeriod,
  getFilteredPeriodData
}
