'use strict'

const register = {
  body: {
    type: 'object',
    required: ['rackId', 'info'],
    additionalProperties: false,
    properties: {
      rackId: { type: 'string', minLength: 1 },
      info: {
        type: 'object',
        additionalProperties: true,
        minProperties: 1,
        required: ['deviceType']
      }
    }
  }
}

const update = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', minLength: 1 } }
  },
  body: {
    type: 'object',
    required: ['rackId', 'info'],
    additionalProperties: false,
    properties: {
      rackId: { type: 'string', minLength: 1 },
      workOrderId: { type: 'string', minLength: 1 },
      info: {
        type: 'object',
        additionalProperties: true,
        minProperties: 1
      }
    }
  }
}

const repairHistory = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', minLength: 1 } }
  },
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 200 },
      offset: { type: 'integer', minimum: 0 },
      overwriteCache: { type: 'boolean' }
    }
  }
}

const list = {
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      query: { type: 'string' },
      sort: { type: 'string' },
      fields: { type: 'string' },
      offset: { type: 'integer', minimum: 0 },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
      q: { type: 'string', minLength: 1, maxLength: 200 },
      location: { type: 'string', minLength: 1, maxLength: 100 },
      status: { type: 'string', minLength: 1, maxLength: 100 },
      overwriteCache: { type: 'boolean' }
    }
  }
}

module.exports = { register, list, update, repairHistory }
