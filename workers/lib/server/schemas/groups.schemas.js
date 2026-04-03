'use strict'

const schemas = {
  query: {
    groupsStats: {
      type: 'object',
      properties: {
        containers: { type: 'string' },
        overwriteCache: { type: 'boolean' }
      },
      required: ['containers']
    }
  }
}

module.exports = schemas
