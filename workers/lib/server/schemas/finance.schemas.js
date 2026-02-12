'use strict'

const schemas = {
  query: {
    ebitda: {
      type: 'object',
      properties: {
        start: { type: 'integer' },
        end: { type: 'integer' },
        period: { type: 'string', enum: ['daily', 'monthly', 'yearly'] },
        site: { type: 'string' },
        overwriteCache: { type: 'boolean' }
      },
      required: ['start', 'end']
    }
  }
}

module.exports = schemas
