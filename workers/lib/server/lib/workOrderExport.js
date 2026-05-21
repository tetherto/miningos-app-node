'use strict'

// Single source for the CSV schema: each column is a [name, extractor] pair,
// so the header row and the data rows are derived from one definition rather
// than two hand-kept-in-sync lists. WO-level columns repeat on every row;
// move-level columns come from each partsMoves entry.
const WO_COLUMNS = [
  ['code', (wo) => wo.code],
  ['status', (wo) => wo.info?.status],
  ['type', (wo) => wo.info?.type],
  ['deviceType', (wo) => wo.info?.deviceType],
  ['deviceModel', (wo) => wo.info?.deviceModel],
  ['deviceIdentifier', (wo) => wo.info?.deviceIdentifier],
  ['issue', (wo) => wo.info?.issue],
  ['assignedTo', (wo) => wo.info?.assignedTo],
  ['createdBy', (wo) => wo.info?.createdBy],
  ['createdAt', (wo) => wo.info?.createdAt],
  ['finalResult', (wo) => wo.info?.finalResult],
  ['warrantyVendor', (wo) => wo.info?.warranty?.vendor],
  ['warrantyFields', (wo) => {
    const f = wo.info?.warranty?.fields
    return f ? JSON.stringify(f) : null
  }]
]

const MOVE_COLUMNS = [
  ['moveTs', (m) => m.ts],
  ['moveUser', (m) => m.user],
  ['moveRole', (m) => m.role],
  ['partId', (m) => m.partId],
  ['partCode', (m) => m.partCode],
  ['fromLocation', (m) => m.fromLocation],
  ['toLocation', (m) => m.toLocation],
  ['fromStatus', (m) => m.fromStatus],
  ['toStatus', (m) => m.toStatus]
]

const CSV_HEADERS = [...WO_COLUMNS, ...MOVE_COLUMNS].map(([name]) => name)

function _csvEscape (v) {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function renderWorkOrderCsv (wo) {
  const lines = [CSV_HEADERS.join(',')]
  const woCells = WO_COLUMNS.map(([, get]) => get(wo))
  const moves = wo.info?.partsMoves || []
  if (!moves.length) {
    const blanks = MOVE_COLUMNS.map(() => '')
    lines.push([...woCells, ...blanks].map(_csvEscape).join(','))
  } else {
    for (const m of moves) {
      const moveCells = MOVE_COLUMNS.map(([, get]) => get(m))
      lines.push([...woCells, ...moveCells].map(_csvEscape).join(','))
    }
  }
  return lines.join('\r\n') + '\r\n'
}

module.exports = { renderWorkOrderCsv, CSV_HEADERS }
