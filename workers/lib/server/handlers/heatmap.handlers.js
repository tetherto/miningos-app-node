'use strict'

const { HEATMAP_MAX_DATES, HEATMAP_DATE_REGEX } = require('../../constants')
const { captureSnapshot, getSnapshotDates, getSnapshots } = require('../lib/heatmap')

function parseDates (raw) {
  if (!raw) return []

  const dates = raw.split(',').map((date) => date.trim()).filter(Boolean)
  if (dates.length > HEATMAP_MAX_DATES) throw new Error('ERR_HEATMAP_TOO_MANY_DATES')
  if (dates.some((date) => !HEATMAP_DATE_REGEX.test(date))) throw new Error('ERR_HEATMAP_DATE_INVALID')

  return dates
}

async function getHeatmap (ctx, req) {
  const dates = parseDates(req.query.dates)
  const snapshots = dates.length
    ? await getSnapshots(ctx, dates)
    : [await captureSnapshot(ctx)]

  return { snapshots }
}

async function getHeatmapDates (ctx) {
  return { dates: await getSnapshotDates(ctx) }
}

module.exports = {
  getHeatmap,
  getHeatmapDates,
  parseDates
}
