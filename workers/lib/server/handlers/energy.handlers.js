'use strict'

const { WORKER_TYPES, RPC_METHODS, ELECTRICITY_EXT_DATA_KEYS } = require('../../constants')

const getEnergyForecast = async (ctx, req) => {
  return await ctx.dataProxy.requestDataMap(
    RPC_METHODS.GET_WRK_EXT_DATA,
    {
      type: WORKER_TYPES.ELECTRICITY,
      query: { key: ELECTRICITY_EXT_DATA_KEYS.FORECAST }
    })
}

const setAvailableEnergy = async (ctx, req) => {
  return await ctx.dataProxy.requestDataMap(
    RPC_METHODS.SET_WRK_EXT_DATA,
    {
      type: WORKER_TYPES.ELECTRICITY,
      key: ELECTRICITY_EXT_DATA_KEYS.AVAIL_ENERGY_MWH,
      value: req.body.data
    })
}

module.exports = {
  getEnergyForecast,
  setAvailableEnergy
}
