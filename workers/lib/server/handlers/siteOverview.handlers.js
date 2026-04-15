'use strict'

const {
  LOG_KEYS,
  WORKER_TYPES,
  WORKER_TAGS
} = require('../../constants')
const { extractKeyEntry } = require('../../metrics.utils')
const {
  isCentralDCSEnabled,
  getDCSTag,
  extractDcsThing
} = require('../../dcs.utils')

const SITE_OVERVIEW_AGGR_FIELDS = {
  hashrate_mhs_5m_container_group_sum_aggr: 1,
  hashrate_mhs_5m_rack_group_sum_aggr: 1,
  power_w_container_group_sum_aggr: 1,
  power_w_rack_group_sum_aggr: 1,
  efficiency_w_ths_container_group_avg_aggr: 1,
  efficiency_w_ths_pdu_rack_group_avg_aggr: 1,
  offline_cnt: 1,
  error_cnt: 1,
  not_mining_cnt: 1,
  power_mode_sleep_cnt: 1,
  power_mode_low_cnt: 1,
  power_mode_normal_cnt: 1,
  power_mode_high_cnt: 1,
  hashrate_mhs_5m_active_container_group_cnt: 1
}

const DCS_POWER_METER_FIELDS = {
  'last.snap.stats.dcs_specific.equipment.power_meters': 1,
  'last.snap.config.mining': 1,
  'last.snap.config.energy_layout': 1
}

function parseRackId (rackKey) {
  if (!rackKey || typeof rackKey !== 'string') return null
  const idx = rackKey.indexOf('_')
  if (idx === -1) return null
  return {
    group: rackKey.substring(0, idx),
    rack: rackKey.substring(idx + 1)
  }
}

function mhsToPhs (mhs) {
  return Math.round((mhs / 1000000000) * 100) / 100
}

function mhsToThs (mhs) {
  return mhs / 1000000
}

function getGroupNumber (groupName) {
  const match = groupName.match(/group-(\d+)/i)
  return match ? parseInt(match[1], 10) : null
}


function getMeterGroupMapping (meterId, energyLayout) {
  const branches = energyLayout?.branches || []

  for (const branch of branches) {
    if (branch.meter === meterId && branch.feeds) {
      const match = branch.feeds.match(/Groups?\s+(\d+)-(\d+)/i)
      if (match) {
        const start = parseInt(match[1], 10)
        const end = parseInt(match[2], 10)
        const groups = []
        for (let i = start; i <= end; i++) {
          groups.push(`group-${i}`)
        }
        return groups
      }
    }
  }
  return []
}

function buildGroupPowerFromDCS (powerMeters, hashrateByGroup, energyLayout, miningConfig) {
  const groupPower = {}

  const rackMeters = (powerMeters || []).filter(pm => pm.role === 'rack')

  for (const meter of rackMeters) {
    const meterPower = meter.power?.value || 0
    const coveredGroups = getMeterGroupMapping(meter.equipment, energyLayout)

    if (coveredGroups.length === 0 || meterPower === 0) continue

    let totalHashrate = 0
    for (const groupName of coveredGroups) {
      totalHashrate += hashrateByGroup[groupName] || 0
    }

    if (totalHashrate > 0) {
      for (const groupName of coveredGroups) {
        const groupHashrate = hashrateByGroup[groupName] || 0
        const proportion = groupHashrate / totalHashrate
        groupPower[groupName] = (groupPower[groupName] || 0) + (meterPower * proportion)
      }
    } else {
      const perGroup = meterPower / coveredGroups.length
      for (const groupName of coveredGroups) {
        groupPower[groupName] = (groupPower[groupName] || 0) + perGroup
      }
    }
  }

  return groupPower
}

function aggregateMinerStats (tailLogResults) {
  const aggregated = {
    hashrateByGroup: {},
    hashrateByRack: {},
    powerByGroup: {},
    powerByRack: {},
    efficiencyByGroup: {},
    efficiencyByRack: {},
    offlineByGroup: {},
    errorByGroup: {},
    notMiningByGroup: {},
    sleepByGroup: {},
    lowByGroup: {},
    normalByGroup: {},
    highByGroup: {},
    activeCountByGroup: {}
  }

  for (const orkResult of tailLogResults) {
    const entry = extractKeyEntry(orkResult, 0)
    if (!entry) continue

    mergeGroupedField(aggregated.hashrateByGroup, entry.hashrate_mhs_5m_container_group_sum_aggr)
    mergeGroupedField(aggregated.hashrateByRack, entry.hashrate_mhs_5m_rack_group_sum_aggr)
    mergeGroupedField(aggregated.powerByGroup, entry.power_w_container_group_sum_aggr)
    mergeGroupedField(aggregated.powerByRack, entry.power_w_rack_group_sum_aggr)
    mergeGroupedField(aggregated.efficiencyByGroup, entry.efficiency_w_ths_container_group_avg_aggr, true)
    mergeGroupedField(aggregated.efficiencyByRack, entry.efficiency_w_ths_pdu_rack_group_avg_aggr, true)
    mergeGroupedField(aggregated.offlineByGroup, entry.offline_cnt)
    mergeGroupedField(aggregated.errorByGroup, entry.error_cnt)
    mergeGroupedField(aggregated.notMiningByGroup, entry.not_mining_cnt)
    mergeGroupedField(aggregated.sleepByGroup, entry.power_mode_sleep_cnt)
    mergeGroupedField(aggregated.lowByGroup, entry.power_mode_low_cnt)
    mergeGroupedField(aggregated.normalByGroup, entry.power_mode_normal_cnt)
    mergeGroupedField(aggregated.highByGroup, entry.power_mode_high_cnt)
    mergeGroupedField(aggregated.activeCountByGroup, entry.hashrate_mhs_5m_active_container_group_cnt)
  }

  return aggregated
}

function mergeGroupedField (target, source, isAverage = false) {
  if (!source || typeof source !== 'object') return

  for (const [key, value] of Object.entries(source)) {
    if (isAverage) {
      if (!target[key] || value > target[key]) {
        target[key] = value
      }
    } else {
      target[key] = (target[key] || 0) + (value || 0)
    }
  }
}

function buildRacksForGroup (groupName, minerStats, racksPerGroup) {
  const racks = []
  const rackKeys = Object.keys(minerStats.hashrateByRack)
    .filter(key => key.startsWith(groupName + '_'))
    .sort((a, b) => {
      const rackA = parseRackId(a)
      const rackB = parseRackId(b)
      if (!rackA || !rackB) return 0
      return rackA.rack.localeCompare(rackB.rack, undefined, { numeric: true })
    })

  for (const rackKey of rackKeys) {
    const parsed = parseRackId(rackKey)
    if (!parsed) continue

    const hashrateMhs = minerStats.hashrateByRack[rackKey] || 0
    const powerW = minerStats.powerByRack[rackKey] || 0
    const powerKw = Math.round(powerW / 10) / 100 // W to kW with 2 decimals
    const hashrateThs = mhsToThs(hashrateMhs)
    const efficiency = hashrateThs > 0
      ? Math.round((powerW / hashrateThs) * 10) / 10
      : minerStats.efficiencyByRack[rackKey] || 0

    racks.push({
      id: parsed.rack,
      name: `Rack ${parsed.rack}`,
      efficiency: { value: efficiency, unit: 'W/TH/s' },
      consumption: { value: powerKw, unit: 'kW' },
      hashrate: { value: mhsToPhs(hashrateMhs), unit: 'PH/s' }
    })
  }

  return racks
}

function getMinersPerGroup (miningConfig) {
  const racksPerGroup = miningConfig?.racks_per_group || 4
  const minersPerRack = miningConfig?.miners_per_rack || 20
  return racksPerGroup * minersPerRack
}

function composeGroupsStats (minerStats, dcsThing, totalGroups) {
  const groups = []
  const config = dcsThing?.last?.snap?.config || {}
  const miningConfig = config.mining || {}
  const energyLayout = config.energy_layout || {}
  const powerMeters = dcsThing?.last?.snap?.stats?.dcs_specific?.equipment?.power_meters || []
  const racksPerGroup = miningConfig?.racks_per_group || 4
  const minersPerGroup = getMinersPerGroup(miningConfig)

  const dcsPowerByGroup = buildGroupPowerFromDCS(
    powerMeters,
    minerStats.hashrateByGroup,
    energyLayout,
    miningConfig
  )

  const groupNames = Object.keys(minerStats.hashrateByGroup)
    .filter(name => name.startsWith('group-'))
    .sort((a, b) => getGroupNumber(a) - getGroupNumber(b))

  const maxGroups = totalGroups || groupNames.length
  for (let i = 1; i <= maxGroups; i++) {
    const groupName = `group-${i}`

    const hashrateMhs = minerStats.hashrateByGroup[groupName] || 0
    const powerKw = dcsPowerByGroup[groupName]
      ? Math.round(dcsPowerByGroup[groupName] * 100) / 100
      : Math.round((minerStats.powerByGroup[groupName] || 0) / 10) / 100 // W to kW

    const hashrateThs = mhsToThs(hashrateMhs)
    const efficiency = hashrateThs > 0
      ? Math.round(((powerKw * 1000) / hashrateThs) * 10) / 10
      : minerStats.efficiencyByGroup[groupName] || 0

    const offline = minerStats.offlineByGroup[groupName] || 0
    const error = minerStats.errorByGroup[groupName] || 0
    const sleep = minerStats.sleepByGroup[groupName] || 0
    const low = minerStats.lowByGroup[groupName] || 0
    const normal = minerStats.normalByGroup[groupName] || 0
    const high = minerStats.highByGroup[groupName] || 0
    const notMining = minerStats.notMiningByGroup[groupName] || 0
    const totalMiners = offline + error + sleep + low + normal + high + notMining
    const empty = Math.max(0, minersPerGroup - totalMiners)

    const racks = buildRacksForGroup(groupName, minerStats, racksPerGroup)

    groups.push({
      id: groupName,
      name: `Group ${i}`,
      summary: {
        efficiency: { value: efficiency, unit: 'W/TH/s' },
        consumption: { value: powerKw, unit: 'kW' },
        hashrate: { value: mhsToPhs(hashrateMhs), unit: 'PH/s' }
      },
      racks,
      status: {
        offline,
        error,
        sleep,
        low,
        normal,
        high,
        empty,
        not_mining: notMining,
        total: totalMiners
      }
    })
  }

  return { groups }
}

/**
 * GET /auth/site-overview/groups/stats
 *
 * Returns group-level stats combining:
 * - Miner stats from tailLog (hashrate, efficiency, status counts per group/rack)
 * - DCS power meter data for consumption
 */
async function getSiteOverviewGroupsStats (ctx, req) {
  const tailLogPayload = {
    keys: [
      { key: LOG_KEYS.STAT_RTD, type: WORKER_TYPES.MINER, tag: WORKER_TAGS.MINER }
    ],
    limit: 1,
    aggrFields: SITE_OVERVIEW_AGGR_FIELDS
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

  const minerStats = aggregateMinerStats(tailLogResults)

  const dcsThing = dcsResults ? extractDcsThing(dcsResults) : null

  const totalGroups = dcsThing?.last?.snap?.config?.mining?.total_groups || null

  return composeGroupsStats(minerStats, dcsThing, totalGroups)
}

module.exports = {
  getSiteOverviewGroupsStats,
  composeGroupsStats,
  aggregateMinerStats,
  parseRackId,
  mhsToPhs,
  mhsToThs,
  buildGroupPowerFromDCS
}
