'use strict'

const test = require('brittle')
const {
  buildLayoutView,
  buildMinersView
} = require('../../../workers/lib/server/handlers/energy.system.handlers')

const siteMeter = () => ({
  equipment: 'PM-MV',
  role: 'site_main',
  name: 'Site PM',
  power: { value: 8412, unit: 'kW' },
  current: {
    l1: { value: 100, unit: 'A' },
    l2: { value: 110, unit: 'A' },
    l3: { value: 120, unit: 'A' },
    total: { value: 330, unit: 'A' }
  }
})

test('BE-8 - energy layout site_pm exposes current.total from BE', (t) => {
  const equipment = { power_meters: [siteMeter()], protection_relays: [], transformers: [], distribution_boards: [] }
  const config = { energy_layout: {} }
  const view = buildLayoutView(equipment, config, {})

  t.ok(view.site_pm, 'has site_pm')
  t.ok(view.site_pm.current, 'site_pm has current')
  t.is(view.site_pm.current.total.value, 330, 'current.total comes from BE')
  t.is(view.site_pm.current.total.unit, 'A', 'current.total has unit')
  t.pass()
})

test('BE-8 - miners view site_total resolves from site_main meter', (t) => {
  const equipment = { power_meters: [siteMeter()] }
  const view = buildMinersView(equipment, {}, {})

  t.ok(view.site_total, 'has site_total')
  t.pass()
})
