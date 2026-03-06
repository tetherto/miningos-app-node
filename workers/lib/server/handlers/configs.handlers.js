'use strict'

const { requestRpcEachLimit } = require('../../utils')
const { CONFIG_TYPES } = require('../../constants')

const VALID_CONFIG_TYPES = Object.values(CONFIG_TYPES)

function validateConfigType (type) {
  if (!type || !VALID_CONFIG_TYPES.includes(type)) {
    throw new Error('ERR_CONFIG_TYPE_INVALID')
  }
}

async function getConfigs (ctx, req) {
  const { type } = req.params
  validateConfigType(type)

  const payload = { type }

  if (req.query.query) {
    try {
      payload.query = JSON.parse(req.query.query)
    } catch {
      throw new Error('ERR_QUERY_INVALID_JSON')
    }
  }

  if (req.query.fields) {
    try {
      payload.fields = JSON.parse(req.query.fields)
    } catch {
      throw new Error('ERR_FIELDS_INVALID_JSON')
    }
  }

  return await requestRpcEachLimit(ctx, 'getConfigs', payload, (res, resultsArray) => {
    if (res.error) {
      console.error(new Date().toISOString(), res.error)
    } else if (Array.isArray(res)) {
      resultsArray.push(...res)
    }
  })
}

module.exports = {
  getConfigs
}
