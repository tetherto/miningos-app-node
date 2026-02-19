'use strict'

const schemas = {
  query: {
    hashrate: {
      type: 'object',
      properties: {
        start: { type: 'integer' },
        end: { type: 'integer' },
        overwriteCache: { type: 'boolean' }
      },
      required: ['start', 'end']
    },
    consumption: {
      type: 'object',
      properties: {
        start: { type: 'integer' },
        end: { type: 'integer' },
        overwriteCache: { type: 'boolean' }
      },
      required: ['start', 'end']
    },
    efficiency: {
      type: 'object',
      properties: {
        start: { type: 'integer' },
        end: { type: 'integer' },
        overwriteCache: { type: 'boolean' }
      },
      required: ['start', 'end']
    },
    minerStatus: {
      type: 'object',
      properties: {
        start: { type: 'integer' },
        end: { type: 'integer' },
        overwriteCache: { type: 'boolean' }
      },
      required: ['start', 'end']
    },
    powerMode: {
      type: 'object',
      properties: {
        start: { type: 'integer' },
        end: { type: 'integer' },
        interval: { type: 'string', enum: ['1h', '1d', '1w'] },
        overwriteCache: { type: 'boolean' }
      },
      required: ['start', 'end']
    },
    powerModeTimeline: {
      type: 'object',
      properties: {
        start: { type: 'integer' },
        end: { type: 'integer' },
        container: { type: 'string' },
        limit: { type: 'integer' },
        overwriteCache: { type: 'boolean' }
      }
    },
    temperature: {
      type: 'object',
      properties: {
        start: { type: 'integer' },
        end: { type: 'integer' },
        interval: { type: 'string', enum: ['1h', '1d', '1w'] },
        container: { type: 'string' },
        overwriteCache: { type: 'boolean' }
      },
      required: ['start', 'end']
    }
  }
}

module.exports = schemas
