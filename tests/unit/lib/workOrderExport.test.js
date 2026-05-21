'use strict'

const test = require('brittle')
const { renderWorkOrderCsv } = require('../../../workers/lib/server/lib/workOrderExport')

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

test('workOrderExport: CSV header is derived from the work order json property names', (t) => {
  const header = renderWorkOrderCsv(WO).split('\r\n')[0].split(',')
  const woKeys = ['code', ...Object.keys(WO.info).filter(k => k !== 'partsMoves')]
  const moveKeys = Object.keys(WO.info.partsMoves[0])
  t.alike(header, [...woKeys, ...moveKeys], 'header is code + info fields + movement fields, not a hardcoded list')
})

test('workOrderExport: a new info field appears as a column without code changes', (t) => {
  const wo = { ...WO, info: { ...WO.info, slaBreached: true } }
  const header = renderWorkOrderCsv(wo).split('\r\n')[0].split(',')
  t.ok(header.includes('slaBreached'), 'newly added json field is picked up dynamically')
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
