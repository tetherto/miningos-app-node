'use strict'

const test = require('brittle')
const {
  captureSnapshot,
  getSnapshotDates,
  getSnapshots,
  localDateHour,
  storeDailySnapshot
} = require('../../../workers/lib/server/lib/heatmap')

const THING = {
  id: 'm1',
  code: 'WM-M63SPP-0001',
  tags: ['t-miner'],
  type: 'miner-wm-m63spp',
  address: '10.0.0.1',
  info: { site: 'Ivinhema', container: 'group-1', pos: '1-1_1' },
  last: { snap: { stats: { status: 'mining', hashrate_mhs: { t_5m: 485000 }, temperature_c: { max: 69.2 } } } }
}

function makeCtx (things = [THING], timezone = 'UTC') {
  const store = new Map()
  const calls = []
  return {
    calls,
    store,
    conf: { timezone },
    globalDataBee: {
      sub: () => ({
        get: async (key) => (store.has(key) ? { value: store.get(key) } : null),
        put: async (key, value) => { store.set(key, value) }
      })
    },
    dataProxy: {
      requestDataMap: async (method, params) => {
        calls.push(params)
        return params.offset === 0 ? [things] : [[]]
      }
    }
  }
}

test('localDateHour - resolves date and hour in the site timezone', (t) => {
  const at = new Date('2026-09-04T02:00:00.000Z')

  t.alike(localDateHour(at, 'UTC'), { date: '2026-09-04', hour: 2 })
  t.alike(localDateHour(at, 'America/Campo_Grande'), { date: '2026-09-03', hour: 22 })
})

test('localDateHour - reports midnight as hour 0', (t) => {
  t.alike(localDateHour(new Date('2026-09-04T00:30:00.000Z'), 'UTC'), { date: '2026-09-04', hour: 0 })
})

test('captureSnapshot - returns the miner-stats export shape', async (t) => {
  const ctx = makeCtx()
  const snapshot = await captureSnapshot(ctx, new Date('2026-09-04T15:00:00.000Z'))

  t.is(snapshot.date, '2026-09-04')
  t.is(snapshot.dateExported, '2026-09-04T15:00:00.000Z')
  t.is(snapshot.miners.length, 1)
  t.is(snapshot.miners[0].id, 'm1')
  t.is(snapshot.miners[0].position, '1-1_1')
  t.is(snapshot.miners[0].status, 'mining')
  t.alike(snapshot.miners[0].temperatureC, { max: 69.2 })
})

test('storeDailySnapshot - skips before the snapshot hour', async (t) => {
  const ctx = makeCtx()
  const stored = await storeDailySnapshot(ctx, new Date('2026-09-04T09:00:00.000Z'))

  t.is(stored, null)
  t.is(ctx.store.size, 0)
})

test('storeDailySnapshot - stores one snapshot per site day and indexes it', async (t) => {
  const ctx = makeCtx()

  t.is(await storeDailySnapshot(ctx, new Date('2026-09-04T12:30:00.000Z')), '2026-09-04')
  t.alike(await getSnapshotDates(ctx), ['2026-09-04'])

  const callCount = ctx.calls.length
  t.is(await storeDailySnapshot(ctx, new Date('2026-09-04T18:00:00.000Z')), null)
  t.is(ctx.calls.length, callCount, 'stored day is not fetched again')

  t.is(await storeDailySnapshot(ctx, new Date('2026-09-05T12:00:00.000Z')), '2026-09-05')
  t.alike(await getSnapshotDates(ctx), ['2026-09-04', '2026-09-05'])
})

test('storeDailySnapshot - stores nothing when no miners are returned', async (t) => {
  const ctx = makeCtx([])

  t.is(await storeDailySnapshot(ctx, new Date('2026-09-04T12:00:00.000Z')), null)
  t.is(ctx.store.size, 0)
})

test('getSnapshots - returns stored days and skips missing ones', async (t) => {
  const ctx = makeCtx()
  await storeDailySnapshot(ctx, new Date('2026-09-04T12:00:00.000Z'))

  const snapshots = await getSnapshots(ctx, ['2026-09-03', '2026-09-04'])
  t.is(snapshots.length, 1)
  t.is(snapshots[0].date, '2026-09-04')
})

test('getSnapshotDates - empty before the first snapshot', async (t) => {
  t.alike(await getSnapshotDates(makeCtx()), [])
})
