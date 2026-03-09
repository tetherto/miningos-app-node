'use strict'

const test = require('brittle')
const fs = require('fs')
const { createWorker } = require('tether-svc-test-helper').worker
const { setTimeout: sleep } = require('timers/promises')
const HttpFacility = require('bfx-facs-http')

test('Pool Manager API', { timeout: 90000 }, async (main) => {
  const baseDir = 'tests/integration'
  let worker
  let httpClient
  const appNodePort = 5001
  const ip = '127.0.0.1'
  const appNodeBaseUrl = `http://${ip}:${appNodePort}`
  const testUser = 'poolmanager@test'
  const encoding = 'json'

  main.teardown(async () => {
    await httpClient.stop()
    await worker.stop()
    await sleep(2000)
    fs.rmSync(`./${baseDir}/store`, { recursive: true, force: true })
    fs.rmSync(`./${baseDir}/status`, { recursive: true, force: true })
    fs.rmSync(`./${baseDir}/config`, { recursive: true, force: true })
    fs.rmSync(`./${baseDir}/db`, { recursive: true, force: true })
  })

  const createConfig = () => {
    if (!fs.existsSync(`./${baseDir}/config/facs`)) {
      if (!fs.existsSync(`./${baseDir}/config`)) fs.mkdirSync(`./${baseDir}/config`)
      fs.mkdirSync(`./${baseDir}/config/facs`)
    }
    if (!fs.existsSync(`./${baseDir}/db`)) fs.mkdirSync(`./${baseDir}/db`)

    const commonConf = {
      dir_log: 'logs',
      debug: 0,
      orks: { 'cluster-1': { region: 'AB', rpcPublicKey: '' } },
      cacheTiming: {},
      featureConfig: {}
    }
    const netConf = { r0: {} }
    const httpdConf = { h0: {} }
    const httpdOauthConf = {
      h0: {
        method: 'google',
        credentials: { client: { id: 'i', secret: 's' } },
        users: [{ email: testUser, write: true }]
      }
    }
    const authConf = require('../../config/facs/auth.config.json')
    fs.writeFileSync(`./${baseDir}/config/common.json`, JSON.stringify(commonConf))
    fs.writeFileSync(`./${baseDir}/config/facs/net.config.json`, JSON.stringify(netConf))
    fs.writeFileSync(`./${baseDir}/config/facs/httpd.config.json`, JSON.stringify(httpdConf))
    fs.writeFileSync(`./${baseDir}/config/facs/httpd-oauth2.config.json`, JSON.stringify(httpdOauthConf))
    fs.writeFileSync(`./${baseDir}/config/facs/auth.config.json`, JSON.stringify(authConf))
  }

  const mockMiners = [
    {
      id: 'miner-001',
      info: { model: 'Antminer S19 XP', ip_address: '192.168.1.100' },
      snap: {
        ts: Date.now(),
        config: {
          pool_config: [
            { url: 'stratum+tcp://btc.f2pool.com:3333', username: 'tether.worker1' }
          ]
        },
        stats: {
          status: 'mining',
          pool_status: [{ pool: 'btc.f2pool.com:3333', status: 'Alive', accepted: 100, rejected: 1 }],
          hashrate_mhs: { t_5m: 140000 }
        }
      },
      tags: { unit: 'unit-A', rack: 'rack-1' },
      alerts: {}
    },
    {
      id: 'miner-002',
      info: { model: 'Antminer S19 XP', ip_address: '192.168.1.101' },
      snap: {
        ts: Date.now(),
        config: {
          pool_config: [
            { url: 'stratum+tcp://btc.f2pool.com:3333', username: 'tether.worker2' }
          ]
        },
        stats: {
          status: 'mining',
          pool_status: [{ pool: 'btc.f2pool.com:3333', status: 'Alive', accepted: 150, rejected: 2 }],
          hashrate_mhs: { t_5m: 145000 }
        }
      },
      tags: { unit: 'unit-A', rack: 'rack-1' },
      alerts: {}
    },
    {
      id: 'miner-003',
      info: { model: 'Whatsminer M50S', ip_address: '192.168.1.102' },
      snap: {
        ts: Date.now(),
        config: {
          pool_config: [
            { url: 'stratum+tcp://ocean.xyz:3333', username: 'tether.worker3' }
          ]
        },
        stats: {
          status: 'mining',
          pool_status: [{ pool: 'ocean.xyz:3333', status: 'Alive', accepted: 200, rejected: 3 }],
          hashrate_mhs: { t_5m: 130000 }
        }
      },
      tags: { unit: 'unit-B', rack: 'rack-2' },
      alerts: { wrong_miner_pool: { ts: Date.now() } }
    }
  ]

  const startWorker = async () => {
    worker = createWorker({
      env: 'test',
      wtype: 'wrk-node-dashboard-test',
      rack: 'test-rack',
      tmpdir: baseDir,
      storeDir: 'test-store',
      serviceRoot: `${process.cwd()}/${baseDir}`,
      port: appNodePort
    })

    await worker.start()
    worker.worker.net_r0.jRequest = (publicKey, method, params) => {
      if (method === 'listThings') {
        return Promise.resolve(mockMiners)
      }
      if (method === 'getWrkExtData') {
        return Promise.resolve([{
          stats: [
            {
              poolType: 'f2pool',
              username: 'tether.worker1',
              hashrate: 285000,
              hashrate_1h: 280000,
              hashrate_24h: 275000,
              worker_count: 3,
              active_workers_count: 2,
              balance: 0.005,
              unsettled: 0.001,
              revenue_24h: 0.0002,
              yearlyBalances: [],
              timestamp: Date.now()
            }
          ]
        }])
      }
      return Promise.resolve([])
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

  createConfig()
  await startWorker()
  await createHttpClient()
  await sleep(2000)

  const baseParams = 'regions=["AB"]'

  await main.test('Api: auth/pool-manager/stats', async (n) => {
    const api = `${appNodeBaseUrl}/auth/pool-manager/stats?${baseParams}`

    await n.test('api should fail for missing auth token', async (t) => {
      try {
        await httpClient.get(api, { encoding })
        t.fail()
      } catch (e) {
        t.is(e.response.message.includes('ERR_AUTH_FAIL'), true)
      }
    })

    await n.test('api should succeed and return stats', async (t) => {
      const token = await getTestToken(testUser)
      const headers = { Authorization: `Bearer ${token}` }
      try {
        const res = await httpClient.get(api, { headers, encoding })
        t.ok(res.body)
        t.ok(typeof res.body.totalPools === 'number')
        t.ok(typeof res.body.totalWorkers === 'number')
        t.ok(typeof res.body.errors === 'number')
        t.pass()
      } catch (e) {
        console.error('Stats error:', e)
        t.fail()
      }
    })
  })

  await main.test('Api: auth/pool-manager/pools', async (n) => {
    const api = `${appNodeBaseUrl}/auth/pool-manager/pools?${baseParams}`

    await n.test('api should fail for missing auth token', async (t) => {
      try {
        await httpClient.get(api, { encoding })
        t.fail()
      } catch (e) {
        t.is(e.response.message.includes('ERR_AUTH_FAIL'), true)
      }
    })

    await n.test('api should succeed and return pools list', async (t) => {
      const token = await getTestToken(testUser)
      const headers = { Authorization: `Bearer ${token}` }
      try {
        const res = await httpClient.get(api, { headers, encoding })
        t.ok(res.body)
        t.ok(Array.isArray(res.body.pools))
        t.ok(typeof res.body.total === 'number')
        if (res.body.pools.length > 0) {
          t.ok(res.body.pools[0].pool)
          t.ok(res.body.pools[0].name)
        }
        t.pass()
      } catch (e) {
        console.error('Pools error:', e)
        t.fail()
      }
    })
  })

  await main.test('Api: auth/pool-manager/miners', async (n) => {
    const api = `${appNodeBaseUrl}/auth/pool-manager/miners?${baseParams}`

    await n.test('api should fail for missing auth token', async (t) => {
      try {
        await httpClient.get(api, { encoding })
        t.fail()
      } catch (e) {
        t.is(e.response.message.includes('ERR_AUTH_FAIL'), true)
      }
    })

    await n.test('api should succeed and return paginated miners', async (t) => {
      const token = await getTestToken(testUser)
      const headers = { Authorization: `Bearer ${token}` }
      try {
        const res = await httpClient.get(api, { headers, encoding })
        t.ok(res.body)
        t.ok(Array.isArray(res.body.miners))
        t.ok(typeof res.body.total === 'number')
        t.ok(typeof res.body.page === 'number')
        t.ok(typeof res.body.limit === 'number')
        t.pass()
      } catch (e) {
        console.error('Miners error:', e)
        t.fail()
      }
    })

    await n.test('api should support pagination params', async (t) => {
      const token = await getTestToken(testUser)
      const headers = { Authorization: `Bearer ${token}` }
      const paginatedApi = `${api}&page=1&limit=10`
      try {
        const res = await httpClient.get(paginatedApi, { headers, encoding })
        t.is(res.body.page, 1)
        t.is(res.body.limit, 10)
        t.pass()
      } catch (e) {
        console.error('Pagination error:', e)
        t.fail()
      }
    })
  })

  await main.test('Api: auth/pool-manager/units', async (n) => {
    const api = `${appNodeBaseUrl}/auth/pool-manager/units?${baseParams}`

    await n.test('api should fail for missing auth token', async (t) => {
      try {
        await httpClient.get(api, { encoding })
        t.fail()
      } catch (e) {
        t.is(e.response.message.includes('ERR_AUTH_FAIL'), true)
      }
    })

    await n.test('api should succeed and return units list', async (t) => {
      const token = await getTestToken(testUser)
      const headers = { Authorization: `Bearer ${token}` }
      try {
        const res = await httpClient.get(api, { headers, encoding })
        t.ok(res.body)
        t.ok(Array.isArray(res.body.units))
        t.ok(typeof res.body.total === 'number')
        t.pass()
      } catch (e) {
        console.error('Units error:', e)
        t.fail()
      }
    })
  })

  await main.test('Api: auth/pool-manager/alerts', async (n) => {
    const api = `${appNodeBaseUrl}/auth/pool-manager/alerts?${baseParams}`

    await n.test('api should fail for missing auth token', async (t) => {
      try {
        await httpClient.get(api, { encoding })
        t.fail()
      } catch (e) {
        t.is(e.response.message.includes('ERR_AUTH_FAIL'), true)
      }
    })

    await n.test('api should succeed and return alerts list', async (t) => {
      const token = await getTestToken(testUser)
      const headers = { Authorization: `Bearer ${token}` }
      try {
        const res = await httpClient.get(api, { headers, encoding })
        t.ok(res.body)
        t.ok(Array.isArray(res.body.alerts))
        t.ok(typeof res.body.total === 'number')
        if (res.body.alerts.length > 0) {
          t.ok(res.body.alerts[0].type)
          t.ok(res.body.alerts[0].minerId)
          t.ok(res.body.alerts[0].severity)
        }
        t.pass()
      } catch (e) {
        console.error('Alerts error:', e)
        t.fail()
      }
    })
  })

})
