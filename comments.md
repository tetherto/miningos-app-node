# Asana Ticket Comments
_Generated: 2026-03-09 14:24:03_

---

## GET /auth/metrics/miners/status — [1213140752769914](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213140752769914)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
_No comments._

### Attachments
_No attachments._

---

## GET /auth/metrics/power/mode — [1213140752769922](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213140752769922)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
_No comments._

### Attachments
_No attachments._

---

## GET /auth/metrics/power-mode/timeline — [1213140752769920](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213140752769920)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
| # | Author | Date | Comment |
|---|--------|------|---------|
| 1 | Caesar Mukama | 2026-02-20 | PR: https://github.com/tetherto/miningos-app-node/pull/21 |
| 2 | Roberto Dilillo | 2026-03-05 | The limit parameter is:<br>    Documented in the endpoint spec (default 10080)<br>    Accepted by the schema (though not explicitly declared — not validated)<br>    Included in cache key (req.query.limit) — different limit values create separate cache entries<br>    NOT used in the handler — never passed to the RPC payload, never used to truncate results<br><br>// Handler (metrics.handlers.js:378-405)<br>async function getPowerModeTimeline (ctx, req) {<br>  const now = Date.now()<br>  const star... |
| 3 | Roberto Dilillo | 2026-03-05 | not deployed, tested locally |

### Attachments
_No attachments._

---

## GET /auth/metrics/temperature — [1213145436151980](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213145436151980)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
| # | Author | Date | Comment |
|---|--------|------|---------|
| 1 | Caesar Mukama | 2026-02-20 | PR: https://github.com/tetherto/miningos-app-node/pull/21 |
| 2 | Roberto Dilillo | 2026-03-05 | this might be a Staging only issue:<br>"maintenance" Container with Zero Temperatures<br>Live response includes a container named maintenance with maxC: 0, avgC: 0 across all time points. This appears to be a miner status category leaking into the container namespace via temperature_c_group_max_aggr keys. It's not a physical container — it's miners in maintenance mode being grouped as a "container".<br>Impact: The FE would show a maintenance entry in the temperature chart with a flat line at 0°C... |
| 3 | Roberto Dilillo | 2026-03-05 | Backend Implementation Review & Improvement Suggestions<br>A. Filter out non-physical containers<br>The maintenance group appears because miners in maintenance mode have their keys grouped under temperature_c_group_max_aggr. Add a filter:<br>const EXCLUDED_CONTAINERS = new Set(['maintenance'])<br><br>for (const [name, maxVal] of Object.entries(maxObj)) {<br>  if (EXCLUDED_CONTAINERS.has(name)) continue<br>  if (containerFilter && name !== containerFilter) continue<br>  // ...<br>}<br>Or better: ... |
| 4 | Roberto Dilillo | 2026-03-05 | #<br>Issue<br>Severity<br>Effort<br>Recommendation<br>1<br>maintenance container in results skews site average<br>MEDIUM<br>Low<br>Filter out zero-temp containers from siteAvgC calculation<br>2<br>Missing Cache-Control header<br>MEDIUM<br>Low<br>Add Cache-Control: no-store<br>3<br>Missing X-Content-Type-Options: nosniff<br>MEDIUM<br>Low<br>Add server-wide<br>4<br>No capCheck on operational data<br>LOW-MEDIUM<br>Low<br>Add metrics:read permission<br>5<br>Response key log/summary vs spec data<br>L... |

### Attachments
_No attachments._

---

## GET /auth/metrics/containers/:id/history — [1213145436151986](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213145436151986)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
_No comments._

### Attachments
_No attachments._

---

## GET /auth/finance/revenue — [1213145436151978](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213145436151978)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
| # | Author | Date | Comment |
|---|--------|------|---------|
| 1 | Caesar Mukama | 2026-02-19 | PR: https://github.com/tetherto/miningos-app-node/pull/15 |
| 2 | Parag More | 2026-02-26 | https://app.asana.com/1/45238840754660/profile/1209203898446158I dont think this one is merged Please attach correct PR |

### Attachments
_No attachments._

---

## GET /auth/finance/revenue-summary — [1213145436151984](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213145436151984)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
| # | Author | Date | Comment |
|---|--------|------|---------|
| 1 | Caesar Mukama | 2026-02-19 | PR: https://github.com/tetherto/miningos-app-node/pull/16 |
| 2 | Parag More | 2026-02-26 | https://app.asana.com/1/45238840754660/profile/1209203898446158I dont think this one is merged Please attach correct PR |

### Attachments
_No attachments._

---

## GET /auth/finance/ebitda — [1213145436151990](https://app.asana.com/1/45238840754660/project/1213238597612203/task/1213145436151990)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
| # | Author | Date | Comment |
|---|--------|------|---------|
| 1 | Caesar Mukama | 2026-02-12 | PR: https://github.com/tetherto/miningos-app-node/pull/5 |
| 2 | Caesar Mukama | 2026-02-15 | PR: https://github.com/tetherto/miningos-app-node/pull/11 |
| 3 | Unknown | 2026-02-17 |  https://app.asana.com/1/45238840754660/profile/1209203898446158  https://app.asana.com/1/45238840754660/profile/1208374908209019 this endpoint is ready for FE review, please sync to proceed to review if it meets FE expectations and with the OWASP security review (integration blocked until after Georgia deployment). |
| 4 | Parag More | 2026-02-20 | The api is giving 0 values for all fields please verify once. The revenue should not be 0 for sure as I see revenue in revenue summay apis<br><br>{<br>    "log": [<br>        {<br>            "ts": 1767225600000,<br>            "revenueBTC": 0,<br>            "revenueUSD": 0,<br>            "btcPrice": 0,<br>            "powerW": 0,<br>            "hashrateMhs": 0,<br>            "consumptionMWh": 0,<br>            "energyCostsUSD": 0,<br>            "operationalCostsUSD": 0,<br>            "tot... |
| 5 | Parag More | 2026-02-20 | Test API Collection |
| 6 | Unknown | 2026-02-23 | https://app.asana.com/1/45238840754660/profile/1207496533136374 please review with a focus on incorrect API calls, data aggregation issues, and anything else that could affect the feature. |
| 7 | Roberto Dilillo | 2026-03-03 | CRITICAL BUG: All Fields Returning Zero<br>Status: CONFIRMED BY CODE — root cause identified<br>A peer reviewer reported that this endpoint returns all-zero data:<br><br>{<br>  "log": [<br>    { "ts": 1767225600000, "revenueBTC": 0, "revenueUSD": 0, "btcPrice": 0, ... }<br>  ],<br>  "summary": { "totalRevenueBTC": 0, "totalRevenueUSD": 0, "currentBtcPrice": 0, ... }<br>}<br><br><br>Meanwhile, the revenue-summary endpoint (legacy API) shows non-zero revenue for the same time range.<br>Root Cause ... |

### Attachments
- [MiningOS_Finance_APIs.postman_collection.json](https://asanausercontent.com/us1/assets/45238840754660/1213348817875990/912a9edbacf92127e5b2fc9a1cf3bf34?e=1773057165&v=0&t=zObbwtW3krG48TxsIJ7nr787X5yGqTowoG9rY-rtp9U)

---

## GET /auth/finance/energy-balance — [1213145436151976](https://app.asana.com/1/45238840754660/project/1213238597612203/task/1213145436151976)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
| # | Author | Date | Comment |
|---|--------|------|---------|
| 1 | Caesar Mukama | 2026-02-12 | PR: https://github.com/tetherto/miningos-app-node/pull/3 |
| 2 | Caesar Mukama | 2026-02-15 | PR: https://github.com/tetherto/miningos-app-node/pull/11 |
| 3 | Unknown | 2026-02-17 |  https://app.asana.com/1/45238840754660/profile/1209203898446158  https://app.asana.com/1/45238840754660/profile/1208374908209019 this endpoint is ready for FE review, please sync to proceed to review if it meets FE expectations and with the OWASP security review (integration blocked until after Georgia deployment). |
| 4 | Unknown | 2026-02-18 |  https://app.asana.com/1/45238840754660/profile/1209203898446158  https://app.asana.com/1/45238840754660/profile/1208374908209019 this endpoint is ready for FE review, please sync to proceed to review if it meets FE expectations and with the OWASP security review (integration blocked until after Georgia deployment). |
| 5 | Parag More | 2026-02-20 | https://app.asana.com/1/45238840754660/profile/1209203898446158<br><br>Negative timestamps should fail but this is giving 200 response. Please run the tests for energy balance api postman collection attached here |
| 6 | Unknown | 2026-02-23 | https://app.asana.com/1/45238840754660/profile/1207496533136374 please review with a focus on incorrect API calls, data aggregation issues, and anything else that could affect the feature. |
| 7 | Roberto Dilillo | 2026-03-03 |     Negative timestamps return 200 instead of 400<br>Status: CONFIRMED BY CODE<br>GET /auth/finance/energy-balance?start=-1764335313758&end=-1<br>Returns 200 OK. The handler's validation:<br><br>// finance.handlers.js:27-28<br>if (!start \|\| !end) {<br>  throw new Error('ERR_MISSING_START_END')<br>}<br><br><br>Negative numbers are truthy in JavaScript (!(-1764335313758) → false), so they pass. Then new Date(-1764335313758) produces 1914-02-03T10:51:26.242Z — a syntactically valid but absurd dat... |
| 8 | Roberto Dilillo | 2026-03-03 | A. Fix negative timestamp validation<br>// Current (finance.handlers.js:27-33)<br>if (!start \|\| !end) {<br>  throw new Error('ERR_MISSING_START_END')<br>}<br>if (start >= end) {<br>  throw new Error('ERR_INVALID_DATE_RANGE')<br>}<br><br>// Improved<br>const MIN_TS = 1000000000000 // ~2001-09<br>const MAX_RANGE_MS = 2 * 365 * 86400000 // 2 years<br><br>if (!Number.isInteger(start) \|\| !Number.isInteger(end) \|\| start < MIN_TS \|\| end < MIN_TS) {<br>  throw new Error('ERR_INVALID_TIMESTAMP')<... |
| 9 | Roberto Dilillo | 2026-03-03 | 5. Priority Remediation Matrix<br><br>#<br>Issue<br>Severity<br>Effort<br>Recommendation<br>1<br>Negative timestamps accepted (200)<br>HIGH<br>Low<br>Add start < MIN_TS validation<br>2<br>Duplicate electricity RPC call<br>MEDIUM<br>Low<br>Single call, extract both fields<br>3<br>Math.abs inflates revenue<br>MEDIUM<br>Low<br>Filter positive values or track credits/debits separately<br>4<br>Per-MWh ratios summed in aggregation<br>MEDIUM<br>Low<br>Recalculate ratios post-aggregation<br>5<br>No rate... |

### Attachments
- MiningOS API v2 — Backend Endpoint Analysis
- [MiningOS_Finance_APIs.postman_collection.json](https://asanausercontent.com/us1/assets/45238840754660/1213348817875983/cd82ced7918a6dc91bd01e9034b60b8f?e=1773057165&v=0&t=2rVaLT0HvT0mffkKXnwpFLXof3un8h4Tlp7OFx2aAqQ)

---

## GET /auth/finance/cost-summary — [1213145436151992](https://app.asana.com/1/45238840754660/project/1213238597612203/task/1213145436151992)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
| # | Author | Date | Comment |
|---|--------|------|---------|
| 1 | Caesar Mukama | 2026-02-12 | PR: https://github.com/tetherto/miningos-app-node/pull/6 |
| 2 | Caesar Mukama | 2026-02-15 | PR: https://github.com/tetherto/miningos-app-node/pull/11 |
| 3 | Unknown | 2026-02-17 |  https://app.asana.com/1/45238840754660/profile/1209203898446158  https://app.asana.com/1/45238840754660/profile/1208374908209019 this endpoint is ready for FE review, please sync to proceed to review if it meets FE expectations and with the OWASP security review (integration blocked until after Georgia deployment). |
| 4 | Unknown | 2026-02-18 |  https://app.asana.com/1/45238840754660/profile/1209203898446158  https://app.asana.com/1/45238840754660/profile/1208374908209019 this endpoint is ready for FE review, please sync to proceed to review if it meets FE expectations and with the OWASP security review (integration blocked until after Georgia deployment). |
| 5 | Parag More | 2026-02-20 | All the cost values are showing up zero for all interval types , please check https://app.asana.com/1/45238840754660/profile/1209203898446158<br><br><br>{<br>    "log": [<br>        {<br>            "ts": 1767225600000,<br>            "consumptionMWh": 173.3691348,<br>            "energyCostsUSD": 0,<br>            "operationalCostsUSD": 0,<br>            "totalCostsUSD": 0,<br>            "allInCostPerMWh": 0,<br>            "energyCostPerMWh": 0,<br>            "btcPrice": 0,<br>            "y... |
| 6 | Parag More | 2026-02-20 | Postman Collection |
| 7 | Unknown | 2026-02-23 | https://app.asana.com/1/45238840754660/profile/1207496533136374 please review with a focus on incorrect API calls, data aggregation issues, and anything else that could affect the feature. |
| 8 | Roberto Dilillo | 2026-03-04 | All Cost Values Returning Zero<br>Status: CONFIRMED BY CODE — root cause identified<br>A peer reviewer reported all cost values are zero for all interval types. Three independent issues contribute.<br>Root Cause 1: Production costs not configured or getProductionCosts returns empty<br>The cost data flow:<br>FE Cost Input page → setProductionCostsData() → LevelDB (key: year*100+month)<br>                                                          ↓<br>                               getProductionCos... |
| 9 | Roberto Dilillo | 2026-03-04 | Review & Improvement Suggestions<br>A. Add "costs configured" indicator to response<br>return {<br>  log: aggregated,<br>  summary,<br>  meta: {<br>    costsConfigured: Object.keys(costsByMonth).length > 0,<br>    monthsCovered: Object.keys(costsByMonth)<br>  }<br>}<br>B. Fix date filter to include first partial month<br>// Current — excludes first partial month<br>const startDate = new Date(start)<br>return entryDate >= startDate && entryDate <= endDate<br><br>// Fixed — use start-of-month for ... |
| 10 | Roberto Dilillo | 2026-03-04 | Security<br>Good<br>Auth works, site-scoped. Standard finance endpoint gaps: no rate limiting, no Cache-Control, negative timestamps.<br>FE Readiness<br>Partially Broken<br>Cost fields are 0 when production costs aren't configured (likely on dev). btcPrice always 0 (wrong RPC key). No indicator for "costs not configured". Ratio fields wrong for monthly/yearly.<br>Response Design<br>Needs Work<br>No costs-configured indicator, wrong BTC price, ratio aggregation bug, first month excluded.<br>Backe... |

### Attachments
- [MiningOS_Finance_APIs.postman_collection.json](https://asanausercontent.com/us1/assets/45238840754660/1213348817875998/d1ecd1804492edc9767612e235b6f64b?e=1773057165&v=0&t=e8-johshej8tzEE8W2Bn-tu-FdmBIFh-RLrfGIPWxKs)

---

## GET /auth/finance/subsidy-fees — [1213145436151988](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213145436151988)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
| # | Author | Date | Comment |
|---|--------|------|---------|
| 1 | Caesar Mukama | 2026-02-19 | PR: https://github.com/tetherto/miningos-app-node/pull/14 |
| 2 | Parag More | 2026-02-26 | https://app.asana.com/1/45238840754660/profile/1209203898446158<br><br>None of them send back data, log and summary are having empty values<br><br>curl --location 'https://dev-moria.tether.to/auth/finance/subsidy-fees?start=1764339562260&end=1772115562260&period=daily' \<br>--header 'Authorization: Bearer pub:abc-roles:admin'<br><br>curl --location 'https://dev-moria.tether.to/auth/finance/subsidy-fees?start=1764339562260&end=1772115562260&period=weekly' \<br>--header 'Authorization: Bearer pub:... |
| 3 | Parag More | 2026-02-26 | Also IMO we should add validation in all period apis to fail if negative timestamps are passed |
| 4 | Parag More | 2026-02-26 | Collection used for basic tests. and performed manual tests to check the response data and structure |

### Attachments
- [MiningOS_Finance_Subsidy_Fees_API.postman_collection.json](https://asanausercontent.com/us1/assets/45238840754660/1213453334188221/a62a4b8265a5e7d83437458382ee69dd?e=1773057165&v=0&t=ktg756b3S_VgCYRSt3XNGn4bmR_J6XBPe4sRHzvXxh4)

---

## GET /auth/finance/hash-revenue — [1213145436151974](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213145436151974)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
| # | Author | Date | Comment |
|---|--------|------|---------|
| 1 | Caesar Mukama | 2026-03-06 | PR: https://github.com/tetherto/miningos-app-node/pull/27 |

### Attachments
_No attachments._

---

## GET /auth/mempool/stats/bitcoin — [1213145436151982](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213145436151982)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
_No comments._

### Attachments
_No attachments._

---

## GET /auth/mempool/price/bitcoin — [1213145436151996](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213145436151996)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
_No comments._

### Attachments
_No attachments._

---

## GET /auth/reports/operations — [1213145436152000](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213145436152000)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
_No comments._

### Attachments
_No attachments._

---

## /auth/pool-stats/aggregate — [1213145436151998](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213145436151998)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
| # | Author | Date | Comment |
|---|--------|------|---------|
| 1 | Caesar Mukama | 2026-02-12 | PR: https://github.com/tetherto/miningos-app-node/pull/9 |
| 2 | Caesar Mukama | 2026-02-15 | PR: https://github.com/tetherto/miningos-app-node/pull/11 |
| 3 | Unknown | 2026-02-17 |  https://app.asana.com/1/45238840754660/profile/1209203898446158  https://app.asana.com/1/45238840754660/profile/1208374908209019 this endpoint is ready for FE review, please sync to proceed to review if it meets FE expectations and with the OWASP security review (integration blocked until after Georgia deployment). |
| 4 | Unknown | 2026-02-18 |  https://app.asana.com/1/45238840754660/profile/1209203898446158  https://app.asana.com/1/45238840754660/profile/1208374908209019 this endpoint is ready for FE review, please sync to proceed to review if it meets FE expectations and with the OWASP security review (integration blocked until after Georgia deployment). |
| 5 | Parag More | 2026-02-26 | https://app.asana.com/1/45238840754660/profile/1209203898446158 for <br><br>https://dev-moria.tether.to/auth/pool-stats/aggregate?start=1764335313758&end=1772111313758&range=daily<br><br>Its giving only 59 days of data, instead of 90 days as per timestamps above |
| 6 | Parag More | 2026-02-26 | https://app.asana.com/1/45238840754660/profile/1209203898446158<br>Also for range aggregates when we use monthly we see the monthName   so its easy to know which month we are working with, but in weekly we get only ts, should we add the timerange over which we are considering the week rather than just timestamp?<br>One more point to note is its considering Sunday as start of week and not Monday.<br><br>Example data for week<br><br><br>        {<br>            "ts": 1769299200000,<br>            ... |
| 7 | Parag More | 2026-02-26 | https://app.asana.com/1/45238840754660/profile/1209203898446158<br><br>The pool filter is not working<br><br>curl --location 'https://dev-moria.tether.to/auth/pool-stats/aggregate?start=1764335955846&end=1772111955846&pool=antpool' \<br>--header 'Authorization: Bearer pub:api:ABC-roles:admin'<br><br>This one returns data |
| 8 | Parag More | 2026-02-26 | We also cant see the pool name if its expected in response |
| 9 | Parag More | 2026-02-26 | Used this collection to do basic tests and completed some manual testing by checking the api responses |
| 10 | Roberto Dilillo | 2026-03-02 | Summary Verdict<br><br>Area<br>Rating<br>Notes<br>Security<br>Good<br>Auth works, Cloudflare WAF active, CORS locked down. Main gaps: no rate limiting, no Cache-Control on financial data, overwriteCache exposed to all users.<br>FE Readiness<br>Partial<br>Core data shape works for pool stats charts, but workerCount is dead, balance is misleading, no per-pool breakdown, no USD conversion.<br>Response Design<br>Needs Work<br>Duplicate/misleading field names, no unit metadata, no data freshness indi... |
| 11 | Roberto Dilillo | 2026-03-02 | 1<br>Only 59 days instead of 90<br>CONFIRMED<br>processTransactionData only creates entries for days with transactions — no gap-filling<br>2<br>Weekly uses Sunday as start<br>CONFIRMED<br>getUTCDay() returns 0 for Sunday, used directly as offset — should use ISO Monday<br>3<br>Weekly lacks range metadata<br>CONFIRMED<br>Monthly gets monthName/year/month, weekly only gets bare ts<br>4<br>Pool filter doesn't work<br>CONFIRMED<br>pool is sent to ORK RPC but processTransactionData has zero pool filt... |
| 12 | Roberto Dilillo | 2026-03-02 | https://app.asana.com/1/45238840754660/profile/1205063919763609 i did the review and owasp of this one, how should the process work? who should i pass my tickets to for checking them? |
| 13 | andreu.honzawa@tether.to | 2026-03-03 | https://app.asana.com/1/45238840754660/profile/1209203898446158 check the feedback provided by https://app.asana.com/1/45238840754660/profile/1208374908209019 in the subtasks, moving this ticket back to you |
| 14 | andreu.honzawa@tether.to | 2026-03-03 | https://github.com/tetherto/miningos-app-node/pull/25 |
| 15 | andreu.honzawa@tether.to | 2026-03-03 | https://app.asana.com/1/45238840754660/profile/1208374908209019 I just check with https://app.asana.com/1/45238840754660/profile/1209203898446158 and he said this is not clear can you please help clarify<br><br>https://app.asana.com/app/asana/-/get_asset?asset_id=1213507404731604<br> |
| 16 | Roberto Dilillo | 2026-03-04 | please feel free to reach out or type here any question https://app.asana.com/1/45238840754660/profile/1209203898446158. Avoid generic "clarify" requests because the above is a report that takes half a day to write and it includes multiple things.<br><br>cc https://app.asana.com/1/45238840754660/profile/1205063919763609 |
| 17 | Caesar Mukama | 2026-03-04 | Thanks for the review https://app.asana.com/1/45238840754660/profile/1208374908209019 Absolutely,<br>    Duplicate/misleading field names - what names are misleading?<br>    No unit metadata - what metadata is missing? Also, is there a spec document for expected metadata or are these new features?<br>    No data freshness indicators - what are data freshness indicators? Is there a spec document not being followed or are these new features?<br>    Math.abs accounting issues - is math.abs being ap... |
| 18 | Roberto Dilillo | 2026-03-04 |      Duplicate/misleading field names — what names are misleading?<br>    information were written in subtask https://app.asana.com/1/45238840754660/task/1213314123096942/comment/1213497616048404?focus=true, and you can find in the table the owasp number and check details in the subtask<br><br>balance in log[] entries. This does not represent the actual pool balance. It's just a copy of revenueBTC (the period's revenue). The handler code at line ~221 does balance: data.revenueBTC. So if the fron... |

### Attachments
- [MiningOS_Pool_Stats_Aggregate_API.postman_collection.json](https://asanausercontent.com/us1/assets/45238840754660/1213453334185116/d05c5d269a6b1d292158236e017d5bd6?e=1773057165&v=0&t=gHFGeQSrzn3kp6pURDfZlR8IThRY23IET4w-KQZe3ts)
- [image.png](https://asanausercontent.com/us1/assets/45238840754660/1213507404731603/d726b7c927223a0115911951ea94bd2f?e=1773057165&v=0&t=hJIvo67AT-fZqN_g8D0fxMXiZOgIA-VeyNZ0JGjM54I)

---

## GET /auth/pools/:pool/balance-history — [1213145436151994](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213145436151994)
**Assignee:** Roberto Dilillo  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
| # | Author | Date | Comment |
|---|--------|------|---------|
| 1 | Caesar Mukama | 2026-02-12 | PR: https://github.com/tetherto/miningos-app-node/pull/8 |
| 2 | Caesar Mukama | 2026-02-15 | PR: https://github.com/tetherto/miningos-app-node/pull/11 |
| 3 | Unknown | 2026-02-17 |  https://app.asana.com/1/45238840754660/profile/1209203898446158  https://app.asana.com/1/45238840754660/profile/1208374908209019 this endpoint is ready for FE review, please sync to proceed to review if it meets FE expectations and with the OWASP security review (integration blocked until after Georgia deployment). |
| 4 | Unknown | 2026-02-18 |  https://app.asana.com/1/45238840754660/profile/1209203898446158  https://app.asana.com/1/45238840754660/profile/1208374908209019 this endpoint is ready for FE review, please sync to proceed to review if it meets FE expectations and with the OWASP security review (integration blocked until after Georgia deployment). |
| 5 | Parag More | 2026-02-26 | https://app.asana.com/1/45238840754660/profile/1209203898446158the pool filter does not work and returns same data for all the pool params<br><br>ex:<br><br>curl --location 'https://dev-moria.tether.to/auth/pools/ant/balance-history?start=1764338181148&end=1772114181148&range=1W' \<br>--header 'Authorization: Bearer pub:api:ABC-roles:admin'<br><br>give back data, but ant pool does not exist on staging |
| 6 | Parag More | 2026-02-26 | https://app.asana.com/1/45238840754660/profile/1209203898446158the pool-stats/aggregate api uses range: weekly / monthly etc. but <br><br>This api expects 1W / 1D / 1M. can we follow same convention for all apis and not implement seperate for each one of them |
| 7 | Parag More | 2026-02-26 | For<br><br>curl --location 'https://dev-moria.tether.to/auth/pools/ant/balance-history?start=1764338387569&end=1772114387569&range=1M' \<br>--header 'Authorization: Bearer pub:ABC:admin'<br><br>It should have returned data monthly with month year and other response structure like the pool-stats/aggregate api but thats not the case and the response structure is completely different and returns only one data point.<br><br>:<br><br>{<br>    "log": [<br>        {<br>            "ts": 1762560000000,<... |
| 8 | Parag More | 2026-02-26 | This api call returns only few datapoints. but ideally should have almost 90 <br><br>curl --location 'https://dev-moria.tether.to/auth/pools/ant/balance-history?start=1764338513764&end=1772114513764' \<br>--header 'Authorization: Bearer pub:api:ABC-roles:admin'<br><br>returned respons<br><br><br>{<br>    "log": [<br>        {<br>            "ts": 1764374400000,<br>            "balance": 0.0007894665835364325,<br>            "hashrate": 611539599417678,<br>            "revenue": 0.000789466583536... |
| 9 | Parag More | 2026-02-26 | Used this collection for basic testing and then did manual testing of the response structure and api responses expected |
| 10 | andreu.honzawa@tether.to | 2026-03-03 | https://github.com/tetherto/miningos-app-node/pull/25 |

### Attachments
- [MiningOS_Pool_Balance_History_API.postman_collection.json](https://asanausercontent.com/us1/assets/45238840754660/1213453334188204/6950bba963a971531c8e67c9bcb7bff6?e=1773057165&v=0&t=RNDl3a4wWSCjXnJ1rek_vVcBepy5kIsAGvUHe-nh4sE)

---

## GET /auth/alerts/history — [1213145436152002](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213145436152002)
**Assignee:** Caesar Mukama  
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
_No comments._

### Attachments
_No attachments._
