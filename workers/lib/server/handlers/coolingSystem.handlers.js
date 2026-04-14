'use strict'

const { COOLING_SYSTEM_PROJECTIONS } = require('../../constants')
const {
  isCentralDCSEnabled,
  getDCSTag,
  extractDcsThing,
  getSensorReading
} = require('../../dcs.utils')

function getFieldProjection (type, view) {
  const base = COOLING_SYSTEM_PROJECTIONS.base
  const typeProjections = COOLING_SYSTEM_PROJECTIONS[type]
  const viewProjection = typeProjections?.[view] || {}
  return { ...base, ...viewProjection }
}

function filterPumpsByCircuit (pumps, circuit) {
  return (pumps || []).filter(p => p.circuit === circuit)
}

function formatPump (pump) {
  return {
    id: pump.equipment,
    name: pump.equipment,
    status: pump.status,
    is_running: pump.FbkRunOut || false,
    speed: pump.speed,
    current: pump.current,
    has_fault: pump.Trip || false
  }
}

function buildMinersCircuit1View (equipment, config) {
  const pumps = equipment.pumps
  const temperatures = equipment.temperatures
  const pressures = equipment.pressures
  const flows = equipment.flows
  const heatExchangers = equipment.heat_exchangers
  const valves = equipment.valves
  const coolingConfig = config?.cooling_system?.miner_loop || {}
  const viewConfig = config?.cooling_system?.view_metadata?.miners?.circuit1 || {}

  const findHx = (hxId) => (heatExchangers || []).find(hx => hx.equipment === hxId)

  const lines = []
  const lineConfigs = [coolingConfig.line1, coolingConfig.line2].filter(Boolean)

  for (const lineConfig of lineConfigs) {
    const hx = findHx(lineConfig.heat_exchanger)

    lines.push({
      name: lineConfig.name,
      groups: lineConfig.groups,
      supply: {
        temperature: hx?.miner_side_out_temp || getSensorReading(temperatures, lineConfig.supply_temp_sensor, coolingConfig.defaults?.supply_temp),
        pressure: getSensorReading(pressures, lineConfig.supply_pressure_sensor),
        flow: getSensorReading(flows, lineConfig.supply_flow_sensor)
      },
      return: {
        temperature: getSensorReading(temperatures, lineConfig.return_temp_sensor, coolingConfig.defaults?.return_temp),
        pressure: getSensorReading(pressures, lineConfig.return_pressure_sensor)
      },
      heat_exchanger: hx
        ? {
            id: hx.equipment,
            name: hx.equipment,
            is_active: hx.is_active,
            miner_side_out_temp: hx.miner_side_out_temp,
            tower_side_in_temp: hx.tower_side_in_temp,
            tower_side_out_temp: hx.tower_side_out_temp,
            control_valve: {
              id: hx.tcv_id || lineConfig.control_valve,
              position: hx.tcv_position
            }
          }
        : null
    })
  }

  const bypassValveId = coolingConfig.control_valves?.pressure_bypass
  const bypassValve = valves?.find(v => v.equipment === bypassValveId)
  const controlValves = bypassValveId
    ? {
        pressure_bypass: {
          id: bypassValveId,
          position: bypassValve?.position
        }
      }
    : null

  const minerPumps = filterPumpsByCircuit(pumps, 'MINER_LOOP').map(formatPump)

  return {
    title: coolingConfig.name || viewConfig.title,
    description: coolingConfig.description || viewConfig.description,
    water_type: coolingConfig.water_type || viewConfig.water_type,
    target_supply_temp: coolingConfig.defaults?.supply_temp,
    target_return_temp: coolingConfig.defaults?.return_temp,
    lines,
    control_valves: controlValves,
    pumps: minerPumps
  }
}

function buildMinersCircuit2View (equipment, config) {
  const pumps = equipment.pumps
  const levels = equipment.levels
  const heatExchangers = equipment.heat_exchangers
  const coolingTowers = equipment.cooling_towers
  const valves = equipment.valves
  const tanks = equipment.tanks
  const towerConfig = config?.cooling_system?.cooling_tower_loop || {}
  const viewConfig = config?.cooling_system?.view_metadata?.miners?.circuit2 || {}

  const towerData = (coolingTowers || []).map(ct => ({
    id: ct.equipment,
    name: ct.equipment,
    is_running: ct.is_running,
    fan_status: ct.fan_status,
    fan_power: ct.fan_power,
    level: ct.level,
    vibration: ct.vibration
  }))

  const makeupConfig = towerConfig.makeup || {}
  const makeupTankId = makeupConfig.tank || tanks?.[0]?.equipment
  const makeupLevelValve = valves?.find(v => v.equipment === makeupConfig.level_control_valve)
  const makeupOnOffValves = makeupConfig.on_off_valves || []

  const makeupTank = {
    id: makeupTankId,
    name: makeupTankId,
    level: getSensorReading(levels, makeupConfig.level_sensor),
    level_control_valve: makeupConfig.level_control_valve
      ? {
          id: makeupConfig.level_control_valve,
          position: makeupLevelValve?.position
        }
      : null,
    on_off_valves: makeupOnOffValves.map(vid => {
      const valve = valves?.find(v => v.equipment === vid)
      return {
        id: vid,
        is_open: valve?.position?.value > 50
      }
    })
  }

  const hxTempSensors = {}
  for (const hx of (heatExchangers || [])) {
    hxTempSensors[hx.equipment] = {
      miner_side_out: hx.miner_side_out_temp,
      tower_side_in: hx.tower_side_in_temp,
      tower_side_out: hx.tower_side_out_temp
    }
  }

  const towerPumps = filterPumpsByCircuit(pumps, 'COOLING_TOWER').map(formatPump)

  return {
    title: towerConfig.name || viewConfig.title,
    description: towerConfig.description || viewConfig.description,
    water_type: towerConfig.water_type || viewConfig.water_type,
    cooling_towers: towerData,
    makeup_tank: makeupTank,
    heat_exchanger_temps: hxTempSensors,
    pumps: towerPumps
  }
}

function buildMinersLayoutView (equipment, config, stats) {
  const circuit1 = buildMinersCircuit1View(equipment, config)
  const circuit2 = buildMinersCircuit2View(equipment, config)
  const { pumps } = equipment
  const flowStats = stats?.flow || {}
  const viewConfig = config?.cooling_system?.view_metadata?.miners?.layout || {}

  return {
    title: viewConfig.title,
    description: viewConfig.description,
    summary: {
      total_miner_loop_flow: flowStats.miner_loop,
      total_tower_loop_flow: flowStats.cooling_tower,
      pumps_running: (pumps || []).filter(p => p.FbkRunOut).length,
      pumps_total: (pumps || []).length
    },
    circuit1: {
      name: circuit1.title,
      water_type: circuit1.water_type,
      lines: circuit1.lines,
      pumps: circuit1.pumps
    },
    circuit2: {
      name: circuit2.title,
      water_type: circuit2.water_type,
      cooling_towers: circuit2.cooling_towers,
      makeup_tank: circuit2.makeup_tank,
      pumps: circuit2.pumps
    }
  }
}

function buildHvacCircuit1View (equipment, config) {
  const pumps = equipment.pumps
  const temperatures = equipment.temperatures
  const pressures = equipment.pressures
  const flows = equipment.flows
  const levels = equipment.levels
  const chillers = equipment.chillers
  const fanCoils = equipment.fan_coils
  const valves = equipment.valves
  const tanks = equipment.tanks
  const flowSwitches = equipment.flow_switches
  const chilledConfig = config?.cooling_system?.hvac_chilled_water || {}
  const viewConfig = config?.cooling_system?.view_metadata?.hvac?.circuit1 || {}

  const chiller = chillers?.[0]
  const chillerData = chiller
    ? {
        id: chiller.equipment,
        name: chiller.equipment,
        is_running: chiller.is_running,
        mode: chiller.mode,
        cooling_capacity: chiller.cooling_capacity,
        power_consumption: chiller.power_consumption,
        evaporator_temp: chiller.evaporator_temp,
        condenser_temp: chiller.condenser_temp
      }
    : null

  const supplyReturnConfig = chilledConfig.supply_return || {}
  const supplyReturn = {
    supply: {
      temperature: getSensorReading(temperatures, supplyReturnConfig.supply_temp_sensor, chilledConfig.defaults?.supply_temp),
      flow: getSensorReading(flows, supplyReturnConfig.supply_flow_sensor),
      pressure: getSensorReading(pressures, supplyReturnConfig.pressure_sensor)
    },
    return: {
      temperature: getSensorReading(temperatures, supplyReturnConfig.return_temp_sensor, chilledConfig.defaults?.return_temp),
      flow: getSensorReading(flows, supplyReturnConfig.return_flow_sensor)
    },
    flow_switches: (flowSwitches || []).map(fs => ({
      id: fs.equipment,
      is_active: fs.is_active
    }))
  }

  const condenserConfig = chilledConfig.condenser || {}
  const condenser = {
    inlet: {
      temperature: getSensorReading(temperatures, condenserConfig.inlet_temp_sensor),
      flow: getSensorReading(flows, condenserConfig.inlet_flow_sensor)
    },
    outlet: {
      temperature: getSensorReading(temperatures, condenserConfig.outlet_temp_sensor),
      flow: getSensorReading(flows, condenserConfig.outlet_flow_sensor)
    }
  }

  const bufferConfig = chilledConfig.buffer_tank || {}
  const bufferTankId = bufferConfig.tank || tanks?.[0]?.equipment
  const makeupValve = valves?.find(v => v.equipment === bufferConfig.makeup_valve)
  const bufferTank = {
    id: bufferTankId,
    name: bufferTankId,
    level: getSensorReading(levels, bufferConfig.level_sensor),
    makeup_valve: bufferConfig.makeup_valve
      ? {
          id: bufferConfig.makeup_valve,
          position: makeupValve?.position
        }
      : null
  }

  const bypassValveId = chilledConfig.control_valves?.pressure_bypass
  const bypassValve = valves?.find(v => v.equipment === bypassValveId)
  const controlValves = bypassValveId
    ? {
        pressure_bypass: {
          id: bypassValveId,
          position: bypassValve?.position
        }
      }
    : null

  const returnPumps = filterPumpsByCircuit(pumps, 'HVAC_RETURN').map(formatPump)
  const supplyPumps = filterPumpsByCircuit(pumps, 'HVAC_SUPPLY').map(formatPump)

  const fanCoilsSummary = {
    total: (fanCoils || []).length,
    running: (fanCoils || []).filter(fc => fc.is_running).length,
    units: (fanCoils || []).map(fc => ({
      id: fc.equipment,
      is_running: fc.is_running,
      temperature: fc.temperature,
      valve_position: fc.valve_position
    }))
  }

  return {
    title: chilledConfig.name || viewConfig.title,
    description: chilledConfig.description || viewConfig.description,
    target_supply_temp: chilledConfig.defaults?.supply_temp,
    target_return_temp: chilledConfig.defaults?.return_temp,
    chiller: chillerData,
    supply_return: supplyReturn,
    condenser,
    buffer_tank: bufferTank,
    control_valves: controlValves,
    return_pumps: returnPumps,
    supply_pumps: supplyPumps,
    fan_coils: fanCoilsSummary
  }
}

function buildHvacCircuit2View (equipment, config) {
  const pumps = equipment.pumps
  const temperatures = equipment.temperatures
  const flows = equipment.flows
  const coolingTowers = equipment.cooling_towers
  const condenserConfig = config?.cooling_system?.hvac_condenser || {}
  const viewConfig = config?.cooling_system?.view_metadata?.hvac?.circuit2 || {}

  const supplyReturnConfig = condenserConfig.supply_return || {}
  const supplyReturn = {
    supply: {
      temperature: getSensorReading(temperatures, supplyReturnConfig.supply_temp_sensor, condenserConfig.defaults?.supply_temp),
      flow: getSensorReading(flows, supplyReturnConfig.supply_flow_sensor)
    },
    return: {
      temperature: getSensorReading(temperatures, supplyReturnConfig.return_temp_sensor, condenserConfig.defaults?.return_temp),
      flow: getSensorReading(flows, supplyReturnConfig.return_flow_sensor)
    }
  }

  const towerData = (coolingTowers || []).map(ct => ({
    id: ct.equipment,
    name: ct.equipment,
    is_running: ct.is_running,
    fan_status: ct.fan_status,
    fan_power: ct.fan_power,
    level: ct.level,
    vibration: ct.vibration
  }))

  const condenserPumps = filterPumpsByCircuit(pumps, 'HVAC_CONDENSER').map(formatPump)

  return {
    title: condenserConfig.name || viewConfig.title,
    description: condenserConfig.description || viewConfig.description,
    target_supply_temp: condenserConfig.defaults?.supply_temp,
    target_return_temp: condenserConfig.defaults?.return_temp,
    supply_return: supplyReturn,
    cooling_towers: towerData,
    pumps: condenserPumps
  }
}

function buildHvacLayoutView (equipment, config) {
  const circuit1 = buildHvacCircuit1View(equipment, config)
  const circuit2 = buildHvacCircuit2View(equipment, config)
  const { pumps } = equipment
  const viewConfig = config?.cooling_system?.view_metadata?.hvac?.layout || {}

  return {
    title: viewConfig.title,
    description: viewConfig.description,
    summary: {
      chiller_running: circuit1.chiller?.is_running || false,
      fan_coils_running: circuit1.fan_coils.running,
      fan_coils_total: circuit1.fan_coils.total,
      cooling_towers_running: circuit2.cooling_towers.filter(ct => ct.is_running).length,
      pumps_running: (pumps || []).filter(p => p.FbkRunOut).length,
      pumps_total: (pumps || []).length
    },
    circuit1: {
      name: circuit1.title,
      chiller: circuit1.chiller,
      supply_return: circuit1.supply_return,
      buffer_tank: circuit1.buffer_tank,
      return_pumps: circuit1.return_pumps,
      supply_pumps: circuit1.supply_pumps
    },
    circuit2: {
      name: circuit2.title,
      supply_return: circuit2.supply_return,
      cooling_towers: circuit2.cooling_towers,
      pumps: circuit2.pumps
    }
  }
}

function buildHvacAmbientView (equipment, config, stats) {
  const fanCoils = equipment.fan_coils
  const humiditySensors = equipment.humidity_sensors
  const ambientConfig = config?.cooling_system?.ambient || {}
  const viewConfig = config?.cooling_system?.view_metadata?.hvac?.ambient || {}
  const humidityStats = stats?.humidity || {}

  const rooms = ambientConfig.rooms || []

  const roomData = rooms.map(roomConfig => {
    const roomFanCoils = (fanCoils || [])
      .filter(fc => (roomConfig.fan_coils || []).includes(fc.equipment))
      .map(fc => ({
        id: fc.equipment,
        name: fc.equipment,
        is_running: fc.is_running,
        temperature: fc.temperature,
        valve_position: fc.valve_position
      }))

    const roomTemps = roomFanCoils
      .filter(fc => fc.temperature?.value > 0)
      .map(fc => fc.temperature.value)
    const avgTemp = roomTemps.length > 0
      ? Math.round((roomTemps.reduce((a, b) => a + b, 0) / roomTemps.length) * 10) / 10
      : null
    const tempUnit = roomFanCoils[0]?.temperature?.unit

    const roomHumidity = (humiditySensors || [])
      .filter(h => (roomConfig.humidity_sensors || []).includes(h.equipment))
      .map(h => ({
        id: h.equipment,
        humidity: { value: h.value, unit: h.unit }
      }))

    const humidityValues = roomHumidity.filter(h => h.humidity.value != null).map(h => h.humidity.value)
    const avgHumidity = humidityValues.length > 0
      ? Math.round((humidityValues.reduce((a, b) => a + b, 0) / humidityValues.length) * 10) / 10
      : null
    const humidityUnit = roomHumidity[0]?.humidity?.unit

    return {
      name: roomConfig.name,
      temperature: avgTemp != null ? { value: avgTemp, unit: tempUnit } : null,
      humidity: avgHumidity != null ? { value: avgHumidity, unit: humidityUnit } : null,
      fan_coils: roomFanCoils,
      humidity_sensors: roomHumidity
    }
  })

  const ambientSensorIds = ambientConfig.ambient_sensors || []
  const ambientSensors = (humiditySensors || [])
    .filter(h => ambientSensorIds.includes(h.equipment))
    .map(h => ({
      id: h.equipment,
      humidity: { value: h.value, unit: h.unit }
    }))

  const humidityUnit = humiditySensors?.[0]?.unit

  return {
    title: viewConfig.title,
    description: viewConfig.description,
    summary: {
      average_humidity: humidityStats.avg != null ? { value: humidityStats.avg, unit: humidityUnit } : null,
      rooms_count: roomData.length,
      fan_coils_running: (fanCoils || []).filter(fc => fc.is_running).length,
      fan_coils_total: (fanCoils || []).length
    },
    rooms: roomData,
    ambient_sensors: ambientSensors
  }
}

/**
 *
 * @param {Object} snap - Device snap data
 * @param {string} type - 'miners' or 'hvac'
 * @param {string} view - View name (circuit1, circuit2, layout, ambient)
 * @returns {Object|null}
 */
function buildCoolingViewData (snap, type, view) {
  const equipment = snap.stats?.dcs_specific?.equipment || {}
  const config = snap.config || {}
  const stats = snap.stats || {}

  if (type === 'miners') {
    switch (view) {
      case 'circuit1':
        return buildMinersCircuit1View(equipment, config)
      case 'circuit2':
        return buildMinersCircuit2View(equipment, config)
      case 'layout':
        return buildMinersLayoutView(equipment, config, stats)
      default:
        return null
    }
  }

  if (type === 'hvac') {
    switch (view) {
      case 'circuit1':
        return buildHvacCircuit1View(equipment, config)
      case 'circuit2':
        return buildHvacCircuit2View(equipment, config)
      case 'layout':
        return buildHvacLayoutView(equipment, config)
      case 'ambient':
        return buildHvacAmbientView(equipment, config, stats)
      default:
        return null
    }
  }

  return null
}

/**
 * GET /auth/dcs/cooling-system
 *
 * Returns cooling system data for the requested type and view.
 * App-node builds views from enriched equipment data fetched from DCS worker.
 * All values include units - app-node is completely agnostic to device details.
 *
 * Query params:
 * - type: 'miners' | 'hvac' (required)
 * - view: 'circuit1' | 'circuit2' | 'layout' | 'ambient' (required)
 * - overwriteCache: boolean (optional)
 */
async function getCoolingSystemData (ctx, req) {
  if (!isCentralDCSEnabled(ctx)) {
    throw new Error('ERR_FEATURE_NOT_ENABLED')
  }

  const { type, view } = req.query

  if (!type || !['miners', 'hvac'].includes(type)) {
    throw new Error('ERR_INVALID_TYPE')
  }

  const validViews = type === 'miners'
    ? ['circuit1', 'circuit2', 'layout']
    : ['circuit1', 'circuit2', 'layout', 'ambient']

  if (!view || !validViews.includes(view)) {
    throw new Error('ERR_INVALID_VIEW')
  }

  const dcsTag = getDCSTag(ctx)

  const fields = getFieldProjection(type, view)

  const payload = {
    query: { tags: { $in: [dcsTag] } },
    status: 1,
    fields
  }

  const rpcResults = await ctx.dataProxy.requestDataMap('listThings', payload)
  const dcsThing = extractDcsThing(rpcResults)

  if (!dcsThing) {
    throw new Error('ERR_DCS_DATA_NOT_FOUND')
  }

  const snap = dcsThing.last.snap

  const viewData = buildCoolingViewData(snap, type, view)

  if (!viewData) {
    throw new Error('ERR_VIEW_DATA_NOT_AVAILABLE')
  }

  return {
    type,
    view,
    data: viewData
  }
}

module.exports = {
  getCoolingSystemData,
  getFieldProjection,
  buildCoolingViewData,
  buildMinersCircuit1View,
  buildMinersCircuit2View,
  buildMinersLayoutView,
  buildHvacCircuit1View,
  buildHvacCircuit2View,
  buildHvacLayoutView,
  buildHvacAmbientView
}
