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

module.exports = { renderWorkOrderCsv }
