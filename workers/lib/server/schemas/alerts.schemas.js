'use strict'

const schemas = {
  query: {
    siteAlerts: {
      type: 'object',
      properties: {
        filter: { type: 'string' },
        sort: { type: 'string' },
        search: { type: 'string' },
        offset: { type: 'integer' },
        limit: { type: 'integer' },
        overwriteCache: { type: 'boolean' }
      }
    },
    alertsHistory: {
      type: 'object',
      properties: {
        start: { type: 'integer' },
        end: { type: 'integer' },
        filter: { type: 'string' },
        search: { type: 'string' },
        sort: { type: 'string' },
        offset: { type: 'integer' },
        limit: { type: 'integer' },
        overwriteCache: { type: 'boolean' }
      },
      required: ['start', 'end']
    }
  }
}

module.exports = schemas
