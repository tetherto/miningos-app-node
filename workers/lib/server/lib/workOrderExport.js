'use strict'

const PDFDocument = require('pdfkit')

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

function _fmtTs (ts) {
  if (!ts) return '—'
  return new Date(ts).toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
}

function renderWorkOrderPdf (wo, opts = {}) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 })
    const chunks = []
    doc.on('data', (c) => chunks.push(c))
    doc.on('end', () => resolve(Buffer.concat(chunks)))
    doc.on('error', reject)

    const info = wo.info || {}
    const fileBaseUrl = opts.fileBaseUrl || ''

    doc.fontSize(18).text(`Work Order ${wo.code || wo.id}`, { underline: false })
    doc.moveDown(0.3)
    doc.fontSize(10).fillColor('#555')
      .text(`Status: ${info.status || '—'}    Type: ${info.type ?? '—'}    Assigned: ${info.assignedTo || '—'}`)
    doc.text(`Created: ${_fmtTs(info.createdAt)} by ${info.createdBy || '—'}`)
    doc.fillColor('black').moveDown()

    doc.fontSize(13).text('Triage', { underline: true })
    doc.fontSize(10).moveDown(0.3)
    doc.text(`Device: ${info.deviceType || '—'} ${info.deviceModel || ''} (${info.deviceIdentifier || '—'})`)
    if (info.issue) doc.text(`Issue: ${info.issue}`)
    if (info.finalResult) doc.text(`Final result: ${info.finalResult}`)
    doc.moveDown()

    doc.fontSize(13).text('Work log', { underline: true })
    doc.fontSize(10).moveDown(0.3)
    const comments = Array.isArray(wo.comments) ? wo.comments : []
    if (!comments.length) {
      doc.fillColor('#888').text('(no entries)').fillColor('black')
    } else {
      for (const c of comments) {
        doc.text(`• ${_fmtTs(c.ts)} — ${c.user || '?'}: ${c.comment || ''}`)
      }
    }
    doc.moveDown()

    doc.fontSize(13).text('Parts movements', { underline: true })
    doc.fontSize(10).moveDown(0.3)
    const moves = info.partsMoves || []
    if (!moves.length) {
      doc.fillColor('#888').text('(none)').fillColor('black')
    } else {
      for (const m of moves) {
        const from = m.fromLocation ?? '—'
        const to = m.toLocation ?? '—'
        doc.text(`• ${_fmtTs(m.ts)} — ${m.partCode || m.partId} [${m.role || '—'}]: ${from} → ${to} by ${m.user || '?'}`)
      }
    }
    doc.moveDown()

    doc.fontSize(13).text('Files', { underline: true })
    doc.fontSize(10).moveDown(0.3)
    const files = info.files || []
    if (!files.length) {
      doc.fillColor('#888').text('(none)').fillColor('black')
    } else {
      for (const f of files) {
        const url = `${fileBaseUrl}/auth/work-orders/${wo.id}/files/${f.id}`
        doc.fillColor('blue').text(`• ${f.name} (${f.mime}, ${f.size} bytes)`, { link: url, underline: true })
      }
      doc.fillColor('black')
    }
    doc.moveDown()

    if (info.warranty?.vendor) {
      doc.fontSize(13).text(`Warranty — ${info.warranty.vendor}`, { underline: true })
      doc.fontSize(10).moveDown(0.3)
      const fields = info.warranty.fields || {}
      for (const [k, v] of Object.entries(fields)) {
        doc.text(`${k}: ${typeof v === 'string' ? v : JSON.stringify(v)}`)
      }
    }

    doc.end()
  })
}

module.exports = { renderWorkOrderCsv, renderWorkOrderPdf, CSV_HEADERS }
