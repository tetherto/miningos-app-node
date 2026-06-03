'use strict'

const test = require('brittle')
const { Readable } = require('node:stream')
const { randomBytes } = require('node:crypto')
const LogDownloader = require('../../../workers/lib/log-downloader')

// ─────────────────────────────────────────────────────────────────────────────
// Fake builders
// ─────────────────────────────────────────────────────────────────────────────

function makeDiscovery () {
  let destroyed = false
  return {
    destroy: async () => { destroyed = true },
    get _destroyed () { return destroyed }
  }
}

function makeReadStream () {
  return new Readable({ read () {} })
}

function makeCore (opts = {}) {
  const key = opts.key || randomBytes(32)
  const discoveryKey = opts.discoveryKey || randomBytes(32)
  const rs = opts.readStream || makeReadStream()
  let _length = opts.length !== undefined ? opts.length : 1
  let cleared = false
  let closed = false

  return {
    key,
    discoveryKey,
    get length () { return _length },
    set length (v) { _length = v },
    ready: async () => {},
    findingPeers: () => () => {},
    update: opts.update || (async () => ({ changed: true })),
    createByteStream: () => rs,
    replicate: () => {},
    clear: async () => { cleared = true },
    close: async () => { closed = true },
    _rs: rs,
    get _cleared () { return cleared },
    get _closed () { return closed }
  }
}

function makeSwarm () {
  const _listeners = {}
  const joined = []

  return {
    joined,
    on (event, fn) {
      _listeners[event] = _listeners[event] || []
      _listeners[event].push(fn)
    },
    join (discoveryKey, opts) {
      joined.push({ discoveryKey, opts })
      return makeDiscovery()
    },
    flush: async () => {},
    emit (event, ...args) {
      for (const fn of (_listeners[event] || [])) fn(...args)
    },
    listenerCount (event) {
      return (_listeners[event] || []).length
    }
  }
}

function makeNetFac (existingSwarm = null) {
  let _swarm = existingSwarm
  return {
    get swarm () { return _swarm },
    startSwarm: async () => { _swarm = makeSwarm() }
  }
}

function makeStoreFac (coreFactory = null) {
  return {
    getCore (opts) {
      return coreFactory ? coreFactory(opts) : makeCore({ key: opts.key })
    }
  }
}

const TEST_KEY = Buffer.alloc(32).fill(0x01)
const TEST_KEY_HEX = TEST_KEY.toString('hex')

// ─────────────────────────────────────────────────────────────────────────────
// Constructor
// ─────────────────────────────────────────────────────────────────────────────

test('LogDownloader - constructor stores facilities', (t) => {
  const netFac = makeNetFac()
  const storeFac = makeStoreFac()

  const dl = new LogDownloader({ netFac, storeFac })

  t.ok(dl._netFac === netFac, 'should store netFac reference')
  t.ok(dl._storeFac === storeFac, 'should store storeFac reference')
  t.pass()
})

test('LogDownloader - constructor defaults peerTimeoutMs to 60s', (t) => {
  const dl = new LogDownloader({ netFac: makeNetFac(), storeFac: makeStoreFac() })
  t.is(dl._peerTimeoutMs, 60000, 'should default to 60000ms')
  t.pass()
})

test('LogDownloader - constructor accepts custom peerTimeoutMs', (t) => {
  const dl = new LogDownloader({ netFac: makeNetFac(), storeFac: makeStoreFac(), peerTimeoutMs: 5000 })
  t.is(dl._peerTimeoutMs, 5000, 'should use provided peerTimeoutMs')
  t.pass()
})

test('LogDownloader - constructor initialises empty downloads map', (t) => {
  const dl = new LogDownloader({ netFac: makeNetFac(), storeFac: makeStoreFac() })
  t.ok(dl._downloads instanceof Map, 'should be a Map')
  t.is(dl._downloads.size, 0, 'should start empty')
  t.is(dl._swarmReady, false, 'swarmReady should start false')
  t.pass()
})

// ─────────────────────────────────────────────────────────────────────────────
// _ensureSwarm
// ─────────────────────────────────────────────────────────────────────────────

test('LogDownloader - _ensureSwarm calls startSwarm when swarm is null', async (t) => {
  let startCalls = 0
  const swarm = makeSwarm()
  const netFac = {
    get swarm () { return startCalls > 0 ? swarm : null },
    startSwarm: async () => { startCalls++ }
  }

  const dl = new LogDownloader({ netFac, storeFac: makeStoreFac() })
  await dl._ensureSwarm()

  t.is(startCalls, 1, 'should call startSwarm exactly once')
  t.ok(dl._swarmReady, 'should set swarmReady to true')
  t.pass()
})

test('LogDownloader - _ensureSwarm skips startSwarm when swarm already exists', async (t) => {
  let startCalls = 0
  const swarm = makeSwarm()
  const netFac = {
    get swarm () { return swarm },
    startSwarm: async () => { startCalls++ }
  }

  const dl = new LogDownloader({ netFac, storeFac: makeStoreFac() })
  await dl._ensureSwarm()

  t.is(startCalls, 0, 'should not call startSwarm when swarm already exists')
  t.pass()
})

test('LogDownloader - _ensureSwarm registers connection handler exactly once', async (t) => {
  const swarm = makeSwarm()
  const netFac = { get swarm () { return swarm }, startSwarm: async () => {} }

  const dl = new LogDownloader({ netFac, storeFac: makeStoreFac() })
  await dl._ensureSwarm()
  await dl._ensureSwarm()
  await dl._ensureSwarm()

  t.is(swarm.listenerCount('connection'), 1, 'should register connection listener only once')
  t.pass()
})

// ─────────────────────────────────────────────────────────────────────────────
// stream — happy path
// ─────────────────────────────────────────────────────────────────────────────

test('LogDownloader - stream returns a Readable', async (t) => {
  const swarm = makeSwarm()
  const netFac = { get swarm () { return swarm }, startSwarm: async () => {} }

  const dl = new LogDownloader({ netFac, storeFac: makeStoreFac() })
  const rs = await dl.stream(TEST_KEY_HEX, 100)

  t.ok(rs instanceof Readable, 'should return a Readable stream')
  t.pass()
})

test('LogDownloader - stream joins swarm as client only', async (t) => {
  const swarm = makeSwarm()
  const netFac = { get swarm () { return swarm }, startSwarm: async () => {} }

  const dl = new LogDownloader({ netFac, storeFac: makeStoreFac() })
  await dl.stream(TEST_KEY_HEX, 100)

  t.is(swarm.joined.length, 1, 'should join exactly one DHT topic')
  t.alike(swarm.joined[0].opts, { server: false, client: true }, 'should join as client only')
  t.pass()
})

test('LogDownloader - stream registers download entry while active', async (t) => {
  const swarm = makeSwarm()
  const netFac = { get swarm () { return swarm }, startSwarm: async () => {} }

  const dl = new LogDownloader({ netFac, storeFac: makeStoreFac() })
  await dl.stream(TEST_KEY_HEX, 100)

  t.is(dl._downloads.size, 1, 'should track the active download')
  t.ok(dl._downloads.has(TEST_KEY_HEX), 'should key the entry by coreKeyHex')
  t.pass()
})

// ─────────────────────────────────────────────────────────────────────────────
// stream — error cases
// ─────────────────────────────────────────────────────────────────────────────

test('LogDownloader - stream throws ERR_LOG_PEER_TIMEOUT when update hangs', async (t) => {
  const swarm = makeSwarm()
  const netFac = { get swarm () { return swarm }, startSwarm: async () => {} }

  const storeFac = makeStoreFac(() => {
    const c = makeCore({
      length: 0,
      update: () => new Promise(() => {}) // never resolves
    })
    c.length = 0
    return c
  })

  const dl = new LogDownloader({ netFac, storeFac, peerTimeoutMs: 50 })

  try {
    await dl.stream(TEST_KEY_HEX, 100)
    t.fail('should have thrown ERR_LOG_PEER_TIMEOUT')
  } catch (err) {
    t.is(err.message, 'ERR_LOG_PEER_TIMEOUT', 'should throw ERR_LOG_PEER_TIMEOUT')
  }

  t.pass()
})

test('LogDownloader - stream throws ERR_LOG_PEER_NOT_FOUND when update has no change', async (t) => {
  const swarm = makeSwarm()
  const netFac = { get swarm () { return swarm }, startSwarm: async () => {} }

  const storeFac = makeStoreFac(() => {
    const c = makeCore({ update: async () => ({ changed: false }) })
    c.length = 0
    return c
  })

  const dl = new LogDownloader({ netFac, storeFac })

  try {
    await dl.stream(TEST_KEY_HEX, 100)
    t.fail('should have thrown ERR_LOG_PEER_NOT_FOUND')
  } catch (err) {
    t.is(err.message, 'ERR_LOG_PEER_NOT_FOUND', 'should throw ERR_LOG_PEER_NOT_FOUND')
  }

  t.pass()
})

test('LogDownloader - stream removes download from map on peer-not-found', async (t) => {
  const swarm = makeSwarm()
  const netFac = { get swarm () { return swarm }, startSwarm: async () => {} }

  const storeFac = makeStoreFac(() => {
    const c = makeCore({ update: async () => ({ changed: false }) })
    c.length = 0
    return c
  })

  const dl = new LogDownloader({ netFac, storeFac })

  try { await dl.stream(TEST_KEY_HEX, 100) } catch {}

  t.is(dl._downloads.size, 0, 'should remove download from map after failure')
  t.pass()
})

// ─────────────────────────────────────────────────────────────────────────────
// stream — auto-cleanup on stream events
// ─────────────────────────────────────────────────────────────────────────────

test('LogDownloader - stream cleans up after stream end', async (t) => {
  const swarm = makeSwarm()
  const netFac = { get swarm () { return swarm }, startSwarm: async () => {} }

  const rs = makeReadStream()
  let coreClosed = false

  const storeFac = makeStoreFac(() => {
    const c = makeCore()
    c.createByteStream = () => rs
    c.close = async () => { coreClosed = true }
    return c
  })

  const dl = new LogDownloader({ netFac, storeFac })
  await dl.stream(TEST_KEY_HEX, 100)

  t.is(dl._downloads.size, 1, 'precondition: download tracked before stream ends')

  rs.emit('end')
  await new Promise(resolve => setImmediate(resolve))

  t.is(dl._downloads.size, 0, 'should remove download from map after stream end')
  t.ok(coreClosed, 'should close core after stream end')
  t.pass()
})

test('LogDownloader - stream cleans up after stream error', async (t) => {
  const swarm = makeSwarm()
  const netFac = { get swarm () { return swarm }, startSwarm: async () => {} }

  const rs = makeReadStream()
  rs.on('error', () => {}) // suppress unhandled error
  let coreClosed = false

  const storeFac = makeStoreFac(() => {
    const c = makeCore()
    c.createByteStream = () => rs
    c.close = async () => { coreClosed = true }
    return c
  })

  const dl = new LogDownloader({ netFac, storeFac })
  await dl.stream(TEST_KEY_HEX, 100)

  rs.emit('error', new Error('connection dropped'))
  await new Promise(resolve => setImmediate(resolve))

  t.is(dl._downloads.size, 0, 'should remove download from map after stream error')
  t.ok(coreClosed, 'should close core after stream error')
  t.pass()
})

// ─────────────────────────────────────────────────────────────────────────────
// connection handler — replicate all active downloads
// ─────────────────────────────────────────────────────────────────────────────

test('LogDownloader - connection handler replicates core on swarm connection', async (t) => {
  const swarm = makeSwarm()
  const netFac = { get swarm () { return swarm }, startSwarm: async () => {} }

  const replicateCalls = []
  const storeFac = makeStoreFac(() => {
    const c = makeCore()
    c.replicate = (socket) => replicateCalls.push(socket)
    return c
  })

  const dl = new LogDownloader({ netFac, storeFac })
  await dl.stream(TEST_KEY_HEX, 100)

  const entry = dl._downloads.get(TEST_KEY_HEX)
  const discoveryKeyBuf = Buffer.from(entry.discoveryKeyHex, 'hex')

  const fakeSocket = {}
  swarm.emit('connection', fakeSocket, { topics: [discoveryKeyBuf] })

  t.is(replicateCalls.length, 1, 'should replicate active download on connection')
  t.ok(replicateCalls[0] === fakeSocket, 'should pass socket to replicate')
  t.pass()
})

test('LogDownloader - connection handler replicates without inspecting peer topics', async (t) => {
  const swarm = makeSwarm()
  const netFac = { get swarm () { return swarm }, startSwarm: async () => {} }

  const replicateCalls = []
  const storeFac = makeStoreFac(() => {
    const c = makeCore()
    c.replicate = (socket) => replicateCalls.push(socket)
    return c
  })

  const dl = new LogDownloader({ netFac, storeFac })
  await dl.stream(TEST_KEY_HEX, 100)

  swarm.emit('connection', {}, { topics: [Buffer.alloc(32).fill(0xff)] })

  t.is(replicateCalls.length, 1, 'should replicate on every swarm connection')
  t.pass()
})

test('LogDownloader - connection handler replicates when connection has no topics', async (t) => {
  const swarm = makeSwarm()
  const netFac = { get swarm () { return swarm }, startSwarm: async () => {} }

  const replicateCalls = []
  const storeFac = makeStoreFac(() => {
    const c = makeCore()
    c.replicate = (socket) => replicateCalls.push(socket)
    return c
  })

  const dl = new LogDownloader({ netFac, storeFac })
  await dl.stream(TEST_KEY_HEX, 100)

  swarm.emit('connection', {})

  t.is(replicateCalls.length, 1, 'should replicate without peer topic metadata')
  t.pass()
})

// ─────────────────────────────────────────────────────────────────────────────
// _cleanup
// ─────────────────────────────────────────────────────────────────────────────

test('LogDownloader - _cleanup destroys discovery and closes core', async (t) => {
  let discoveryDestroyed = false
  let coreClosed = false
  let coreCleared = false

  const discovery = {
    destroy: async () => { discoveryDestroyed = true }
  }
  const core = makeCore()
  core.length = 1
  core.close = async () => { coreClosed = true }
  core.clear = async () => { coreCleared = true }

  const dl = new LogDownloader({ netFac: makeNetFac(makeSwarm()), storeFac: makeStoreFac() })
  dl._downloads.set(TEST_KEY_HEX, { core, discoveryKeyHex: TEST_KEY_HEX })

  await dl._cleanup(TEST_KEY_HEX, core, discovery)

  t.ok(discoveryDestroyed, 'should destroy the DHT discovery')
  t.ok(coreClosed, 'should close the core session')
  t.ok(coreCleared, 'should clear downloaded blocks from storage')
  t.is(dl._downloads.size, 0, 'should remove entry from downloads map')
  t.pass()
})

test('LogDownloader - _cleanup skips clear when core has no blocks', async (t) => {
  let coreCleared = false

  const discovery = { destroy: async () => {} }
  const core = makeCore()
  core.length = 0
  core.clear = async () => { coreCleared = true }

  const dl = new LogDownloader({ netFac: makeNetFac(makeSwarm()), storeFac: makeStoreFac() })
  dl._downloads.set(TEST_KEY_HEX, { core, discoveryKeyHex: TEST_KEY_HEX })

  await dl._cleanup(TEST_KEY_HEX, core, discovery)

  t.not(coreCleared, true, 'should not call clear when length is 0')
  t.pass()
})
