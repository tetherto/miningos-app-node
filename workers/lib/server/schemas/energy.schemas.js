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
    },
    forecastSettings: {
      type: 'object',
      properties: {
        miningRevenueTaxFees: {
          type: 'object'
        },
        sellingEnergyTaxFees: {
          type: 'object'
        },
        buyingEnergyTaxFees: {
          type: 'object'
        },
        lcoe: {
          type: 'object'
        },
        siteEfficiency: {
          type: 'object'
        }
      },
      required: [
        'miningRevenueTaxFees',
        'sellingEnergyTaxFees',
        'buyingEnergyTaxFees',
        'lcoe',
        'siteEfficiency'
      ]
    }
  }
}

module.exports = schemas
