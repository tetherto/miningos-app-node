'use strict'

const minerStats = require('./export/types/minerStats.export')
const { DEFAULT_TIMEZONE } = require('./export/mappers')
const {
  HEATMAP_SNAPSHOT_SUB,
  HEATMAP_SNAPSHOT_INDEX_KEY,
  HEATMAP_SNAPSHOT_HOUR
} = require('../../constants')

function localDateHour (date, timezone) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).reduce((acc, part) => ({ ...acc, [part.type]: part.value }), {})

  return { date: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) }
}

function snapshotBee (ctx) {
  return ctx.globalDataBee.sub(HEATMAP_SNAPSHOT_SUB)
}

async function captureSnapshot (ctx, now = new Date()) {
  const { rows, jsonMeta } = await minerStats.fetchExport(ctx, { now })
  const miners = []
  for await (const miner of rows) miners.push(miner)

  return {
    date: localDateHour(now, ctx.conf.timezone || DEFAULT_TIMEZONE).date,
    ...jsonMeta,
    miners
  }
}

async function getSnapshotDates (ctx) {
  const res = await snapshotBee(ctx).get(HEATMAP_SNAPSHOT_INDEX_KEY)
  return res?.value?.dates || []
}

async function getSnapshots (ctx, dates) {
  const bee = snapshotBee(ctx)
  const snapshots = []
  for (const date of dates) {
    const res = await bee.get(date)
    if (res?.value) snapshots.push(res.value)
  }
  return snapshots
}

async function storeDailySnapshot (ctx, now = new Date()) {
  const { date, hour } = localDateHour(now, ctx.conf.timezone || DEFAULT_TIMEZONE)
  if (hour < HEATMAP_SNAPSHOT_HOUR) return null

  const bee = snapshotBee(ctx)
  if (await bee.get(date)) return null

  const snapshot = await captureSnapshot(ctx, now)
  if (!snapshot.miners.length) return null

  await bee.put(date, snapshot)

  const dates = await getSnapshotDates(ctx)
  await bee.put(HEATMAP_SNAPSHOT_INDEX_KEY, { dates: [...dates, date].sort() })

  return date
}

module.exports = {
  captureSnapshot,
  getSnapshotDates,
  getSnapshots,
  localDateHour,
  storeDailySnapshot
}
