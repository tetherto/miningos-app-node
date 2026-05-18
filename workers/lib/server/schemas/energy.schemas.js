'use strict'

const schemas = {
  body: {
    availableEnergy: {
      type: 'object',
      properties: {
        data: {
          type: 'array'
        }
      },
      required: ['data']
    }
  }
}

module.exports = schemas
