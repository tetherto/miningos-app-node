'use strict'

const test = require('brittle')
const handlers = require('../../../workers/lib/server/handlers/workOrderFiles.handlers')
const { createMockCtxWithOrks } = require('../helpers/mockHelpers')

const RACK = 'inventory-work_order-rack-x'
const OPEN_WO = {
  id: 'wo-1',
  code: 'IVI-2-0001',
  type: 'inventory-work_order',
  info: { status: 'open', files: [] }
}
const CLOSED_WO = {
  id: 'wo-1',
  code: 'IVI-2-0001',
  type: 'inventory-work_order',
  info: { status: 'closed', files: [] }
}

const mockAuthLib = {
  getTokenPerms: async () => ({ permissions: ['inventory:rw', 'work_order:rw', 'actions:rw'] })
}
const userMeta = (email = 'op@test') => ({
  _info: { authToken: 'tok', user: { metadata: { email } } }
})

function mockFile (mimetype, content, filename = 'file.bin') {
  return {
    filename,
    mimetype,
    toBuffer: async () => Buffer.from(content)
  }
}

function buildCtx ({ wo = OPEN_WO, storeResult, conf = {} } = {}) {
  const pushed = []
  const fileCalls = []
  const handler = async (_key, method, params) => {
    if (method === 'listThings') return wo ? [wo] : []
    if (method === 'storeFile' || method === 'loadFile' || method === 'removeFile') {
      fileCalls.push({ method, params })
    }
    if (method === 'storeFile') {
      return storeResult ?? {
        id: 'file-1',
        name: params.name,
        mime: params.mime,
        size: Buffer.from(params.contentBase64, 'base64').length,
        blobRef: { byteOffset: 0, blockOffset: 0, blockLength: 1, byteLength: 4 },
        ts: 100,
        user: params.user
      }
    }
    if (method === 'loadFile') return { contentBase64: Buffer.from('hello').toString('base64') }
    if (method === 'removeFile') return { cleared: true }
    if (method === 'pushAction') { pushed.push(params); return { id: 'act-1', errors: [] } }
    return null
  }
  const ctx = createMockCtxWithOrks([{ rpcPublicKey: 'k' }], handler)
  ctx.authLib = mockAuthLib
  ctx.conf = { ...ctx.conf, workOrderRackId: RACK, ...conf }
  return { ctx, pushed, fileCalls }
}

test('handlers: uploadWorkOrderFile 404s when WO is missing', async (t) => {
  const { ctx } = buildCtx({ wo: null })
  await t.exception(
    () => handlers.uploadWorkOrderFile(ctx, {
      ...userMeta(),
      params: { id: 'wo-x' },
      file: async () => mockFile('image/png', 'AAAA')
    }),
    /ERR_WORK_ORDER_NOT_FOUND/
  )
})

test('handlers: uploadWorkOrderFile rejects on closed WO', async (t) => {
  const { ctx } = buildCtx({ wo: CLOSED_WO })
  await t.exception(
    () => handlers.uploadWorkOrderFile(ctx, {
      ...userMeta(),
      params: { id: 'wo-1' },
      file: async () => mockFile('image/png', 'AAAA')
    }),
    /ERR_WO_INVALID_STATUS_TRANSITION/
  )
})

test('handlers: uploadWorkOrderFile rejects disallowed mime', async (t) => {
  const { ctx } = buildCtx()
  await t.exception(
    () => handlers.uploadWorkOrderFile(ctx, {
      ...userMeta(),
      params: { id: 'wo-1' },
      file: async () => mockFile('application/x-msdownload', 'AAAA', 'evil.exe')
    }),
    /ERR_FILE_MIME_NOT_ALLOWED/
  )
})

test('handlers: uploadWorkOrderFile rejects oversize', async (t) => {
  const { ctx } = buildCtx({ conf: { workOrderFileMaxBytes: 4 } })
  await t.exception(
    () => handlers.uploadWorkOrderFile(ctx, {
      ...userMeta(),
      params: { id: 'wo-1' },
      file: async () => mockFile('image/png', 'AAAAAAAAA')
    }),
    /ERR_FILE_TOO_LARGE/
  )
})

test('handlers: uploadWorkOrderFile rejects when file count cap reached', async (t) => {
  const woWithCap = {
    id: 'wo-1', info: { status: 'open', files: Array.from({ length: 2 }, (_, i) => ({ id: `f-${i}` })) }
  }
  const { ctx } = buildCtx({ wo: woWithCap, conf: { workOrderFileCountCap: 2 } })
  await t.exception(
    () => handlers.uploadWorkOrderFile(ctx, {
      ...userMeta(),
      params: { id: 'wo-1' },
      file: async () => mockFile('image/png', 'AAAA')
    }),
    /ERR_WO_FILE_COUNT_CAP_REACHED/
  )
})

test('handlers: uploadWorkOrderFile happy path stores blob and appends file metadata', async (t) => {
  const { ctx, pushed, fileCalls } = buildCtx()
  const out = await handlers.uploadWorkOrderFile(ctx, {
    ...userMeta(),
    params: { id: 'wo-1' },
    file: async () => mockFile('image/png', 'AAAA', 'photo.png')
  })
  t.is(out.id, 'file-1')
  t.is(out.mime, 'image/png')
  t.is(out.size, 4)
  t.is(pushed.length, 1, 'one pushAction updateThing fired')
  t.is(pushed[0].action, 'updateThing')
  t.is(pushed[0].params[0].info.files.length, 1)
  t.is(pushed[0].params[0].info.files[0].id, 'file-1')
  t.is(fileCalls[0].method, 'storeFile', 'uses the generic storeFile RPC')
  t.is(fileCalls[0].params.type, 'work_order', 'tags the call with the work_order file type')
})

test('handlers: downloadWorkOrderFile 404s for unknown file id', async (t) => {
  const { ctx } = buildCtx({
    wo: { id: 'wo-1', info: { status: 'open', files: [{ id: 'f-known', blobRef: 'ref' }] } }
  })
  await t.exception(
    () => handlers.downloadWorkOrderFile(ctx, {
      ...userMeta(),
      params: { id: 'wo-1', fileId: 'f-other' }
    }, { header: () => {}, send: () => {} }),
    /ERR_WO_FILE_NOT_FOUND/
  )
})

test('handlers: downloadWorkOrderFile streams blob content with content-type header', async (t) => {
  const wo = { id: 'wo-1', info: { status: 'open', files: [{ id: 'f-1', name: 'photo.png', mime: 'image/png', blobRef: 'ref' }] } }
  const { ctx } = buildCtx({ wo })

  const headers = {}
  let sent
  const rep = {
    header: (k, v) => { headers[k] = v },
    send: (buf) => { sent = buf }
  }
  await handlers.downloadWorkOrderFile(ctx, {
    ...userMeta(),
    params: { id: 'wo-1', fileId: 'f-1' }
  }, rep)
  t.is(headers['content-type'], 'image/png')
  t.is(headers['content-disposition'], 'attachment; filename="photo.png"')
  t.is(Buffer.compare(sent, Buffer.from('hello')), 0)
})

test('handlers: deleteWorkOrderFile removes blob + strips metadata', async (t) => {
  const wo = { id: 'wo-1', info: { status: 'open', files: [{ id: 'f-1', blobRef: 'ref' }, { id: 'f-2', blobRef: 'ref2' }] } }
  const { ctx, pushed, fileCalls } = buildCtx({ wo })
  const out = await handlers.deleteWorkOrderFile(ctx, {
    ...userMeta(),
    params: { id: 'wo-1', fileId: 'f-1' }
  })
  t.is(out.id, 'f-1')
  t.is(out.blobCleared, true, 'surfaces whether the rack cleared the blob')
  t.is(pushed.length, 1)
  const updated = pushed[0].params[0].info.files
  t.is(updated.length, 1)
  t.is(updated[0].id, 'f-2')
  const removeCall = fileCalls.find(c => c.method === 'removeFile')
  t.is(removeCall.params.workOrderId, 'wo-1', 'scopes the rack call to the owning WO')
  t.is(removeCall.params.fileId, 'f-1', 'passes fileId, not a raw blobRef')
})

test('handlers: deleteWorkOrderFile blocked on closed WO', async (t) => {
  const wo = { id: 'wo-1', info: { status: 'closed', files: [{ id: 'f-1', blobRef: 'ref' }] } }
  const { ctx } = buildCtx({ wo })
  await t.exception(
    () => handlers.deleteWorkOrderFile(ctx, {
      ...userMeta(),
      params: { id: 'wo-1', fileId: 'f-1' }
    }),
    /ERR_WO_INVALID_STATUS_TRANSITION/
  )
})
