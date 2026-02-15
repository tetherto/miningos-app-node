'use strict'

const schemas = {
  query: {
    energyBalance: {
      type: 'object',
      properties: {
        start: { type: 'integer' },
        end: { type: 'integer' },
        period: { type: 'string', enum: ['daily', 'monthly', 'yearly'] },
        overwriteCache: { type: 'boolean' }
      },
      required: ['start', 'end']
    },
    ebitda: {
      type: 'object',
      properties: {
        start: { type: 'integer' },
        end: { type: 'integer' },
        period: { type: 'string', enum: ['daily', 'monthly', 'yearly'] },
        overwriteCache: { type: 'boolean' }
      },
      required: ['start', 'end']
    }
  }
}

module.exports = schemas
