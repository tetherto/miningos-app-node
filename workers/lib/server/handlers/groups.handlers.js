'use strict'

const {
  LOG_KEYS,
  WORKER_TYPES,
  WORKER_TAGS,
  EXPLORER_RACK_AGGR_FIELDS,
  DCS_POWER_METER_FIELDS
} = require('../../constants')
const {
  aggregateRackStats,
  buildRackList
} = require('./explorer.handlers')
const { mhsToPhs, mhsToThs } = require('../../metrics.utils')
const {
  isCentralDCSEnabled,
  getDCSTag,
  extractDcsThing
} = require('../../dcs.utils')
const { parseRacks } = require('../lib/queryUtils')

async function getGroupStats (ctx, req) {
  const requestedRacks = parseRacks(req)
  if (!requestedRacks || !requestedRacks.length) {
    throw new Error('ERR_MISSING_RACKS')
  }

  const tailLogPayload = {
    keys: [
      { key: LOG_KEYS.STAT_RTD, type: WORKER_TYPES.MINER, tag: WORKER_TAGS.MINER }
    ],
    limit: 1,
    aggrFields: EXPLORER_RACK_AGGR_FIELDS
  }

  const dcsEnabled = isCentralDCSEnabled(ctx)
  let dcsPayload = null
  if (dcsEnabled) {
    const dcsTag = getDCSTag(ctx)
    dcsPayload = {
      query: { tags: { $in: [dcsTag] } },
      status: 1,
      fields: { id: 1, code: 1, type: 1, tags: 1, ...DCS_POWER_METER_FIELDS }
    }
  }

  const [tailLogResults, dcsResults] = await Promise.all([
    ctx.dataProxy.requestDataMap('tailLogMulti', tailLogPayload),
    dcsEnabled ? ctx.dataProxy.requestDataMap('listThings', dcsPayload) : Promise.resolve(null)
  ])

  const rackStats = aggregateRackStats(tailLogResults)
  const dcsThing = dcsResults ? extractDcsThing(dcsResults) : null
  const miningConfig = dcsThing?.last?.snap?.config?.mining || {}

  const allRacks = buildRackList(miningConfig, rackStats)
  const realKeyById = mapSynthIdsToRealKeys(allRacks, rackStats)

  const requestedSet = new Set(requestedRacks)
  const data = allRacks
    .filter(rack => requestedSet.has(rack.id))
    .map(rack => withRealValues(rack, realKeyById.get(rack.id), rackStats))

  return {
    data,
    totalCount: data.length
  }
}

// `*_pdu_rack_group_*` is keyed by physical position (e.g. 'group-1_1-1'),
// but buildRackList synthesizes ids as 'group-X_rack-N' from the mining
// config. Map each synth id to the Nth real key in its group (sorted) so
// values align without changing PR #59's contract.
function mapSynthIdsToRealKeys (racks, rackStats) {
  const allRealKeys = new Set([
    ...Object.keys(rackStats.hashrateByRack),
    ...Object.keys(rackStats.powerByRack),
    ...Object.keys(rackStats.efficiencyByRack)
  ])

  const sortedByGroup = {}
  for (const key of allRealKeys) {
    const idx = key.indexOf('_')
    if (idx === -1) continue
    const groupId = key.substring(0, idx)
    ;(sortedByGroup[groupId] ||= []).push(key)
  }
  for (const list of Object.values(sortedByGroup)) {
    list.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  }

  const map = new Map()
  const cursor = {}
  for (const rack of racks) {
    const groupId = rack.group.id
    const pos = (cursor[groupId] = (cursor[groupId] ?? -1) + 1)
    map.set(rack.id, sortedByGroup[groupId]?.[pos])
  }
  return map
}

function withRealValues (rack, realKey, rackStats) {
  if (!realKey) return rack

  const hashrateMhs = rackStats.hashrateByRack[realKey] || 0
  const powerW = rackStats.powerByRack[realKey] || 0
  const powerKw = Math.round(powerW / 10) / 100
  const hashrateThs = mhsToThs(hashrateMhs)
  const efficiency = hashrateThs > 0
    ? Math.round((powerW / hashrateThs) * 10) / 10
    : rackStats.efficiencyByRack[realKey] || 0

  return {
    ...rack,
    efficiency: { value: efficiency, unit: 'W/TH/s' },
    hashrate: { value: mhsToPhs(hashrateMhs), unit: 'PH/s' },
    consumption: { value: powerKw, unit: 'kW' }
  }
}

module.exports = {
  getGroupStats,
  mapSynthIdsToRealKeys,
  withRealValues
}
