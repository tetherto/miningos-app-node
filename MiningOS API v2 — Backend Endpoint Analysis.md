# MiningOS API v2 — Backend Endpoint Analysis

This document lists all new endpoints being added as part of the Resource-Oriented Architecture (ROA) migration. For each endpoint, it covers: what query parameters it accepts, what legacy API calls it replaces, and which UI views/components will consume it.

---

## I. Fleet Intelligence

### 1\. `GET /auth/site/status/live`

**Priority:** P0

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces (5 API calls → 1):**

- `GET /auth/tail-log/multi?keys=[{key:"stat-realtime",type:"miner"},{key:"stat-realtime",type:"powermeter"},{key:"stat-realtime",type:"container"}]&limit=1` — hashrate, power, miner counts, alerts  
- `GET /auth/list-things?query={"info.pos":{"$eq":"site"}}&fields={"id":1,"last.snap.stats.power_w":1}` — site power meter  
- `GET /auth/ext-data?type=minerpool&query={"key":"stats"}` — pool hashrate, worker counts  
- `GET /auth/tail-log?key=stat-5m&type=container&tag=t-container&fields={"container_nominal_miner_capacity_sum":1}&limit=1` — container capacity  
- `GET /auth/global-config?fields={"nominalHashrate":1,"nominalPowerAvailability_MW":1}` — nominal values

**Used by:** Header bar (`HeaderStats.tsx`, `AlertsHeader.tsx`), Operations Dashboard overview. Returns total hashrate, power, efficiency, miner counts by status, alert severity counts, and pool summary in one payload.

---

### 2\. `GET /auth/site/alerts`

**Priority:** P0

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `filter` | string (JSON) | No | `{}` | MongoDB-style query (fields: `severity`, `type`, `container`, `deviceId`) |
| `sort` | string (JSON) | No | `{}` | Sort spec |
| `search` | string | No | — | Text search across device id, code, container |
| `offset` | integer | No | 0 | Pagination offset |
| `limit` | integer | No | 100 | Page size (max 200\) |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/list-things?query={"last.alerts":{"$ne":null}}&status=1&limit=250&fields={...}` — devices with active alerts

**Used by:** Current Alerts view (`CurrentAlerts.tsx`), Active Incidents card on dashboard (`ActiveIncidentsCard.tsx`), Alerts tab in Explorer. Returns devices with active alerts, severity-bucketed alert lists, and a summary with severity counts.

---

## II. Entity Management

### 3\. `GET /auth/miners`

**Priority:** P0

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `filter` | string (JSON) | No | `{}` | MongoDB-style query (fields: `status`, `hashrate`, `power`, `efficiency`, `temperature`, `powerMode`, `firmware`, `model`, `ip`, `container`, `rack`, `serialNum`, `macAddress`, `pool`, `led`, `alerts`) |
| `sort` | string (JSON) | No | `{}` | Sort spec (e.g., `{"temperature":-1}`) |
| `fields` | string (JSON) | No | — | Field projection (e.g., `{"id":1,"status":1,"hashrate":1}`) |
| `search` | string | No | — | Text search across id, ip, serialNum, code |
| `offset` | integer | No | 0 | Pagination offset |
| `limit` | integer | No | 50 | Page size (max 200\) |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/list-things?query={"tags":{"$in":["t-miner"]}}&status=1&limit=100&fields={...}` — the massive list-things call with 20+ nested field paths

**Used by:** Explorer list view (`useListViewData.ts`), miner tab, any view that lists miners. Resource type (`t-miner`) is auto-injected — users filter by clean field names (`status`, `model`, `container`) instead of raw internal paths. Optionally enriches with pool-reported hashrate if pool stats feature is enabled.

---

### 4\. `GET /auth/containers`

**Priority:** P0

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `filter` | string (JSON) | No | `{}` | MongoDB-style query (fields: `status`, `power`, `alarm`, `model`, `minerCount`) |
| `sort` | string (JSON) | No | `{}` | Sort spec |
| `fields` | string (JSON) | No | — | Field projection |
| `search` | string | No | — | Text search |
| `offset` | integer | No | 0 | Pagination offset |
| `limit` | integer | No | 50 | Page size (max 200\) |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/list-things?query={"$or":[{"type":"bitdeer-d40"},{"type":"antbox-hydro"},{"type":"antbox-immersion"},{"type":"microbt-kehua"},{"type":"microbt-wonderint"},{"type":"acme"}]}&status=1&fields={...}` — the most complex `$or` query the frontend builds

**Used by:** Sites overview (`useSitesOverviewData.ts`), Explorer container tab, container list views. Container types are auto-injected — no need to enumerate hardware types in the query.

---

### 5\. `GET /auth/containers/:id/telemetry`

**Priority:** P1

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `:id` (path) | string | Yes | — | Container ID |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces (2 API calls → 1):**

- `GET /auth/list-things?query={"tags":{"$in":["container-${id}"]}}&status=1&fields={...}` — connected miners  
- `GET /auth/tail-log?key=stat-5m&type=container&tag=${id}&limit=1&fields={container_specific_stats_group_aggr:1,...}` — container sensors

**Used by:** Container detail view (`Container.tsx`), PDU Grid tab (`PduGrid.tsx`), Home tab. Returns polymorphic response based on hardware type (immersion vs air-cooled) with PDU socket-to-miner mapping, tank/pump data, temperature ranges, and hashrate ranges pre-computed.

---

### 6\. `GET /auth/cabinets` \+ `GET /auth/cabinets/:id`

**Priority:** P1

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `filter` | string (JSON) | No | `{}` | MongoDB-style query on post-grouping fields (`status`, `summary.totalPowerW`, `summary.cabinetTemp`, `summary.transformerTemp`, `type`) |
| `sort` | string (JSON) | No | `{}` | Sort spec |
| `offset` | integer | No | 0 | Pagination offset |
| `limit` | integer | No | 50 | Page size (max 200\) |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces (\~400 lines of frontend code):**

- `GET /auth/list-things?query={"tags":{"$in":["t-powermeter","t-sensor-temp"]}}&status=1` — raw powermeter \+ temp sensor devices  
- `groupCabinetDevices()` in `ListView.util.ts` — 120 lines of virtual entity grouping  
- 15+ utility functions in `deviceUtils.ts` — `getCabinetPos()`, `getRootPowerMeter()`, `getLvCabinetTempSensorColor()`, etc.

**Used by:** Explorer LV Cabinet tab (`LvCabinetCard.tsx`, `LvCabinet.table.tsx`), Cabinet detail view (`Cabinet.tsx`), LV Cabinet widgets (`LVCabinetWidgets.tsx`). LV Cabinets are virtual entities — the backend fetches raw powermeters \+ temp sensors, groups them by `info.pos` root into cabinet objects, computes total power, temperature severity, and alert aggregation. Filters are applied post-grouping.

---

### 7\. `GET /auth/pools`

**Priority:** P1

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `filter` | string (JSON) | No | `{}` | MongoDB-style query (fields: `pool`, `account`, `hashrate`, `balance`) |
| `sort` | string (JSON) | No | `{}` | Sort spec |
| `fields` | string (JSON) | No | — | Field projection |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces (2 API calls → 1):**

- `GET /auth/list-things?query={"tags":{"$in":["t-minerpool"]}}&status=1` — pool device list  
- `GET /auth/ext-data?type=minerpool&query={"key":"stats"}` — pool statistics

**Used by:** Header pool stats (`useHeaderStats.ts`), Pool Stats reporting view. Merges pool device list with pool stats into a single response with per-pool breakdown and site-wide summary (total hashrate, total workers, total balance).

---

## III. Historical Performance & Metrics

### 8\. `GET /auth/metrics/hashrate`

**Priority:** P0

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `range` | string | No | 24h | `1h`, `6h`, `24h`, `7d`, `30d`, `90d`, `1y` |
| `interval` | string | No | auto | `1m`, `5m`, `30m`, `1h`, `3h`, `1d`. Auto-selected from range. |
| `start` | integer | No | — | Unix ms timestamp (overrides `range`) |
| `end` | integer | No | — | Unix ms timestamp |
| `container` | string | No | — | Filter by container |
| `minerType` | string | No | — | Filter by miner type |
| `groupBy` | string | No | — | `container` or `minerType` — returns grouped series |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/tail-log?key=stat-5m&type=miner&tag=t-miner&fields={"hashrate_mhs_1m_sum_aggr":1}&limit=288` — dashboard hashrate chart  
- `GET /auth/tail-log?key=stat-3h&type=miner&...&aggrFields={"hashrate_mhs_5m_type_group_sum_aggr":1}&groupRange=D1` — hashrate report (grouped)  
- `GET /auth/tail-log/range-aggr?keys=[{"type":"miner","fields":{"hashrate_mhs_5m_sum_aggr":1},"shouldReturnDailyData":1}]` — operations dashboard

**Used by:** Dashboard hashrate chart (`HashRateLineChart.tsx`), Hashrate report view (`useHashrateData.ts`), Operations dashboard (`useOperationsDashboardData.ts`). The backend handles stat key selection, limit calculation, and interval resolution — the frontend just specifies `range` or `start/end`.

---

### 9\. `GET /auth/metrics/consumption`

**Priority:** P1

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `range` | string | No | 24h | Same ranges as hashrate |
| `interval` | string | No | auto | Auto-selected from range |
| `start` | integer | No | — | Unix ms timestamp |
| `end` | integer | No | — | Unix ms timestamp |
| `container` | string | No | — | Filter by container |
| `groupBy` | string | No | — | `container` — grouped series |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/tail-log?key=stat-5m&type=powermeter&tag=t-powermeter&fields={"site_power_w":1}&limit=288`  
- `GET /auth/tail-log/range-aggr?keys=[{"type":"powermeter","fields":{"site_power_w":1},"shouldReturnDailyData":1}]`

**Used by:** Dashboard consumption chart (`ConsumptionLineChart.tsx`), Energy report (`useEnergyReportData.ts`), Operations dashboard.

---

### 10\. `GET /auth/metrics/efficiency`

**Priority:** P1

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `range` | string | No | 24h | Same ranges as hashrate |
| `interval` | string | No | auto | Auto-selected from range |
| `start` | integer | No | — | Unix ms timestamp |
| `end` | integer | No | — | Unix ms timestamp |
| `container` | string | No | — | Filter by container |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/tail-log?key=stat-5m&type=miner&tag=t-miner&fields={"efficiency_w_ths_avg_aggr":1}&limit=288`  
- `GET /auth/tail-log/range-aggr?keys=[{"type":"miner","fields":{"efficiency_w_ths_avg_aggr":1},"shouldReturnDailyData":1}]`

**Used by:** Operations dashboard efficiency chart, efficiency reporting views. Efficiency (W/TH) is already computed by the worker aggregation layer.

---

### 11\. `GET /auth/metrics/miner-status`

**Priority:** P1

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `start` | integer | Yes | — | Unix ms timestamp |
| `end` | integer | Yes | — | Unix ms timestamp |
| `interval` | string | No | auto | `1h`, `1d`, `1w` |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/tail-log?key=stat-3h&type=miner&tag=t-miner&aggrFields={"offline_cnt":1,"power_mode_sleep_cnt":1,"maintenance_type_cnt":1}&groupRange=1D&shouldCalculateAvg=true` — miner status stacked area chart

**Used by:** Miner status history chart on Operations Dashboard (`useMinersStatusChartData.ts`). Returns time-series of miner counts by status (online, error, offline, sleep, maintenance, notMining). The backend handles `sumObjectValues()` for the `offline_cnt` and `power_mode_sleep_cnt` fields which are keyed objects, not simple numbers.

---

### 12\. `GET /auth/metrics/power-mode`

**Priority:** P1

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `start` | integer | Yes | — | Unix ms timestamp |
| `end` | integer | Yes | — | Unix ms timestamp |
| `interval` | string | No | auto | `1h`, `1d`, `1w` |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/tail-log?key=stat-3h&type=miner&tag=t-miner&aggrFields={"power_mode_group_aggr":1,"status_group_aggr":1}&groupRange=1D&shouldCalculateAvg=true` — power mode distribution chart

**Used by:** Power mode distribution stacked chart on Operations Dashboard. Returns counts per mode (low, normal, high, sleep, offline, notMining, maintenance, error) over time.

---

### 13\. `GET /auth/metrics/power-mode/timeline`

**Priority:** P1

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `start` | integer | No | — | Unix ms timestamp (default: 1 month ago) |
| `end` | integer | No | — | Unix ms timestamp (default: now) |
| `container` | string | No | — | Filter by container name |
| `limit` | integer | No | 10080 | Max data points |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/tail-log?key=stat-3h&type=miner&tag=t-miner&aggrFields={"power_mode_group_aggr":1,"status_group_aggr":1}&limit=10080` — per-miner power mode timeline

**Used by:** Power Mode Timeline chart (`PowerModeTimelineChart.tsx`). Returns per-miner segments with consecutive same-mode entries merged into `{from, to, powerMode, status}` ranges. The backend handles the segment merging that currently happens in `PowerModeTimlineChart.helper.ts`.

---

### 14\. `GET /auth/metrics/temperature`

**Priority:** P1

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `start` | integer | Yes | — | Unix ms timestamp |
| `end` | integer | Yes | — | Unix ms timestamp |
| `interval` | string | No | auto | `1h`, `1d`, `1w` |
| `container` | string | No | — | Filter by container name |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/tail-log?key=stat-3h&type=miner&tag=t-miner&aggrFields={"temperature_c_group_max_aggr":1,"temperature_c_group_avg_aggr":1}&groupRange=1D` — temperature history chart

**Used by:** Temperature chart on container widget (`ContainerWidget.util.ts`), Operations Dashboard. Returns per-container max/avg temperature over time plus site-wide aggregates.

---

### 15\. `GET /auth/containers/:id/telemetry/history`

**Priority:** P1

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `:id` (path) | string | Yes | — | Container name |
| `start` | integer | No | — | Unix ms timestamp (default: 1 day ago) |
| `end` | integer | No | — | Unix ms timestamp (default: now) |
| `limit` | integer | No | 10080 | Max data points |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/tail-log?key=stat-5m&type=container&tag=${containerTag}&fields={container_specific_stats_group_aggr:1,...}&limit=10080` — container sensor history charts

**Used by:** Container Charts — temperature tab (`ContainerCharts.temp.adapter.ts`), pressure tab (`ContainerCharts.pressure.adapter.ts`). Returns polymorphic time-series based on container type:

- **Antspace Hydro:** supply/return liquid temperature, pressure (bar), flow rate  
- **Bitdeer D40:** oil pump cold/hot temps (×2), water pump cold/hot temps (×2), tank pressure (×2)  
- **Bitmain Immersion:** primary supply temp, secondary supply temps

---

## IV. Financial & Market

### 16\. `GET /auth/finance/revenue`

**Priority:** P0

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `period` | string | No | daily | `daily`, `weekly`, `monthly`, `yearly` |
| `start` | integer | Yes | — | Unix ms timestamp |
| `end` | integer | Yes | — | Unix ms timestamp |
| `pool` | string | No | all | Filter by pool name |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/ext-data?type=minerpool` — pool transaction data  
- Frontend transaction processing in `useRevenueSummaryData.ts` (\~60 lines of reduce loops)

**Used by:** Revenue chart in Financial views. Processes raw pool transactions server-side: sums `changed_balance` and `tx_fee`, aggregates by period, and returns daily/weekly/monthly/yearly revenue with fees and net revenue.

---

### 17\. `GET /auth/finance/revenue-summary`

**Priority:** P0 — *Most impactful endpoint. Replaces 1,500+ lines of frontend processing and 9 API calls.*

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `period` | string | No | daily | `daily`, `monthly`, `yearly` |
| `start` | integer | Yes | — | Unix ms timestamp |
| `end` | integer | Yes | — | Unix ms timestamp |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces (9 API calls → 1):**

- Pool transaction data (`ext-data?type=minerpool`)  
- BTC price history (`ext-data?type=mempool&query={"key":"prices"}`)  
- Current BTC price (`ext-data?type=mempool&query={"key":"current_price"}`)  
- Hashrate time-series (`tail-log/range-aggr` with miner type)  
- Power consumption time-series (`tail-log/range-aggr` with powermeter type)  
- Energy costs (`global-config` costs array)  
- Operational costs (`global-config` costs array)  
- Block subsidy data (`ext-data?type=mempool&query={"key":"blocks"}`)  
- Mempool fee data (`ext-data?type=mempool&query={"key":"fee_histogram"}`)

**Used by:** Revenue Summary page — the primary financial dashboard. Merges all 9 data sources into daily rows, then aggregates by period. Each period includes revenue (BTC/USD), costs, EBITDA (sell vs hodl), energy revenue per MWh, hash revenue per PH/s/day, efficiency, and curtailment metrics.

---

### 18\. `GET /auth/finance/ebitda`

**Priority:** P0

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `period` | string | No | monthly | `daily`, `monthly`, `yearly` |
| `start` | integer | Yes | — | Unix ms timestamp |
| `end` | integer | Yes | — | Unix ms timestamp |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- Same multi-source data as revenue-summary, focused on profitability: `revenueBTC × btcPrice − totalCosts`  
- Frontend EBITDA calculations in `useEBITDAData.ts`

**Used by:** EBITDA chart in Financial views. Returns revenue, costs, and two EBITDA scenarios (sell immediately vs hodl), plus Bitcoin production cost metric (`totalCosts / totalBTCProduced`).

---

### 19\. `GET /auth/finance/energy-balance`

**Priority:** P0

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `period` | string | No | daily | `daily`, `monthly`, `yearly` |
| `start` | integer | Yes | — | Unix ms timestamp |
| `end` | integer | Yes | — | Unix ms timestamp |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- 5 data sources merged for energy analysis  
- Frontend energy balance calculations in `useEnergyBalanceData.ts`

**Used by:** Energy Balance page in Financial views. Returns energy revenue per MWh, all-in cost per MWh, curtailment rate, operational issues rate, and power utilization metrics.

---

### 20\. `GET /auth/finance/cost-summary`

**Priority:** P1

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `period` | string | No | monthly | `daily`, `monthly`, `yearly` |
| `start` | integer | Yes | — | Unix ms timestamp |
| `end` | integer | Yes | — | Unix ms timestamp |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `useCostSummaryData.ts` (350+ lines) — 5 API calls \+ BTC price aggregation by period

**Used by:** Cost Summary page in Financial views. Returns energy costs, operational costs, BTC price history aggregated by period, and calculated metrics (all-in cost per MWh, energy cost per MWh).

---

### 21\. `GET /auth/finance/subsidy-fees`

**Priority:** P2

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `period` | string | No | daily | `daily`, `weekly`, `monthly` |
| `start` | integer | Yes | — | Unix ms timestamp |
| `end` | integer | Yes | — | Unix ms timestamp |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/ext-data?type=mempool&query={"key":"blocks"}` — block data  
- Frontend subsidy/fee aggregation logic

**Used by:** Subsidy & Fees chart in Financial views. Aggregates block subsidy and transaction fee data by period.

---

### 22\. `GET /auth/finance/hash-revenue`

**Priority:** P1

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `period` | string | No | daily | `daily`, `monthly`, `yearly` |
| `start` | integer | Yes | — | Unix ms timestamp |
| `end` | integer | Yes | — | Unix ms timestamp |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- Revenue \+ hashrate data merge  
- Frontend hash revenue calculation in `hashRevenueCost.utils.ts`

**Used by:** Hash Revenue & Cost chart in Financial views. Returns BTC and USD revenue per PH/s per day, and corresponding hash cost metrics.

---

### 23\. `GET /auth/market/bitcoin`

**Priority:** P1

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/ext-data?type=mempool&query={"key":"current_price"}` — BTC price  
- `GET /auth/ext-data?type=market` — market indicators

**Used by:** Revenue Summary, EBITDA, Energy Balance, Cost Summary — any financial view needing current BTC price. Also market data display. Returns price, block height, network hashrate, difficulty, hashprice, mempool size, and average fee rate.

---

### 24\. `GET /auth/market/bitcoin/price`

**Priority:** P1

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `range` | string | No | 30d | `7d`, `30d`, `90d`, `1y` |
| `interval` | string | No | 1d | `1h`, `1d` |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/ext-data?type=mempool&query={"key":"prices"}` — historical BTC prices

**Used by:** BTC price chart overlay on financial views.

---

## V. Reports & Aggregation

### 25\. `GET /auth/reports/operations`

**Priority:** P1

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `start` | integer | Yes | — | Unix ms timestamp |
| `end` | integer | Yes | — | Unix ms timestamp |
| `interval` | string | No | auto | `1h`, `1d` |
| `site` | string | No | — | Filter by site/region |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- Multiple `tail-log/range-aggr` calls for hashrate, power, efficiency, miner counts, alerts — all fetched individually then composed client-side

**Used by:** Operations report page (`useOperationsDashboardData.ts`). Returns all operational metrics (hashrate, efficiency, power, miner status counts, alerts) as parallel time-series in a single response.

---

### 26\. `GET /auth/pool-stats/aggregate`

**Priority:** P2

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `range` | string | No | daily | `daily`, `weekly`, `monthly` |
| `start` | integer | Yes | — | Unix ms timestamp |
| `end` | integer | Yes | — | Unix ms timestamp |
| `pool` | string | No | all | Filter by pool name |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/tail-log?key=stat-3h&type=minerpool&...` — pool stats over time  
- Frontend pool stats aggregation logic

**Used by:** Pool Stats reporting page. Returns historical pool metrics (balance, hashrate, revenue, worker counts) aggregated by period.

---

## VI. Historical / Telemetry

### 27\. `GET /auth/pools/:pool/balance-history`

**Priority:** P2

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `:pool` (path) | string | No | — | Pool name filter (omit for all) |
| `start` | integer | Yes | — | Unix ms timestamp |
| `end` | integer | Yes | — | Unix ms timestamp |
| `range` | string | No | 1D | Aggregation range: `1D`, `1W`, `1M` |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces:**

- `GET /auth/tail-log?key=stat-3h&type=minerpool&...` — pool balance snapshots  
- Frontend processing in `aggregateF2PoolSnapLog()`, `aggregateF2PoolStats()`  
- Yearly balance merging logic

**Used by:** Pool Balance chart (`BalanceBarChart.js`), Reporting Tools pool section. Returns balance, hashrate, and revenue time-series with configurable aggregation.

---

### 28\. `GET /auth/alerts/history`

**Priority:** P0

| Param | Type | Required | Default | Description |
| :---- | :---- | :---- | :---- | :---- |
| `start` | integer | Yes | — | Unix ms timestamp |
| `end` | integer | Yes | — | Unix ms timestamp |
| `logType` | string | Yes | — | `alerts` or `info` |
| `filter` | string (JSON) | No | `{}` | MongoDB-style query (fields: `severity`, `code`, `deviceType`, `container`, `deviceId`, `tags`) |
| `search` | string | No | — | Text search across alert name, description, position, code |
| `sort` | string (JSON) | No | `{"ts":-1}` | Sort spec (default: newest first) |
| `offset` | integer | No | 0 | Pagination offset |
| `limit` | integer | No | 100 | Page size (max 1000\) |
| `overwriteCache` | boolean | No | false | Bypass cache |

**Replaces (60 sequential API calls → 1):**

- `GET /auth/history-log?start=X&end=Y&logType=alerts` — called sequentially in 12-hour intervals  
- Frontend interval-splitting in `useFetchHistoricalLogsPaginatedData.ts` (`breakTimeIntoIntervals()`)  
- Frontend deduplication in `updateHistoricalData()`  
- Frontend client-side filtering (by tags, severity, search text)

**Used by:** Historical Alerts view (`HistoricalAlerts.tsx`). The single biggest performance win — eliminates the sequential 12-hour interval fetching pattern (60 calls for a 30-day range) with a single call that handles server-side filtering, deduplication, sorting, and pagination.

---

## Summary

| \# | Endpoint | Priority | Calls Replaced | Primary UI Location |
| :---- | :---- | :---- | :---- | :---- |
| 1 | `GET /auth/site/status/live` | P0 | 5 → 1 | Header bar |
| 2 | `GET /auth/site/alerts` | P0 | 1 | Current Alerts, Dashboard |
| 3 | `GET /auth/miners` | P0 | 1 | Explorer (miner list) |
| 4 | `GET /auth/containers` | P0 | 1 | Explorer (container list), Sites Overview |
| 5 | `GET /auth/containers/:id/telemetry` | P1 | 2 → 1 | Container detail (PDU Grid, Home) |
| 6 | `GET /auth/cabinets` | P1 | 1 \+ \~400 LOC | Explorer (LV Cabinets) |
| 7 | `GET /auth/pools` | P1 | 2 → 1 | Header, Pool Stats |
| 8 | `GET /auth/metrics/hashrate` | P0 | 3 → 1 | Dashboard, Hashrate Report, Ops |
| 9 | `GET /auth/metrics/consumption` | P1 | 2 → 1 | Dashboard, Energy Report |
| 10 | `GET /auth/metrics/efficiency` | P1 | 2 → 1 | Ops Dashboard |
| 11 | `GET /auth/metrics/miner-status` | P1 | 1 | Ops Dashboard (status chart) |
| 12 | `GET /auth/metrics/power-mode` | P1 | 1 | Ops Dashboard (power mode chart) |
| 13 | `GET /auth/metrics/power-mode/timeline` | P1 | 1 | Power Mode Timeline |
| 14 | `GET /auth/metrics/temperature` | P1 | 1 | Container Widget, Ops Dashboard |
| 15 | `GET /auth/containers/:id/telemetry/history` | P1 | 1 | Container Charts (temp, pressure) |
| 16 | `GET /auth/finance/revenue` | P0 | 1 \+ FE logic | Revenue chart |
| 17 | `GET /auth/finance/revenue-summary` | P0 | 9 → 1 \+ 1500 LOC | Revenue Summary page |
| 18 | `GET /auth/finance/ebitda` | P0 | multi → 1 | EBITDA chart |
| 19 | `GET /auth/finance/energy-balance` | P0 | 5 → 1 | Energy Balance page |
| 20 | `GET /auth/finance/cost-summary` | P1 | 5 → 1 \+ 350 LOC | Cost Summary page |
| 21 | `GET /auth/finance/subsidy-fees` | P2 | 1 \+ FE logic | Subsidy & Fees chart |
| 22 | `GET /auth/finance/hash-revenue` | P1 | multi \+ FE logic | Hash Revenue chart |
| 23 | `GET /auth/market/bitcoin` | P1 | 2 → 1 | All financial views |
| 24 | `GET /auth/market/bitcoin/price` | P1 | 1 | BTC price chart |
| 25 | `GET /auth/reports/operations` | P1 | multi → 1 | Operations Report |
| 26 | `GET /auth/pool-stats/aggregate` | P2 | 1 \+ FE logic | Pool Stats Report |
| 27 | `GET /auth/pools/:pool/balance-history` | P2 | 1 \+ FE logic | Pool Balance chart |
| 28 | `GET /auth/alerts/history` | P0 | 60 → 1 | Historical Alerts |

**Total: 28 endpoints replacing 100+ legacy API calls and \~4,000 lines of frontend business logic.**  


