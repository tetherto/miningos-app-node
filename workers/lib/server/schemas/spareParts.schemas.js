'use strict'

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

module.exports = { update, repairHistory }
