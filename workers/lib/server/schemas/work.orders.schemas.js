'use strict'

const types = { type: 'integer', enum: [1, 2] }

const warranty = {
  type: ['object', 'null'],
  properties: {
    vendor: { type: ['string', 'null'] },
    fields: { type: 'object', additionalProperties: true }
  }
}

const create = {
  body: {
    type: 'object',
    required: ['type', 'deviceType', 'deviceModel', 'deviceIdentifier'],
    additionalProperties: false,
    properties: {
      type: types,
      deviceType: { type: 'string', minLength: 1, maxLength: 100 },
      deviceModel: { type: 'string', minLength: 1, maxLength: 100 },
      deviceIdentifier: { type: 'string', minLength: 1, maxLength: 200 },
      issue: { type: 'string', minLength: 1, maxLength: 2000 },
      assignedTo: { type: ['string', 'null'], maxLength: 200 },
      warranty,
      info: {
        type: 'object',
        additionalProperties: false,
        properties: {
          notes: { type: 'string', maxLength: 4000 },
          remarks: { type: 'string', maxLength: 4000 },
          site: { type: 'string', maxLength: 200 },
          location: { type: 'string', maxLength: 200 }
        }
      }
    },
    if: { properties: { type: { const: 2 } } },
    then: { required: ['issue'] }
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
      assignee: { type: 'string', minLength: 1, maxLength: 200 },
      creator: { type: 'string', minLength: 1, maxLength: 200 },
      partId: { type: 'string', minLength: 1, maxLength: 200 },
      status: { type: 'string', enum: ['open', 'in_progress', 'closed', 'cancelled'] },
      type: types,
      from: { type: 'integer', minimum: 0 },
      to: { type: 'integer', minimum: 0 },
      overwriteCache: { type: 'boolean' }
    }
  }
}

const byId = {
  params: {
    type: 'object',
    required: ['id'],
    properties: { id: { type: 'string', minLength: 1 } }
  }
}

const update = {
  params: byId.params,
  body: {
    type: 'object',
    additionalProperties: false,
    minProperties: 1,
    properties: {
      issue: { type: 'string', minLength: 1, maxLength: 2000 },
      deviceType: { type: 'string', minLength: 1, maxLength: 100 },
      deviceModel: { type: 'string', minLength: 1, maxLength: 100 },
      deviceIdentifier: { type: 'string', minLength: 1, maxLength: 200 },
      assignedTo: { type: ['string', 'null'], maxLength: 200 },
      finalResult: { type: ['string', 'null'], maxLength: 4000 },
      warranty,
      info: {
        type: 'object',
        additionalProperties: false,
        properties: {
          notes: { type: 'string', maxLength: 4000 },
          remarks: { type: 'string', maxLength: 4000 },
          site: { type: 'string', maxLength: 200 },
          location: { type: 'string', maxLength: 200 }
        }
      }
    }
  }
}

const close = {
  params: byId.params,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: { finalResult: { type: 'string', minLength: 1, maxLength: 4000 } }
  }
}

const cancel = {
  params: byId.params,
  body: {
    type: 'object',
    additionalProperties: false,
    properties: { reason: { type: 'string', minLength: 1, maxLength: 2000 } }
  }
}

const assign = {
  params: byId.params,
  body: {
    type: 'object',
    required: ['assignedTo'],
    additionalProperties: false,
    properties: { assignedTo: { type: ['string', 'null'], maxLength: 200 } }
  }
}

const log = {
  params: byId.params,
  body: {
    type: 'object',
    required: ['text'],
    additionalProperties: false,
    properties: { text: { type: 'string', minLength: 1, maxLength: 4000 } }
  }
}

const audit = {
  params: byId.params,
  querystring: {
    type: 'object',
    additionalProperties: false,
    properties: {
      limit: { type: 'integer', minimum: 1, maximum: 500 },
      offset: { type: 'integer', minimum: 0 },
      start: { type: 'integer' },
      end: { type: 'integer' }
    }
  }
}

const exportRoute = {
  params: byId.params,
  querystring: {
    type: 'object',
    required: ['format'],
    additionalProperties: false,
    properties: {
      format: { type: 'string', enum: ['pdf', 'csv', 'docx'] }
    }
  }
}

module.exports = { create, list, byId, update, close, cancel, assign, audit, log, export: exportRoute }
