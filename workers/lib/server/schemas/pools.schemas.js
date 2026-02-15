'use strict'

const schemas = {
  query: {
    pools: {
      type: 'object',
      properties: {
        query: { type: 'string' },
        sort: { type: 'string' },
        fields: { type: 'string' },
        overwriteCache: { type: 'boolean' }
      }
    }
  }
}

module.exports = schemas
