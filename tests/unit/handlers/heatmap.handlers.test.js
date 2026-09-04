'use strict'

const test = require('brittle')
const { getHeatmap, getHeatmapDates, parseDates } = require('../../../workers/lib/server/handlers/heatmap.handlers')

const THING = {
  id: 'm1',
  tags: ['t-miner'],
  info: { pos: '1-1_1' },
  last: { snap: { stats: { status: 'mining' } } }
}

function makeCtx (stored = {}) {
  return {
    conf: { timezone: 'UTC' },
    globalDataBee: {
      sub: () => ({
        get: async (key) => (key in stored ? { value: stored[key] } : null),
        put: async () => {}
      })
    },
    dataProxy: {
      requestDataMap: async (method, params) => (params.offset === 0 ? [[THING]] : [[]])
    }
  }
}

test('parseDates - accepts up to ten valid dates', (t) => {
  t.alike(parseDates(''), [])
  t.alike(parseDates('2026-09-04, 2026-09-05'), ['2026-09-04', '2026-09-05'])
  t.exception(() => parseDates('04-09-2026'), /ERR_HEATMAP_DATE_INVALID/)
  t.exception(() => parseDates(Array(11).fill('2026-09-04').join(',')), /ERR_HEATMAP_TOO_MANY_DATES/)
})

test('getHeatmap - returns the live snapshot when no dates are given', async (t) => {
  const res = await getHeatmap(makeCtx(), { query: {} })

  t.is(res.snapshots.length, 1)
  t.is(res.snapshots[0].miners.length, 1)
  t.ok(res.snapshots[0].dateExported)
})

test('getHeatmap - returns the stored snapshots for the requested dates', async (t) => {
  const ctx = makeCtx({ '2026-09-04': { date: '2026-09-04', dateExported: 'x', miners: [] } })
  const res = await getHeatmap(ctx, { query: { dates: '2026-09-04,2026-09-03' } })

  t.is(res.snapshots.length, 1)
  t.is(res.snapshots[0].date, '2026-09-04')
})

test('getHeatmapDates - lists the stored snapshot dates', async (t) => {
  const ctx = makeCtx({ index: { dates: ['2026-09-04'] } })

  t.alike(await getHeatmapDates(ctx), { dates: ['2026-09-04'] })
})
