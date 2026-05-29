'use strict'

const DEFAULT_PEER_TIMEOUT_MS = 30000

/**
 * Downloads miner log files from wrk-miner via Hypercore/Hyperswarm P2P.
 *
 * Uses the hp-svc-facs-net facility (net_r0) for Hyperswarm and the
 * hp-svc-facs-store facility (store_s0) for Hypercore/Corestore storage.
 * No direct hypercore or hyperswarm require needed.
 *
 * The wrk-miner exposes a Hypercore identified by coreKey.
 * This class:
 *   1. Creates a read-only clone of that core via the Corestore facility
 *   2. Joins Hyperswarm (via net_r0) on the core's discoveryKey to find the wrk-miner peer
 *   3. Returns a Readable byte stream suitable for piping directly to an HTTP response
 *   4. Clears downloaded blocks and closes the Corestore session after the stream ends
 *
 * One shared connection handler on net_r0.swarm routes connections to the correct
 * in-flight download by matching peerInfo.topics against active download discoveryKeys.
 */
class LogDownloader {
  constructor ({ netFac, storeFac, peerTimeoutMs } = {}) {
    this._netFac = netFac
    this._storeFac = storeFac
    this._peerTimeoutMs = peerTimeoutMs || DEFAULT_PEER_TIMEOUT_MS
    // coreKeyHex -> { core, discoveryKeyHex }
    this._downloads = new Map()
    this._swarmReady = false
  }

  async _ensureSwarm () {
    if (!this._netFac.swarm) {
      await this._netFac.startSwarm()
    }

    if (this._swarmReady) return
    this._swarmReady = true

    this._netFac.swarm.on('connection', (socket, peerInfo) => {
      const topics = new Set(
        (peerInfo.topics || []).map(t => Buffer.from(t).toString('hex'))
      )
      for (const [, entry] of this._downloads) {
        if (topics.has(entry.discoveryKeyHex)) {
          entry.core.replicate(socket)
        }
      }
    })
  }

  /**
   * Open a streaming read of a remote Hypercore and return it as a Node.js Readable.
   * The stream fetches blocks lazily from the wrk-miner peer — no full buffering.
   *
   * @param {string} coreKeyHex  Hex-encoded public key of the Hypercore (from action result)
   * @param {number} byteLength  Expected total byte length (for stream bounds + HTTP Content-Length)
   * @returns {Promise<Readable>}
   */
  async stream (coreKeyHex, byteLength) {
    await this._ensureSwarm()

    const core = this._storeFac.getCore({ key: Buffer.from(coreKeyHex, 'hex') })
    await core.ready()

    const discoveryKeyHex = core.discoveryKey.toString('hex')
    this._downloads.set(coreKeyHex, { core, discoveryKeyHex })

    const discovery = this._netFac.swarm.join(core.discoveryKey, { server: false, client: true })
    const peersDone = core.findingPeers()
    this._netFac.swarm.flush().then(peersDone, peersDone)

    // Wait for the remote core's block tree to arrive (core.length > 0 required)
    const updateResult = await Promise.race([
      core.update(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('ERR_LOG_PEER_TIMEOUT')), this._peerTimeoutMs)
      )
    ])

    if (!core.length && (!updateResult || !updateResult.changed)) {
      await this._cleanup(coreKeyHex, core, discovery)
      throw new Error('ERR_LOG_PEER_NOT_FOUND')
    }

    // Lazy byte stream — blocks are fetched from the peer as the HTTP client reads
    const rs = core.createByteStream({ byteOffset: 0, byteLength })

    const cleanup = () => this._cleanup(coreKeyHex, core, discovery).catch(() => {})
    rs.once('end', cleanup)
    rs.once('error', cleanup)

    return rs
  }

  async _cleanup (coreKeyHex, core, discovery) {
    this._downloads.delete(coreKeyHex)
    try { await discovery.destroy() } catch {}
    try {
      if (core.length > 0) await core.clear(0, core.length)
      await core.close()
    } catch {}
  }
}

module.exports = LogDownloader
