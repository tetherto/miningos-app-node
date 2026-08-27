'use strict'

const zlib = require('zlib')
const { PassThrough } = require('streamx')

// The miner decides what a log download actually contains: some models stream a single
// plain-text log, Whatsminers stream a gzipped tar of their log directory. The action result
// carries no format field, so the only reliable source is the payload's leading bytes.

const GZIP_MAGIC = [0x1f, 0x8b]
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]

// A POSIX tar header is 512 bytes and carries "ustar" at offset 257.
const TAR_HEADER_LENGTH = 512
const TAR_MAGIC = 'ustar'
const TAR_MAGIC_OFFSET = 257

const TEXT_FORMAT = { extension: 'log', contentType: 'text/plain; charset=utf-8' }
const GZIP_FORMAT = { extension: 'gz', contentType: 'application/gzip' }
const TAR_GZ_FORMAT = { extension: 'tar.gz', contentType: 'application/gzip' }
const ZIP_FORMAT = { extension: 'zip', contentType: 'application/zip' }

function hasMagic (head, magic) {
  return head.length >= magic.length && magic.every((byte, index) => head[index] === byte)
}

// Inflates whatever of `head` zlib can manage — the input is a stream prefix, so the deflate
// block is expected to be truncated. Returns null when it cannot be inflated at all.
function inflateHead (head) {
  try {
    return zlib.gunzipSync(head, { finishFlush: zlib.constants.Z_SYNC_FLUSH })
  } catch {
    return null
  }
}

function isGzippedTar (head) {
  const inflated = inflateHead(head)
  if (!inflated || inflated.length < TAR_HEADER_LENGTH) return false

  return inflated.toString('latin1', TAR_MAGIC_OFFSET, TAR_MAGIC_OFFSET + TAR_MAGIC.length) === TAR_MAGIC
}

/**
 * Format implied by a payload's leading bytes. Falls back to plain text, and never claims 'tar'
 * without having seen a tar header, so the declared name always matches the bytes.
 *
 * @param {Buffer|null} head  First chunk of the payload (null for an empty stream)
 * @returns {{ extension: string, contentType: string }}
 */
function detectPayloadFormat (head) {
  if (!head || !head.length) return TEXT_FORMAT

  if (hasMagic(head, GZIP_MAGIC)) {
    return isGzippedTar(head) ? TAR_GZ_FORMAT : GZIP_FORMAT
  }

  if (hasMagic(head, ZIP_MAGIC)) return ZIP_FORMAT

  return TEXT_FORMAT
}

/**
 * Reads the first chunk of a stream. Pair it with `prependChunk` to hand the bytes back —
 * `stream.unshift` silently drops them when the peek consumed the stream's last chunk, which
 * would truncate a small log. Resolves null when the stream ends without producing data.
 *
 * @param {import('streamx').Readable} stream
 * @returns {Promise<Buffer|null>}
 */
function peekFirstChunk (stream) {
  return new Promise((resolve, reject) => {
    let settled = false

    // Stays attached for the life of the stream: an 'error' with no listener is thrown by
    // EventEmitter, and the source can fail in the gap between this peek and the pipe.
    const onError = (err) => {
      if (settled) return
      settled = true
      detach()
      reject(err)
    }

    const detach = () => {
      stream.off('readable', onReadable)
      stream.off('end', onEnd)
    }
    const settle = (chunk) => {
      if (settled) return
      settled = true
      detach()
      resolve(chunk === undefined ? null : chunk)
    }
    const onReadable = () => settle(stream.read())
    const onEnd = () => settle(null)

    stream.on('error', onError)

    const immediate = stream.read()
    if (immediate !== null && immediate !== undefined) return settle(immediate)

    stream.on('readable', onReadable)
    stream.on('end', onEnd)
  })
}

/**
 * Re-emits a peeked chunk ahead of the rest of the source, so the consumer sees the payload
 * byte-for-byte. Honours the consumer's backpressure — nothing beyond one chunk is buffered.
 *
 * @param {import('streamx').Readable} source  Stream already advanced past `head`
 * @param {Buffer|null} head
 * @returns {import('streamx').Readable}
 */
function prependChunk (source, head) {
  const out = new PassThrough()

  const write = async (chunk) => {
    if (out.write(chunk) === false) {
      await new Promise((resolve) => out.once('drain', resolve))
    }
  }

  const pump = async () => {
    if (head) await write(head)
    for await (const chunk of source) await write(chunk)
    out.end()
  }

  pump().catch((err) => out.destroy(err))

  return out
}

module.exports = {
  detectPayloadFormat,
  peekFirstChunk,
  prependChunk
}
