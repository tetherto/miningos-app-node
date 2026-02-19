'use strict'

const test = require('brittle')
const fs = require('fs')
const { createWorker } = require('tether-svc-test-helper').worker
const { setTimeout: sleep } = require('timers/promises')
const HttpFacility = require('bfx-facs-http')
const { ENDPOINTS } = require('../../workers/lib/constants')

test('Miners API', { timeout: 90000 }, async (main) => {
  const baseDir = 'tests/integration'
  let worker
  let httpClient
  const appNodePort = 5002
  const ip = '127.0.0.1'
  const appNodeBaseUrl = `http://${ip}:${appNodePort}`
  const readonlyUser = 'readonly-miners@test'
  const siteOperatorUser = 'siteoperator-miners@test'
  const encoding = 'json'
  const invalidToken = 'invalid-token'

  main.teardown(async () => {
    await httpClient.stop()
    await worker.stop()
    await sleep(2000)
    fs.rmSync(`./${baseDir}/store`, { recursive: true, force: true })
    fs.rmSync(`./${baseDir}/status`, { recursive: true, force: true })
    fs.rmSync(`./${baseDir}/config`, { recursive: true, force: true })
    fs.rmSync(`./${baseDir}/db`, { recursive: true, force: true })
  })

  const mockMiners = [
    {
      id: 'miner-001',
      type: 'antminer-s19',
      code: 'M001',
      info: {
        container: 'container-A',
        serialNum: 'SN-001',
        macAddress: 'AA:BB:CC:DD:EE:01',
        pos: 'A1'
      },
      tags: ['t-miner'],
      rack: 'rack-1',
      comments: [],
      opts: { address: '192.168.1.100' },
      ts: Date.now() - 60000,
      last: {
        ts: Date.now(),
        uptime: 86400,
        alerts: [],
        snap: {
          model: 'Antminer S19 XP',
          stats: {
            status: 'online',
            hashrate_mhs: 140000,
            power_w: 3010,
            efficiency_w_ths: 21.5,
            temperature_c: 65
          },
          config: {
            firmware_ver: '2024.01.01',
            power_mode: 'normal',
            led_status: 'off',
            pool_config: {
              url: 'stratum+tcp://btc.f2pool.com:3333',
              user: 'tether.worker1'
            }
          }
        }
      }
    },
    {
      id: 'miner-002',
      type: 'antminer-s19',
      code: 'M002',
      info: {
        container: 'container-A',
        serialNum: 'SN-002',
        macAddress: 'AA:BB:CC:DD:EE:02',
        pos: 'A2'
      },
      tags: ['t-miner'],
      rack: 'rack-1',
      comments: [{ text: 'needs maintenance' }],
      opts: { address: '192.168.1.101' },
      ts: Date.now() - 120000,
      last: {
        ts: Date.now(),
        uptime: 172800,
        alerts: [{ type: 'high_temp', severity: 'medium' }],
        snap: {
          model: 'Antminer S19 XP',
          stats: {
            status: 'online',
            hashrate_mhs: 135000,
            power_w: 2980,
            efficiency_w_ths: 22.1,
            temperature_c: 72
          },
          config: {
            firmware_ver: '2024.01.01',
            power_mode: 'normal',
            led_status: 'off',
            pool_config: {
              url: 'stratum+tcp://btc.f2pool.com:3333',
              user: 'tether.worker2'
            }
          }
        }
      }
    },
    {
      id: 'miner-003',
      type: 'whatsminer-m50s',
      code: 'M003',
      info: {
        container: 'container-B',
        serialNum: 'SN-003',
        macAddress: 'AA:BB:CC:DD:EE:03',
        pos: 'B1'
      },
      tags: ['t-miner'],
      rack: 'rack-2',
      comments: [],
      opts: { address: '192.168.2.100' },
      ts: Date.now() - 180000,
      last: {
        ts: Date.now() - 300000,
        uptime: 3600,
        alerts: [],
        snap: {
          model: 'Whatsminer M50S',
          stats: {
            status: 'error',
            hashrate_mhs: 0,
            power_w: 50,
            efficiency_w_ths: 0,
            temperature_c: 30
          },
          config: {
            firmware_ver: '2023.12.15',
            power_mode: 'normal',
            led_status: 'on',
            pool_config: {
              url: 'stratum+tcp://ocean.xyz:3333',
              user: 'tether.worker3'
            }
          }
        }
      }
    },
    {
      id: 'miner-004',
      type: 'antminer-s19',
      code: 'M004',
      info: {
        container: 'container-B',
        serialNum: 'SN-004',
        macAddress: 'AA:BB:CC:DD:EE:04',
        pos: 'B2'
      },
      tags: ['t-miner'],
      rack: 'rack-2',
      comments: [],
      opts: { address: '192.168.2.101' },
      ts: Date.now() - 240000,
      last: {
        ts: Date.now(),
        uptime: 43200,
        alerts: [],
        snap: {
          model: 'Antminer S19 XP',
          stats: {
            status: 'sleep',
            hashrate_mhs: 0,
            power_w: 10,
            efficiency_w_ths: 0,
            temperature_c: 25
          },
          config: {
            firmware_ver: '2024.01.01',
            power_mode: 'sleep',
            led_status: 'off',
            pool_config: {
              url: 'stratum+tcp://btc.f2pool.com:3333',
              user: 'tether.worker4'
            }
          }
        }
      }
    },
    {
      id: 'miner-005',
      type: 'antminer-s19',
      code: 'M005',
      info: {
        container: 'container-A',
        serialNum: 'SN-005',
        macAddress: 'AA:BB:CC:DD:EE:05',
        pos: 'A3'
      },
      tags: ['t-miner'],
      rack: 'rack-1',
      comments: [],
      opts: { address: '192.168.1.102' },
      ts: Date.now() - 300000,
      last: {
        ts: Date.now(),
        uptime: 259200,
        alerts: [{ type: 'low_hashrate', severity: 'high' }],
        snap: {
          model: 'Antminer S19 XP',
          stats: {
            status: 'online',
            hashrate_mhs: 120000,
            power_w: 2900,
            efficiency_w_ths: 24.2,
            temperature_c: 68
          },
          config: {
            firmware_ver: '2023.12.15',
            power_mode: 'low',
            led_status: 'off',
            pool_config: {
              url: 'stratum+tcp://btc.f2pool.com:3333',
              user: 'tether.worker5'
            }
          }
        }
      }
    }
  ]

  const createConfig = () => {
    if (!fs.existsSync(`./${baseDir}/config/facs`)) {
      if (!fs.existsSync(`./${baseDir}/config`)) fs.mkdirSync(`./${baseDir}/config`)
      fs.mkdirSync(`./${baseDir}/config/facs`)
    }
    if (!fs.existsSync(`./${baseDir}/db`)) fs.mkdirSync(`./${baseDir}/db`)

    const commonConf = {
      dir_log: 'logs',
      debug: 0,
      orks: { 'cluster-1': { rpcPublicKey: '' } },
      cacheTiming: {},
      featureConfig: {}
    }
    const netConf = { r0: {} }
    const httpdConf = { h0: {} }
    const httpdOauthConf = {
      h0: {
        method: 'google',
        credentials: { client: { id: 'i', secret: 's' } },
        users: [
          { email: readonlyUser },
          { email: siteOperatorUser, write: true }
        ]
      }
    }
    const authConf = require('../../config/facs/auth.config.json')

    fs.writeFileSync(`./${baseDir}/config/common.json`, JSON.stringify(commonConf))
    fs.writeFileSync(`./${baseDir}/config/facs/net.config.json`, JSON.stringify(netConf))
    fs.writeFileSync(`./${baseDir}/config/facs/httpd.config.json`, JSON.stringify(httpdConf))
    fs.writeFileSync(`./${baseDir}/config/facs/httpd-oauth2.config.json`, JSON.stringify(httpdOauthConf))
    fs.writeFileSync(`./${baseDir}/config/facs/auth.config.json`, JSON.stringify(authConf))
  }

  const startWorker = async () => {
    worker = createWorker({
      env: 'test',
      wtype: 'wrk-node-http-test',
      rack: 'test-rack',
      tmpdir: baseDir,
      storeDir: 'test-store',
      serviceRoot: `${process.cwd()}/${baseDir}`,
      port: appNodePort
    })

    await worker.start()
    worker.worker.net_r0.jRequest = (publicKey, method) => {
      if (method === 'listThings') {
        return Promise.resolve(mockMiners)
      }
      if (method === 'getWrkExtData') {
        return Promise.resolve([])
      }
      return Promise.resolve({})
    }
  }

  const createHttpClient = async () => {
    httpClient = new HttpFacility({}, { ns: 'c0', timeout: 30000, debug: false }, { env: 'test' })
    await httpClient.start()
  }

  const getTestToken = async (email) => {
    worker.worker.authLib._auth.addHandlers({
      google: () => { return { email } }
    })
    const token = await worker.worker.auth_a0.authCallbackHandler('google', { ip })
    return token
  }

  const createAuthHeaders = async (userEmail) => {
    const token = await getTestToken(userEmail)
    return { Authorization: `Bearer ${token}` }
  }

  createConfig()
  await startWorker()
  await createHttpClient()
  await sleep(2000)

  const minersApi = `${appNodeBaseUrl}${ENDPOINTS.MINERS}`

  // --- Auth security tests ---

  await main.test('Api: miners - auth security', async (n) => {
    await n.test('should fail for missing auth token', async (t) => {
      try {
        await httpClient.get(minersApi, { encoding })
        t.fail('Expected error for missing auth token')
      } catch (e) {
        t.is(e.response.message.includes('ERR_AUTH_FAIL'), true)
      }
    })

    await n.test('should fail for invalid auth token', async (t) => {
      const headers = { Authorization: `Bearer ${invalidToken}` }
      try {
        await httpClient.get(minersApi, { headers, encoding })
        t.fail('Expected error for invalid auth token')
      } catch (e) {
        t.is(e.response.message.includes('ERR_AUTH_FAIL'), true)
      }
    })

    await n.test('should fail for readonly user (capCheck requires write)', async (t) => {
      const headers = await createAuthHeaders(readonlyUser)
      try {
        await httpClient.get(minersApi, { headers, encoding })
        t.fail('Expected error for readonly user')
      } catch (e) {
        t.is(e.response.message.includes('ERR_AUTH_FAIL'), true)
      }
    })

    await n.test('should succeed for site operator user (has actions:rw)', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      try {
        await httpClient.get(minersApi, { headers, encoding })
        t.pass()
      } catch (e) {
        t.fail(`Expected success but got: ${e.message || e}`)
      }
    })
  })

  // --- Response structure tests ---

  await main.test('Api: miners - response structure', async (n) => {
    await n.test('should return paginated response with correct top-level fields', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const { body: data } = await httpClient.get(minersApi, { headers, encoding })

      t.ok(Array.isArray(data.data), 'data should be an array')
      t.ok(typeof data.totalCount === 'number', 'totalCount should be a number')
      t.ok(typeof data.offset === 'number', 'offset should be a number')
      t.ok(typeof data.limit === 'number', 'limit should be a number')
      t.ok(typeof data.hasMore === 'boolean', 'hasMore should be a boolean')
    })

    await n.test('should return all mock miners with default pagination', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const { body: data } = await httpClient.get(minersApi, { headers, encoding })

      t.is(data.totalCount, 5, 'totalCount should be 5')
      t.is(data.data.length, 5, 'data should have 5 items')
      t.is(data.offset, 0, 'offset should default to 0')
      t.is(data.hasMore, false, 'hasMore should be false when all items fit')
    })

    await n.test('each miner should have clean formatted fields', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const { body: data } = await httpClient.get(minersApi, { headers, encoding })
      const miner = data.data[0]

      t.ok(miner.id, 'should have id')
      t.ok(miner.type, 'should have type')
      t.ok(miner.model, 'should have model')
      t.ok(miner.code, 'should have code')
      t.ok(miner.ip, 'should have ip')
      t.ok(miner.container, 'should have container')
      t.ok(miner.rack, 'should have rack')
      t.ok(miner.status !== undefined, 'should have status')
      t.ok(typeof miner.hashrate === 'number', 'hashrate should be a number')
      t.ok(typeof miner.power === 'number', 'power should be a number')
      t.ok(typeof miner.efficiency === 'number', 'efficiency should be a number')
      t.ok(miner.temperature !== undefined, 'should have temperature')
      t.ok(miner.firmware, 'should have firmware')
      t.ok(miner.powerMode, 'should have powerMode')
      t.ok(miner.ledStatus !== undefined, 'should have ledStatus')
      t.ok(miner.poolConfig, 'should have poolConfig')
      t.ok(miner.lastSeen, 'should have lastSeen')
    })

    await n.test('formatted miner should have correct values from raw data', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const { body: data } = await httpClient.get(minersApi, { headers, encoding })

      const miner = data.data.find(m => m.id === 'miner-001')
      t.ok(miner, 'should find miner-001')
      t.is(miner.id, 'miner-001')
      t.is(miner.type, 'antminer-s19')
      t.is(miner.model, 'Antminer S19 XP')
      t.is(miner.code, 'M001')
      t.is(miner.ip, '192.168.1.100')
      t.is(miner.container, 'container-A')
      t.is(miner.rack, 'rack-1')
      t.is(miner.status, 'online')
      t.is(miner.hashrate, 140000)
      t.is(miner.power, 3010)
      t.is(miner.efficiency, 21.5)
      t.is(miner.temperature, 65)
      t.is(miner.firmware, '2024.01.01')
      t.is(miner.powerMode, 'normal')
    })
  })

  // --- Pagination tests ---

  await main.test('Api: miners - pagination', async (n) => {
    await n.test('should respect limit parameter', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const api = `${minersApi}?limit=2`
      const { body: data } = await httpClient.get(api, { headers, encoding })

      t.is(data.data.length, 2, 'should return only 2 items')
      t.is(data.totalCount, 5, 'totalCount should still be 5')
      t.is(data.limit, 2, 'limit should be 2')
      t.is(data.hasMore, true, 'hasMore should be true')
    })

    await n.test('should respect offset parameter', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const api = `${minersApi}?offset=3&limit=10`
      const { body: data } = await httpClient.get(api, { headers, encoding })

      t.is(data.data.length, 2, 'should return remaining 2 items')
      t.is(data.totalCount, 5, 'totalCount should still be 5')
      t.is(data.offset, 3, 'offset should be 3')
      t.is(data.hasMore, false, 'hasMore should be false')
    })

    await n.test('should return empty page when offset exceeds total', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const api = `${minersApi}?offset=100`
      const { body: data } = await httpClient.get(api, { headers, encoding })

      t.is(data.data.length, 0, 'should return 0 items')
      t.is(data.totalCount, 5, 'totalCount should still be 5')
      t.is(data.hasMore, false, 'hasMore should be false')
    })

    await n.test('should cap limit at MAX_LIMIT (200)', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const api = `${minersApi}?limit=500`
      const { body: data } = await httpClient.get(api, { headers, encoding })

      t.ok(data.limit <= 200, 'limit should be capped at 200')
    })
  })

  // --- Filter tests ---
  // Note: Filtering is done on the ork side via mingo. The mock RPC returns
  // all miners regardless of query. These tests verify the API accepts filter
  // params correctly and returns valid responses. Filter logic is covered
  // by unit tests in miners.handlers.test.js and queryUtils.test.js.

  await main.test('Api: miners - filtering', async (n) => {
    await n.test('should accept filter param and return valid response', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const filter = JSON.stringify({ status: 'online' })
      const api = `${minersApi}?filter=${encodeURIComponent(filter)}`
      const { body: data } = await httpClient.get(api, { headers, encoding })

      t.ok(Array.isArray(data.data), 'should return data array')
      t.ok(typeof data.totalCount === 'number', 'should have totalCount')
    })

    await n.test('should accept $or filter without error', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const filter = JSON.stringify({ $or: [{ status: 'error' }, { status: 'sleep' }] })
      const api = `${minersApi}?filter=${encodeURIComponent(filter)}`
      const { body: data } = await httpClient.get(api, { headers, encoding })

      t.ok(Array.isArray(data.data), 'should return data array')
    })

    await n.test('should return error for invalid filter JSON', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const api = `${minersApi}?filter=not-valid-json`
      try {
        await httpClient.get(api, { headers, encoding })
        t.fail('Expected error for invalid JSON')
      } catch (e) {
        t.ok(e.response.message.includes('ERR_FILTER_INVALID_JSON'), 'should return filter JSON error')
      }
    })
  })

  // --- Sort tests ---

  await main.test('Api: miners - sorting', async (n) => {
    await n.test('should sort by hashrate descending', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const sort = JSON.stringify({ hashrate: -1 })
      const api = `${minersApi}?sort=${encodeURIComponent(sort)}`
      const { body: data } = await httpClient.get(api, { headers, encoding })

      t.ok(data.data.length > 1, 'should return multiple items')
      for (let i = 1; i < data.data.length; i++) {
        t.ok(
          data.data[i - 1].hashrate >= data.data[i].hashrate,
          `hashrate should be descending: ${data.data[i - 1].hashrate} >= ${data.data[i].hashrate}`
        )
      }
    })

    await n.test('should sort by hashrate ascending', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const sort = JSON.stringify({ hashrate: 1 })
      const api = `${minersApi}?sort=${encodeURIComponent(sort)}`
      const { body: data } = await httpClient.get(api, { headers, encoding })

      t.ok(data.data.length > 1, 'should return multiple items')
      for (let i = 1; i < data.data.length; i++) {
        t.ok(
          data.data[i - 1].hashrate <= data.data[i].hashrate,
          `hashrate should be ascending: ${data.data[i - 1].hashrate} <= ${data.data[i].hashrate}`
        )
      }
    })

    await n.test('should return error for invalid sort JSON', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const api = `${minersApi}?sort=not-valid-json`
      try {
        await httpClient.get(api, { headers, encoding })
        t.fail('Expected error for invalid JSON')
      } catch (e) {
        t.ok(e.response.message.includes('ERR_SORT_INVALID_JSON'), 'should return sort JSON error')
      }
    })
  })

  // --- Search tests ---
  // Note: Search query is built into the RPC payload and executed on the ork.
  // The mock returns all miners regardless. These tests verify the API
  // accepts search params and the query is correctly built (unit-tested).

  await main.test('Api: miners - search', async (n) => {
    await n.test('should accept search param and return valid response', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const api = `${minersApi}?search=192.168`
      const { body: data } = await httpClient.get(api, { headers, encoding })

      t.ok(Array.isArray(data.data), 'should return data array')
      t.ok(typeof data.totalCount === 'number', 'should have totalCount')
    })

    await n.test('should accept search combined with other params', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const sort = JSON.stringify({ hashrate: -1 })
      const api = `${minersApi}?search=miner&sort=${encodeURIComponent(sort)}&limit=3`
      const { body: data } = await httpClient.get(api, { headers, encoding })

      t.ok(Array.isArray(data.data), 'should return data array')
      t.ok(data.data.length <= 3, 'should respect limit')
    })
  })

  // --- Combined query param tests ---

  await main.test('Api: miners - combined query params', async (n) => {
    await n.test('should accept filter, sort, and pagination together', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const filter = JSON.stringify({ status: 'online' })
      const sort = JSON.stringify({ hashrate: -1 })
      const api = `${minersApi}?filter=${encodeURIComponent(filter)}&sort=${encodeURIComponent(sort)}&limit=2&offset=0`
      const { body: data } = await httpClient.get(api, { headers, encoding })

      t.is(data.limit, 2, 'limit should be 2')
      t.ok(data.data.length <= 2, 'should return at most 2 items')
      if (data.data.length > 1) {
        t.ok(data.data[0].hashrate >= data.data[1].hashrate, 'should be sorted by hashrate desc')
      }
    })

    await n.test('should accept all query params together without error', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const filter = JSON.stringify({ status: 'online' })
      const sort = JSON.stringify({ temperature: 1 })
      const fields = JSON.stringify({ status: 1, ip: 1, temperature: 1 })
      const api = `${minersApi}?filter=${encodeURIComponent(filter)}&sort=${encodeURIComponent(sort)}&fields=${encodeURIComponent(fields)}&search=192&limit=3&offset=0`
      const { body: data } = await httpClient.get(api, { headers, encoding })

      t.ok(Array.isArray(data.data), 'should return data array')
      t.ok(data.data.length <= 3, 'should respect limit')
      t.is(data.offset, 0, 'offset should be 0')
      // Verify projection: only requested fields + id should be present
      if (data.data.length > 0) {
        const miner = data.data[0]
        t.ok(miner.id, 'should always include id')
        t.ok(miner.status !== undefined, 'should include requested field: status')
        t.ok(miner.ip !== undefined, 'should include requested field: ip')
        t.is(miner.hashrate, undefined, 'should exclude non-requested field: hashrate')
        t.is(miner.power, undefined, 'should exclude non-requested field: power')
        t.is(miner.firmware, undefined, 'should exclude non-requested field: firmware')
      }
    })
  })

  // --- overwriteCache tests ---

  await main.test('Api: miners - overwriteCache', async (n) => {
    await n.test('should accept overwriteCache=true without error', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const api = `${minersApi}?overwriteCache=true`
      try {
        const { body: data } = await httpClient.get(api, { headers, encoding })
        t.ok(data.data, 'should return data')
        t.pass()
      } catch (e) {
        t.fail(`Expected success but got: ${e.message || e}`)
      }
    })
  })

  // --- Pool enrichment tests ---

  await main.test('Api: miners - pool enrichment', async (n) => {
    await n.test('should include poolHashrate when poolStats feature is enabled', async (t) => {
      worker.worker.conf.featureConfig = { poolStats: true }

      const originalJRequest = worker.worker.net_r0.jRequest
      worker.worker.net_r0.jRequest = (publicKey, method) => {
        if (method === 'listThings') {
          return Promise.resolve(mockMiners)
        }
        if (method === 'getWrkExtData') {
          return Promise.resolve([{
            workers: {
              'miner-001': { hashrate: 139500 },
              M002: { hashrate: 134000 }
            }
          }])
        }
        return Promise.resolve({})
      }

      const headers = await createAuthHeaders(siteOperatorUser)
      const api = `${minersApi}?overwriteCache=true`
      const { body: data } = await httpClient.get(api, { headers, encoding })

      const miner1 = data.data.find(m => m.id === 'miner-001')
      t.ok(miner1, 'should find miner-001')
      t.is(miner1.poolHashrate, 139500, 'miner-001 should have poolHashrate from pool data')

      const miner2 = data.data.find(m => m.id === 'miner-002')
      t.ok(miner2, 'should find miner-002')
      t.is(miner2.poolHashrate, 134000, 'miner-002 should have poolHashrate matched by code')

      worker.worker.conf.featureConfig = {}
      worker.worker.net_r0.jRequest = originalJRequest
    })

    await n.test('should not include poolHashrate when poolStats feature is disabled', async (t) => {
      worker.worker.conf.featureConfig = {}
      const headers = await createAuthHeaders(siteOperatorUser)
      const api = `${minersApi}?overwriteCache=true`
      const { body: data } = await httpClient.get(api, { headers, encoding })

      const miner = data.data[0]
      t.is(miner.poolHashrate, undefined, 'poolHashrate should not be present')
    })
  })

  // --- Error/edge case handling ---

  await main.test('Api: miners - edge cases', async (n) => {
    await n.test('should handle empty RPC response gracefully', async (t) => {
      const originalJRequest = worker.worker.net_r0.jRequest
      worker.worker.net_r0.jRequest = (publicKey, method) => {
        if (method === 'listThings') return Promise.resolve([])
        return Promise.resolve({})
      }

      const headers = await createAuthHeaders(siteOperatorUser)
      const api = `${minersApi}?overwriteCache=true`
      const { body: data } = await httpClient.get(api, { headers, encoding })

      t.is(data.data.length, 0, 'should return empty data array')
      t.is(data.totalCount, 0, 'totalCount should be 0')
      t.is(data.hasMore, false, 'hasMore should be false')

      worker.worker.net_r0.jRequest = originalJRequest
    })

    await n.test('should return error for invalid fields JSON', async (t) => {
      const headers = await createAuthHeaders(siteOperatorUser)
      const api = `${minersApi}?fields=not-valid-json`
      try {
        await httpClient.get(api, { headers, encoding })
        t.fail('Expected error for invalid JSON')
      } catch (e) {
        t.ok(e.response.message.includes('ERR_FIELDS_INVALID_JSON'), 'should return fields JSON error')
      }
    })
  })
})
