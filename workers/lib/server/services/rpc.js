'use strict'

const async = require('async')

const getData = async (ctx, clusters, method, params, timeout = 30000) => {
  return await async.mapLimit(clusters, 2, async (store, sid) => {
    return ctx.net_r0.jRequest(store.rpcPublicKey, method, params, { timeout })
  })
}

module.exports = {
  getData
}
