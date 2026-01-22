'use strict'

const async = require('async')
const { RPC_CONCURRENCY_LIMIT } = require('./constants')
class AlertsService {
  constructor ({ orks, net }) {
    this.orks = orks
    this.net = net
  }

  async broadcastAlerts (clients) {
    const alerts = await this.fetchAlerts()
    const payload = JSON.stringify(alerts)

    for (const client of clients) {
      if (client && client.readyState === 1 && client?.subscriptions.has('alerts')) {
        try {
          client.send(payload)
        } catch {
          clients.delete(client)
        }
      } else if (!client || client.readyState !== 1) {
        clients.delete(client)
      }
    }
  }

  async fetchAlerts (fetchAll = false) {
    const fiveSecondsAgo = Date.now() - 5000
    const query = {
      status: 1,
      query: {
        'last.alerts': { $ne: null },
        'last.alerts.createdAt': fetchAll ? { $exists: true } : { $gte: fiveSecondsAgo }
      },
      limit: 1000,
      fields: {
        'last.alerts': 1,
        'info.container': 1,
        type: 1,
        id: 1,
        code: 1
      }
    }

    try {
      const res = await async.mapLimit(this.orks, RPC_CONCURRENCY_LIMIT, async (store) => {
        return this.net.jRequest(
          store.rpcPublicKey,
          'listThings',
          query
        )
      })

      const alerts = []
      // res is an array of arrays (one array per ork), so we need to flatten it
      const things = res.flat()
      for (const thing of things) {
        if (Array.isArray(thing?.last?.alerts)) {
          for (const alert of thing.last.alerts) {
            if (alert && typeof alert === 'object' && !Array.isArray(alert)) {
              alerts.push({
                ...alert,
                id: thing.id,
                type: thing.type,
                code: thing.code,
                container: thing.info?.container
              })
            }
          }
        }
      }
      return alerts
    } catch (err) {
      console.error('[AlertsService] Error fetching alerts:', err)
      return []
    }
  }
}

module.exports = {
  AlertsService
}
