---
title: Bug Report API
sidebarTitle: Bug Report
description: REST API endpoints for submitting bug reports from the dashboard.
---

## Get Environment Info

```
GET /api/bug-report/info
```

Returns the server's Node.js version and OS platform, used by the frontend to pre-fill environment fields in the bug report form.

**Response:**
```json
{ "nodeVersion": "v20.11.0", "platform": "linux" }
```

## Submit Bug Report

```
POST /api/bug-report
```

Submits a bug report. If `GITHUB_TOKEN` is set in the environment, creates a GitHub issue on the project repository with labels `bug`, `triage`, `user-reported`. Without the token, returns a pre-filled GitHub issue URL as a fallback.

Rate-limited to **5 submissions per IP per 10-minute window**.

**Request body:**

| Field | Type | Required | Max Length |
|-------|------|----------|-----------|
| `description` | string | yes | 80 chars (used as issue title) |
| `stepsToReproduce` | string | yes | — |
| `expectedBehavior` | string | no | — |
| `actualBehavior` | string | no | — |
| `environment` | string | no | 200 chars |
| `nodeVersion` | string | no | 200 chars |
| `modelProvider` | string | no | 200 chars |
| `logs` | string | no | 50,000 chars |

All fields are HTML-stripped before use.

**Response — with GitHub token:**
```json
{ "url": "https://github.com/milady-ai/milady/issues/42" }
```

**Response — without GitHub token:**
```json
{ "fallback": "https://github.com/milady-ai/milady/issues/new?template=bug_report.yml" }
```

**Errors:** `400` missing required fields; `429` rate limit exceeded; `502` GitHub API error.
