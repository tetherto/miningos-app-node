'use strict'

const test = require('brittle')
const { renderWorkOrderCsv, CSV_HEADERS } = require('../../../workers/lib/server/lib/workOrderExport')

const WO = {
  id: 'wo-1',
  code: 'IVI-2-0001',
  info: {
    type: 2,
    status: 'open',
    deviceType: 'psu',
    deviceModel: 'PSU-WM-CB6_V5',
    deviceIdentifier: 'SN-1',
    issue: 'PSU fan dead',
    assignedTo: 'tech@test',
    createdBy: 'op@test',
    createdAt: 1700000000000,
    finalResult: null,
    warranty: { vendor: 'microbt', fields: { rmaNumber: 'RMA-9', faultCode: 'E03' } },
    partsMoves: [
      { ts: 1700000001000, user: 'op@test', role: 'diagnosis', partId: 'p1', partCode: 'PS-1', fromLocation: 'Lab', toLocation: 'Field', fromStatus: 'active', toStatus: 'active' },
      { ts: 1700000002000, user: 'op@test', role: 'replacement', partId: 'p1', partCode: 'PS-1', fromLocation: 'Field', toLocation: 'Lab', fromStatus: 'active', toStatus: 'in_repair' }
    ]
  }
}

test('workOrderExport: CSV header is the documented column set', (t) => {
  const csv = renderWorkOrderCsv(WO)
  t.is(csv.split('\r\n')[0], CSV_HEADERS.join(','))
})

test('workOrderExport: CSV emits one row per parts-movement entry', (t) => {
  const csv = renderWorkOrderCsv(WO)
  const lines = csv.trim().split('\r\n')
  t.is(lines.length, 1 + WO.info.partsMoves.length, 'header + one row per move')
  t.ok(lines[1].includes('IVI-2-0001'), 'wo code repeated on each row')
  t.ok(lines[1].includes('diagnosis'))
  t.ok(lines[2].includes('replacement'))
})

test('workOrderExport: CSV with no movements still emits a single data row', (t) => {
  const empty = { ...WO, info: { ...WO.info, partsMoves: [] } }
  const csv = renderWorkOrderCsv(empty)
  const lines = csv.trim().split('\r\n')
  t.is(lines.length, 2)
  t.ok(lines[1].startsWith('IVI-2-0001'))
})

test('workOrderExport: CSV escapes commas / quotes / newlines in field values', (t) => {
  const wo = { ...WO, info: { ...WO.info, issue: 'fan, broken\nreplaced' } }
  const csv = renderWorkOrderCsv(wo)
  t.ok(csv.includes('"fan, broken\nreplaced"'), 'value with comma/newline wrapped in quotes')
})
