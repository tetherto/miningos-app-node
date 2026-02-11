'use strict'

const schemas = {
  query: {
    balanceHistory: {
      type: 'object',
      properties: {
        start: { type: 'integer' },
        end: { type: 'integer' },
        range: { type: 'string', enum: ['1D', '1W', '1M'] },
        overwriteCache: { type: 'boolean' }
      },
      required: ['start', 'end']
    }
  }
}

module.exports = schemas
