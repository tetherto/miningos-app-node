'use strict'

const { ENDPOINTS, HTTP_METHODS } = require('../../constants')
const {
  startMinerLogDownload,
  getMinerLogDownloadStatus,
  getMinerLogFile
} = require('../handlers/minerLogs.handlers')
const { createAuthOnRequest } = require('../lib/routeHelpers')

module.exports = (ctx) => [
  {
    method: HTTP_METHODS.POST,
    url: ENDPOINTS.MINER_DOWNLOAD_LOGS_START,
    schema: {
      params: {
        type: 'object',
        properties: {
          minerId: { type: 'string' }
        },
        required: ['minerId']
      }
    },
    onRequest: createAuthOnRequest(ctx),
    handler: (req, reply) => startMinerLogDownload(ctx, req, reply)
  },
  {
    method: HTTP_METHODS.GET,
    url: ENDPOINTS.MINER_DOWNLOAD_LOGS_STATUS,
    schema: {
      params: {
        type: 'object',
        properties: {
          minerId: { type: 'string' },
          jobId: { type: 'string' }
        },
        required: ['minerId', 'jobId']
      }
    },
    onRequest: createAuthOnRequest(ctx),
    handler: (req, reply) => getMinerLogDownloadStatus(ctx, req, reply)
  },
  {
    method: HTTP_METHODS.GET,
    url: ENDPOINTS.MINER_DOWNLOAD_LOGS_FILE,
    schema: {
      params: {
        type: 'object',
        properties: {
          minerId: { type: 'string' },
          jobId: { type: 'string' }
        },
        required: ['minerId', 'jobId']
      }
    },
    onRequest: createAuthOnRequest(ctx),
    handler: (req, reply) => getMinerLogFile(ctx, req, reply)
  }
]
