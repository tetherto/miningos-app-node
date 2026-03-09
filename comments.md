# Asana Ticket Comments
_Generated: 2026-03-09_

---

## GET /auth/site/status/live — [1213140752769899](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213140752769899)
**Assignee:** Caesar Mukama
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
| # | Author | Date | Comment |
|---|--------|------|---------|-
| 1 | Parag More | 2026-02-12T07:22:43.450Z | PR: https://github.com/tetherto/miningos-app-node/pull/4 |
| 2 | Unknown | 2026-02-18T09:54:45.678Z | this endpoint is ready for FE review, please sync to proceed to review if it meets FE expectations and with the OWASP security review (integration blocked until after Georgia deployment). |
| 3 | Roberto Dilillo | 2026-02-23T11:24:50.892Z | Summary Verdict — Area Rating Notes: Security Good — Auth works, Cloudflare WAF helps, CORS locked down. Fix the missing Cache-Control, add rate limiting, clean up duplicate headers. FE Readiness Partial — Good data shape for mining metrics, but does NOT fully replace the other header requests (missing site name). The hashrate utilization at 892% and power nominal at 0 are data quality red flags. Response Design Needs Work — Missing units, no data health indicators, no low/info alert levels, timestamp format is ambiguous, excessive float precision. |
| 4 | Unknown | 2026-03-03T12:52:58.129Z | please review with a focus on incorrect API calls, data aggregation issues, and anything else that could affect the feature. |
| 5 | Unknown | 2026-03-03T12:53:20.958Z | this endpoint has passed internal testing by BE team and is ready for FE review. While the endpoint is in Product Design section, please proceed to review if it meets FE expectations and with the OWASP security review. Once you give the greenlight, please move the ticket to Under Estimation and then to In Progress for the integration. |
| 6 | Caesar Mukama | 2026-03-07T15:41:00.717Z | Great, thanks for the review |

### Attachments
_None_

---

## GET /auth/alerts/site — [1213140752769902](https://app.asana.com/1/45238840754660/project/1213238597612203/task/1213140752769902)
**Assignee:** Caesar Mukama
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
_No comments_

### Attachments
_None_

---

## GET /auth/miners — [1213140752769906](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213140752769906)
**Assignee:** Parag More
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
| # | Author | Date | Comment |
|---|--------|------|---------|-
| 1 | Parag More | 2026-02-18T16:42:27.644Z | I have already made some progress on this. Reassigning to myself, will raise PR tomorrow |
| 2 | Parag More | 2026-02-18T16:42:41.582Z | CC: (tagged user) |
| 3 | Parag More | 2026-02-19T13:06:45.006Z | PR: https://github.com/tetherto/miningos-app-node/pull/13 |
| 4 | Parag More | 2026-02-26T14:07:51.629Z | (tagged user) has suggested to create a new subtask and working on it. We can mark it ready for review again after this is implemented. Slack thread: https://tether-to.slack.com/archives/C09T82CH0QG/p1771858738736529?thread_ts=1771506426.046169&cid=C09T82CH0QG |
| 5 | andreu.honzawa@tether.to | 2026-03-03T12:47:21.995Z | (tagged user) has almost completed the subtask, the api is already in review and has review comments. |

### Attachments
_None_

---

## GET /auth/containers — [1213140752769908](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213140752769908)
**Assignee:** Roberto Dilillo
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
| # | Author | Date | Comment |
|---|--------|------|---------|-
| 1 | andreu.honzawa@tether.to | 2026-03-03T15:01:48.761Z | https://github.com/tetherto/miningos-app-node/pull/25 |

### Attachments
_None_

---

## GET /auth/metrics/containers/:id — [1213140752769910](https://app.asana.com/1/45238840754660/project/1212897658511275/task/1213140752769910)
**Assignee:** Caesar Mukama
**Description:** https://docs.google.com/document/d/1hkdYCYeS1V8jR6Ot0PdZsEHq4m8g3r753BZJht5mBSM/edit?usp=sharing

### Comments
_No comments_

### Attachments
_None_
