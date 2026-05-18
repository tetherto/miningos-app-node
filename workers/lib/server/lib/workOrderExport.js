'use strict'

const CSV_HEADERS = [
  'code', 'status', 'type', 'deviceType', 'deviceModel', 'deviceIdentifier',
  'issue', 'assignedTo', 'createdBy', 'createdAt', 'finalResult',
  'warrantyVendor', 'warrantyFields',
  'moveTs', 'moveUser', 'moveRole', 'partId', 'partCode',
  'fromLocation', 'toLocation', 'fromStatus', 'toStatus'
]

function _csvEscape (v) {
  if (v === null || v === undefined) return ''
  const s = typeof v === 'string' ? v : JSON.stringify(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

function _woHeaderRow (wo) {
  const info = wo.info || {}
  const warranty = info.warranty || {}
  return [
    wo.code, info.status, info.type, info.deviceType, info.deviceModel, info.deviceIdentifier,
    info.issue, info.assignedTo, info.createdBy, info.createdAt, info.finalResult,
    warranty.vendor, warranty.fields ? JSON.stringify(warranty.fields) : null
  ]
}

function renderWorkOrderCsv (wo) {
  const lines = [CSV_HEADERS.join(',')]
  const header = _woHeaderRow(wo)
  const moves = wo.info?.partsMoves || []
  if (!moves.length) {
    lines.push([...header, '', '', '', '', '', '', '', '', ''].map(_csvEscape).join(','))
  } else {
    for (const m of moves) {
      const row = [
        ...header,
        m.ts, m.user, m.role, m.partId, m.partCode,
        m.fromLocation, m.toLocation, m.fromStatus, m.toStatus
      ]
      lines.push(row.map(_csvEscape).join(','))
    }
  }
  return lines.join('\r\n') + '\r\n'
}

module.exports = { renderWorkOrderCsv, CSV_HEADERS }
