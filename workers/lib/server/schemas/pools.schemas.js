'use strict'

const schemas = {
  query: {
    poolStatsAggregate: {
      type: 'object',
      properties: {
        start: { type: 'integer' },
        end: { type: 'integer' },
        range: { type: 'string', enum: ['daily', 'weekly', 'monthly'] },
        pool: { type: 'string' },
        overwriteCache: { type: 'boolean' }
      },
      required: ['start', 'end']
    }
  }
}

module.exports = schemas
