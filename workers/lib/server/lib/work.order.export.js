'use strict'

const { csvEscape } = require('../../utils')

function renderWorkOrderCsv (wo) {
  const { partsMoves, ...woFields } = wo.info || {}
  const base = { code: wo.code, ...woFields }
  const moves = Array.isArray(partsMoves) ? partsMoves : []
  const rows = moves.length ? moves.map(move => ({ ...base, ...move })) : [base]

  const headers = []
  const seen = new Set()
  for (const row of rows) {
    for (const key of Object.keys(row)) {
      if (seen.has(key)) continue
      seen.add(key)
      headers.push(key)
    }
  }

  const lines = [headers.map(csvEscape).join(',')]
  for (const row of rows) {
    lines.push(headers.map(h => csvEscape(row[h])).join(','))
  }
  return lines.join('\r\n') + '\r\n'
}

const RMA_COLUMNS = [
  'Ticket',
  'Repaired type',
  'Repaired Miner Sn',
  'Repaired Mac/HB SN/PSU SN',
  'Replaced Mac/HB SN/PSU SN',
  'Repaired Analyze',
  'Repaired Treatment',
  'Remark',
  'Miner Model',
  'Repair Date',
  'Engineer'
]

function _rmaDate (ts) {
  return ts ? new Date(ts).toISOString().slice(0, 10) : ''
}

// Renders the fixed RMA columns for a set of MicroBT Miner WOs. Repaired and
// replacement part identifiers come from partsMoves roles, falling back to the
// diagnosed part when no explicit replacement was recorded.
function renderRmaCsv (workOrders) {
  const rows = workOrders.map((wo) => {
    const info = wo.info || {}
    const moves = Array.isArray(info.partsMoves) ? info.partsMoves : []
    const repaired = moves.find(m => m.role === 'repaired') || moves.find(m => m.role === 'diagnosis') || moves[0] || {}
    const replaced = moves.find(m => m.role === 'replacement') || repaired
    return [
      wo.code,
      info.deviceModel,
      info.deviceIdentifier,
      repaired.partCode,
      replaced.partCode,
      info.issue,
      info.finalResult,
      info.remarks,
      info.deviceModel,
      _rmaDate(info.closedAt ?? info.createdAt),
      info.assignedTo ?? info.createdBy
    ]
  })

  const lines = [RMA_COLUMNS, ...rows].map(row => row.map(csvEscape).join(','))
  return lines.join('\r\n') + '\r\n'
}

module.exports = { renderWorkOrderCsv, renderRmaCsv }
