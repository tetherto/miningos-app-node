"use strict";

const { requestRpcMapLimit } = require("../../utils");

/**
 * Extracts the latest entry from a tail-log key result.
 * tailLogMulti returns results per key in order.
 * Each ork result is an array of key results, each key result is an array of entries.
 * With limit=1, each key result has at most 1 entry.
 *
 * @param {Array} orkResult - Single ork's tailLogMulti response
 * @param {number} keyIndex - Index of the key in the keys array
 * @returns {Object|null} The latest entry for that key, or null
 */
function extractKeyEntry(orkResult, keyIndex) {
  if (!Array.isArray(orkResult)) return null;
  const keyResult = orkResult[keyIndex];
  if (!Array.isArray(keyResult) || keyResult.length === 0) return null;
  return keyResult[0] || null;
}

/**
 * Aggregates miner stats from tailLogMulti results across all orks.
 * Key index 0 = miner data (stat-rtd, type: miner)
 *
 * @param {Array} tailLogResults - Array of ork responses from tailLogMulti
 * @returns {Object} Aggregated miner stats
 */
function aggregateMinerStats(tailLogResults) {
  const stats = {
    hashrate: 0,
    nominalHashrate: 0,
    online: 0,
    error: 0,
    offline: 0,
    total: 0,
    alerts: { critical: 0, high: 0, medium: 0 },
  };

  for (const orkResult of tailLogResults) {
    const entry = extractKeyEntry(orkResult, 0);
    if (!entry) continue;

    stats.hashrate += entry.hashrate_mhs_1m_sum_aggr || 0;
    stats.nominalHashrate += entry.nominal_hashrate_mhs_sum_aggr || 0;
    stats.online += entry.online_or_minor_error_miners_amount_aggr || 0;
    stats.error += entry.not_mining_miners_amount_aggr || 0;
    stats.offline += entry.offline_or_sleeping_miners_amount_aggr || 0;
    stats.total += entry.hashrate_mhs_1m_cnt_aggr || 0;

    const alerts = entry.alerts_aggr;
    if (alerts && typeof alerts === "object") {
      stats.alerts.critical += alerts.critical || 0;
      stats.alerts.high += alerts.high || 0;
      stats.alerts.medium += alerts.medium || 0;
    }
  }

  return stats;
}

/**
 * Extracts site power from powermeter tail-log results across all orks.
 * Key index 1 = powermeter data (stat-rtd, type: powermeter)
 *
 * @param {Array} tailLogResults - Array of ork responses from tailLogMulti
 * @returns {number} Total site power in Watts
 */
function aggregatePowerStats(tailLogResults) {
  let sitePower = 0;

  for (const orkResult of tailLogResults) {
    const entry = extractKeyEntry(orkResult, 1);
    if (!entry) continue;
    sitePower += entry.site_power_w || 0;
  }

  return sitePower;
}

/**
 * Extracts container capacity from container tail-log results across all orks.
 * Key index 2 = container data (stat-rtd, type: container)
 *
 * @param {Array} tailLogResults - Array of ork responses from tailLogMulti
 * @returns {number} Total container nominal miner capacity
 */
function aggregateContainerCapacity(tailLogResults) {
  let capacity = 0;

  for (const orkResult of tailLogResults) {
    const entry = extractKeyEntry(orkResult, 2);
    if (!entry) continue;
    capacity += entry.container_nominal_miner_capacity_sum_aggr || 0;
  }

  return capacity;
}

/**
 * Aggregates pool stats from ext-data minerpool results across all orks.
 *
 * @param {Array} poolDataResults - Array of ork responses from getWrkExtData
 * @returns {Object} Aggregated pool stats
 */
function aggregatePoolStats(poolDataResults) {
  const stats = {
    totalHashrate: 0,
    activeWorkers: 0,
    totalWorkers: 0,
  };

  for (const orkResult of poolDataResults) {
    if (!Array.isArray(orkResult)) continue;
    for (const pool of orkResult) {
      if (!pool || !pool.stats) continue;
      stats.totalHashrate += pool.stats.hashrate || 0;
      stats.activeWorkers += pool.stats.active_workers_count || 0;
      stats.totalWorkers += pool.stats.worker_count || 0;
    }
  }

  return stats;
}

/**
 * Extracts nominal values from global config results.
 * Merges across orks (typically only 1 ork has global config).
 *
 * @param {Array} globalConfigResults - Array of ork responses from getGlobalConfig
 * @returns {Object} Nominal configuration values
 */
function extractGlobalConfig(globalConfigResults) {
  const config = {
    nominalHashrate: 0,
    nominalPowerAvailability_MW: 0,
  };

  for (const orkResult of globalConfigResults) {
    if (!orkResult || typeof orkResult !== "object") continue;
    if (orkResult.nominalHashrate)
      config.nominalHashrate = orkResult.nominalHashrate;
    if (orkResult.nominalPowerAvailability_MW)
      config.nominalPowerAvailability_MW =
        orkResult.nominalPowerAvailability_MW;
  }

  return config;
}

/**
 * Computes utilization percentage safely.
 *
 * @param {number} value - Current value
 * @param {number} nominal - Nominal/max value
 * @returns {number} Utilization percentage rounded to 1 decimal, or 0 if nominal is 0
 */
function computeUtilization(value, nominal) {
  if (!nominal || nominal === 0) return 0;
  return Math.round((value / nominal) * 1000) / 10;
}

/**
 * Composes the site live status response from all data sources.
 *
 * @param {Array} tailLogResults - tailLogMulti RPC results
 * @param {Array} poolDataResults - getWrkExtData (minerpool) RPC results
 * @param {Array} globalConfigResults - getGlobalConfig RPC results
 * @returns {Object} Composed site status response
 */
function composeSiteStatus(
  tailLogResults,
  poolDataResults,
  globalConfigResults,
) {
  const minerStats = aggregateMinerStats(tailLogResults);
  const sitePower = aggregatePowerStats(tailLogResults);
  const containerCapacity = aggregateContainerCapacity(tailLogResults);
  const poolStats = aggregatePoolStats(poolDataResults);
  const globalConfig = extractGlobalConfig(globalConfigResults);

  const nominalPowerW = globalConfig.nominalPowerAvailability_MW * 1000000;
  const hashrateNominal =
    minerStats.nominalHashrate || globalConfig.nominalHashrate || 0;

  const hashrateValue = minerStats.hashrate;
  const hashrateThs = hashrateValue / 1000000;
  const efficiencyWPerTh =
    hashrateThs > 0 ? Math.round((sitePower / hashrateThs) * 10) / 10 : 0;

  const sleep = Math.max(
    0,
    minerStats.total -
      minerStats.online -
      minerStats.error -
      minerStats.offline,
  );
  const alertTotal =
    minerStats.alerts.critical +
    minerStats.alerts.high +
    minerStats.alerts.medium;

  return {
    hashrate: {
      value: hashrateValue,
      nominal: hashrateNominal,
      utilization: computeUtilization(hashrateValue, hashrateNominal),
    },
    power: {
      value: sitePower,
      nominal: nominalPowerW,
      utilization: computeUtilization(sitePower, nominalPowerW),
    },
    efficiency: {
      value: efficiencyWPerTh,
    },
    miners: {
      online: minerStats.online,
      offline: minerStats.offline,
      error: minerStats.error,
      sleep,
      total: minerStats.total,
      containerCapacity,
    },
    alerts: {
      critical: minerStats.alerts.critical,
      high: minerStats.alerts.high,
      medium: minerStats.alerts.medium,
      total: alertTotal,
    },
    pools: poolStats,
    ts: Date.now(),
  };
}

/**
 * GET /auth/site/status/live
 *
 * Returns a composite site status snapshot by aggregating:
 * - tailLogMulti (miner hashrate/counts/alerts, powermeter power, container capacity)
 * - getWrkExtData (pool hashrate, worker counts)
 * - getGlobalConfig (nominal hashrate, nominal power availability)
 *
 * Replaces 5 separate frontend API calls with a single server-side composition.
 */
async function getSiteLiveStatus(ctx, req) {
  const tailLogPayload = {
    keys: [
      { key: "stat-rtd", type: "miner", tag: "t-miner" },
      { key: "stat-rtd", type: "powermeter", tag: "t-powermeter" },
      { key: "stat-rtd", type: "container", tag: "t-container" },
    ],
    limit: 1,
    aggrFields: {
      hashrate_mhs_1m_sum_aggr: 1,
      nominal_hashrate_mhs_sum_aggr: 1,
      alerts_aggr: 1,
      online_or_minor_error_miners_amount_aggr: 1,
      not_mining_miners_amount_aggr: 1,
      offline_or_sleeping_miners_amount_aggr: 1,
      hashrate_mhs_1m_cnt_aggr: 1,
      site_power_w: 1,
      container_nominal_miner_capacity_sum_aggr: 1,
    },
  };

  const poolPayload = {
    type: "minerpool",
    query: { key: "stats" },
  };

  const globalConfigPayload = {
    fields: { nominalHashrate: 1, nominalPowerAvailability_MW: 1 },
  };

  const [tailLogResults, poolDataResults, globalConfigResults] =
    await Promise.all([
      requestRpcMapLimit(ctx, "tailLogMulti", tailLogPayload),
      requestRpcMapLimit(ctx, "getWrkExtData", poolPayload),
      requestRpcMapLimit(ctx, "getGlobalConfig", globalConfigPayload),
    ]);

  return composeSiteStatus(
    tailLogResults,
    poolDataResults,
    globalConfigResults,
  );
}

module.exports = {
  getSiteLiveStatus,
};
