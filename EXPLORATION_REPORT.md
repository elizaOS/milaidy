# Milaidy Codebase Exploration Report

**Date:** 2026-02-10
**Branch:** develop
**Version:** 2.0.0-alpha.9

---

## Executive Summary

Milaidy is a **personal AI assistant** built on ElizaOS — a single-user, local-first agent with a web dashboard, desktop app (Electron/Capacitor), and Chrome extension. The codebase is **mature and well-structured** with surprisingly little scaffolding for an alpha. The UI is feature-complete, the runtime is solid, and most issues are around **reliability, observability, and auth edge cases** rather than missing functionality.

This report covers three focus areas in depth: **Chrome Extension**, **API Server**, and **Auth Reliability**. Each section explains how the system works today, what's broken or missing, and what work would have the highest impact.

---

## How It All Fits Together

```
┌─────────────────────────────────────────────────────────────────────┐
│  User                                                               │
│  ├── Web Dashboard (localhost:2138)  ── Vite + React + Tailwind     │
│  ├── Desktop App (Electron/Capacitor)                               │
│  └── Chrome Extension (CDP relay)                                   │
│           │                                                         │
│           ▼                                                         │
│  ┌─────────────────────────────────────────────┐                    │
│  │  API Server (src/api/server.ts, 6427 lines) │ ◄── 100+ endpoints│
│  │  HTTP + WebSocket on localhost:31337         │                    │
│  └──────────────────┬──────────────────────────┘                    │
│                     │                                               │
│  ┌──────────────────▼──────────────────────────┐                    │
│  │  ElizaOS Runtime (src/runtime/eliza.ts)     │                    │
│  │  Plugins, Services, Agent Character         │                    │
│  └──────────────────┬──────────────────────────┘                    │
│                     │                                               │
│  ┌──────────────────▼──────────────────────────┐                    │
│  │  Model Providers                            │                    │
│  │  ├── Anthropic (subscription OAuth token)   │                    │
│  │  ├── Eliza Cloud (cloud.apiKey)             │                    │
│  │  ├── OpenAI / OpenRouter (env vars)         │                    │
│  │  └── Ollama (local, if running)             │                    │
│  └─────────────────────────────────────────────┘                    │
│                                                                     │
│  Config: ~/.milaidy/milaidy.json (JSON5, 0o600)                     │
│  Auth:   ~/.milaidy/auth/{provider}.json (0o600)                    │
│  Data:   PGLite embedded database                                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Startup sequence:**
1. Load `.env` files + config from `~/.milaidy/milaidy.json`
2. Apply subscription credentials → sets `process.env.ANTHROPIC_API_KEY`
3. Start API server (HTTP + WebSocket)
4. Boot ElizaOS runtime (character, plugins, services, database migrations)
5. Wire runtime into API server, restore conversations from DB
6. Vite dev server proxies UI on port 2138 → API on port 31337

---

## Deep Dive 1: Chrome Extension

### What It Is

A Chrome DevTools Protocol (CDP) relay bridge. The extension attaches to Chrome tabs via `chrome.debugger` and forwards CDP events/commands over WebSocket to the Milaidy runtime, allowing the agent to observe and control browser tabs.

**Files:**
- `apps/chrome-extension/background.js` — 439 lines, service worker (vanilla JS)
- `apps/chrome-extension/options.html` + `options.js` — Port configuration UI
- `apps/chrome-extension/manifest.json` — MV3, permissions: debugger, tabs, activeTab, storage

### How the CDP Relay Works

```
Chrome Tab ◄──chrome.debugger──► Extension (background.js)
                                      │
                                      │ WebSocket ws://127.0.0.1:18792/extension
                                      ▼
                              [RELAY SERVER — NOT IMPLEMENTED]
                                      │
                                      ▼
                              Milaidy Runtime (browser plugin)
```

**Message flow:**
- Extension → Server: `forwardCDPEvent` (navigation, console, network events), `pong` heartbeat
- Server → Extension: `forwardCDPCommand` (execute CDP methods on tabs), `ping` heartbeat

**Tab tracking:** Each attached tab gets a session ID (`cb-tab-1`, `cb-tab-2`, etc.), stored in a Map with state, targetId, and attachOrder for stable ordering. Child sessions (iframes, workers) are tracked separately.

**Connection lifecycle:** HTTP HEAD preflight check → WebSocket connect → send `Target.attachedToTarget` for each tab → bidirectional CDP relay → cleanup on disconnect.

### What It Can Do Today

| Capability | Status |
|------------|--------|
| Attach CDP to any tab | Working |
| Create/close/activate tabs | Working |
| Forward all CDP commands | Working |
| Handle child sessions (iframes) | Working |
| Badge status indicators | Working |
| Configurable relay port | Working |
| Options page with reachability test | Working |

### What's Missing (Critical)

1. **The relay server doesn't exist.** The extension client is complete but there's no WebSocket server on port 18792 in the codebase. The `driver: "extension"` config option is defined in types but not implemented in the browser plugin. This is the #1 gap — the extension literally cannot connect to anything.

2. **No authentication.** Extension → relay is unauthenticated plain WebSocket over loopback. Any local process could send arbitrary CDP commands (including `Runtime.evaluate` for JS execution, cookie access, DOM manipulation).

3. **No reconnection logic.** If the WebSocket drops, user must manually click the extension icon. No exponential backoff, no auto-reconnect.

### Bugs in Extension

| Bug | Severity | Description |
|-----|----------|-------------|
| BUG-8 | Medium | Zombie tabs: Debugger state isn't persisted. On extension restart, tabs stay attached but extension lost track of them. |
| BUG-9 | Medium | WebSocket race: Second caller to `ensureRelayConnection()` can bypass the connect guard during the initial promise. |
| Tab creation sleep | Low | 100ms `setTimeout` after `chrome.tabs.create` — fragile timing assumption. |
| Session counter reset | Low | `nextSession` resets on extension reload, could create duplicate session IDs. |

### Integration Points

- `GET /api/extension/status` — API endpoint that checks if relay is reachable (HTTP HEAD to port 18792)
- `apps/app/src/components/ConfigView.tsx:1130-1212` — UI section showing extension status + install instructions
- `src/config/types.milaidy.ts:51-91` — `BrowserConfig.driver: "milaidy" | "extension"` type defined but not wired

### Roadmap Assessment

The extension is **well-built client-side code** waiting for its server. To make it useful:

- **Quick win:** Fix zombie tab + race condition bugs (BUG-8, BUG-9)
- **Medium effort:** Implement the relay server as a WebSocket server in `src/api/` or `src/runtime/`
- **Full feature:** Wire `driver: "extension"` into the browser plugin, add auth, auto-reconnect

---

## Deep Dive 2: API Server

### The Problem

`src/api/server.ts` is **6427 lines** — the largest file in the codebase by 3x. It handles everything: REST endpoints, WebSocket, auth flows, plugin management, wallet operations, cloud integration, database routes, app launching, and more. It has **zero dedicated tests**.

The project's own `AGENTS.md` guideline says "~500 LOC" per file.

### Complete Route Inventory (100+ endpoints)

| Domain | Endpoints | Description |
|--------|-----------|-------------|
| **Auth** | 8 | Pairing, subscription OAuth (Anthropic, OpenAI), token exchange |
| **Onboarding** | 3 | Status check, options, completion |
| **Agent Lifecycle** | 9 | Start, stop, pause, resume, restart, reset, export, import |
| **Character** | 5 | CRUD, random name, AI generation, schema |
| **Plugins** | 7 | List, toggle, install/uninstall, core plugin management |
| **Plugin Registry** | 4 | Browse, search, details, refresh |
| **Skills** | 7 | List, refresh, toggle, create, open, delete, scan |
| **Skill Catalog** | 6 | Browse, search, details, refresh, install/uninstall |
| **Skill Marketplace** | 6 | Search, installed, install/uninstall, config |
| **Config** | 2 | Get (redacted), update (deep merge) |
| **Chat** | 7 | Send message, conversations CRUD, greeting generation |
| **Database** | 8 | Status, config, tables, rows CRUD, raw SQL |
| **Wallet** | 7 | Addresses, balances, NFTs, import, generate, export, RPC config |
| **Cloud** | 8 | Login flow, agents CRUD, provision, connect, credits |
| **Apps** | 7 | List, search, installed, launch, info, plugins, refresh |
| **Workbench** | 4 | Overview, goals CRUD, todos CRUD |
| **MCP** | 5 | Config CRUD, status, marketplace search/details |
| **Misc** | 5 | Logs, update status, channel switch, extension status, share ingest |

### WebSocket Architecture

- Path: `ws://host:port/ws` with `noServer: true` upgrade handling
- Connection tracking: `Set<WebSocket>` of active clients
- Status broadcast every 5 seconds to all clients
- Only message type from client: `ping` → server responds `pong`
- Server pushes `{ type: "status", state, agentName, model, startedAt }`

### Security (Good)

The server has solid security for a dev tool:
- **CORS**: Strict origin validation (localhost, capacitor, explicit allowlist)
- **Auth**: Optional `MILAIDY_API_TOKEN` with timing-safe comparison (`crypto.timingSafeEqual`)
- **Pairing**: 8-char alphanumeric codes, 10min TTL, 5 attempts/IP rate limit
- **SSRF protection**: DNS validation blocks cloud metadata IPs on database connections
- **Prototype pollution**: Blocks `__proto__`, `constructor`, `prototype` keys in config updates
- **SQL injection**: Read-only default for raw SQL, strips comments/strings
- **Path traversal**: Skill IDs validated with `SAFE_SKILL_ID_RE`

### State Management

| State | Storage | Notes |
|-------|---------|-------|
| Runtime reference | In-memory | Hot-swapped on restart |
| Config | Filesystem (`~/.milaidy/milaidy.json`) | |
| Agent state + name + model | In-memory | Broadcast via WS |
| Plugin/skill lists | In-memory (re-scanned on request) | No caching |
| Log buffer | In-memory circular (max 1000) | |
| Conversations | In-memory Map + database | Map never evicts (unbounded) |
| OAuth flows | In-memory (transient, 5-10 min TTL) | |
| Share ingest queue | In-memory (cleared on restart) | |

### Performance Concerns

| Issue | Severity | Details |
|-------|----------|---------|
| Synchronous I/O | Medium | `fs.readFileSync()` blocks event loop (config, skills, plugins) |
| No caching | Medium | Plugin/skill discovery re-reads filesystem on every request |
| Unbounded conversations | Low | `Map<string, ConversationMeta>` grows forever, no LRU eviction |
| No external timeouts | Medium | `fetch()` to Alchemy, Helius, skillsmp.ai has no timeout — can hang |
| Database search | Low | `ILIKE` across all text columns, no index hints |
| Agent export | Low | Reads entire database into memory, compresses — blocks for large agents |

### Natural Module Boundaries for Splitting

```
src/api/
├── server.ts          (core HTTP/WS server — ~500 lines after split)
├── middleware/
│   ├── cors.ts
│   ├── auth.ts
│   └── validation.ts
├── routes/
│   ├── auth.ts        (pairing + subscription OAuth)
│   ├── agent.ts       (lifecycle, export/import)
│   ├── character.ts   (CRUD, generation)
│   ├── plugins.ts     (plugins + registry)
│   ├── skills.ts      (skills + catalog + marketplace)
│   ├── chat.ts        (conversations + messages)
│   ├── wallet.ts      (balances, NFTs, keys)
│   ├── cloud.ts       (already partially extracted)
│   ├── apps.ts        (app discovery + launch)
│   ├── workbench.ts   (goals + todos)
│   ├── config.ts      (config get/set)
│   ├── mcp.ts         (MCP config + marketplace)
│   └── admin.ts       (logs, updates, database, extension)
└── state.ts           (shared ServerState type)
```

Each module would receive a `ServerState` reference and the shared `json()` / `error()` / `addLog()` helpers. Routes are already cleanly grouped by domain — the split is mechanical, not architectural.

### Roadmap Assessment

- **Quick win:** Extract auth routes into `src/api/routes/auth.ts` as a proof of concept
- **Medium effort:** Mechanical split into 15 route modules, add basic happy-path tests for top 10 endpoints
- **Full effort:** Add response caching layer, async filesystem I/O, external API timeouts, conversation LRU eviction

---

## Deep Dive 3: Auth Reliability

### How Auth Works

There are **three** auth systems that can provide model access, and they interact in non-obvious ways:

```
┌─ Subscription Auth ─────────────────────────────────────────────┐
│  OAuth flow via @mariozechner/pi-ai                             │
│  Providers: "anthropic-subscription", "openai-codex"            │
│  Stored at: ~/.milaidy/auth/{provider}.json (0o600)             │
│  Applied at startup: sets process.env.ANTHROPIC_API_KEY         │
│  Token TTL: ~7-8 hours, refresh buffer: 5 minutes              │
└─────────────────────────────────────────────────────────────────┘

┌─ Eliza Cloud ───────────────────────────────────────────────────┐
│  API key in config: cloud.apiKey = "eliza_xxx"                  │
│  Loaded as: process.env.ELIZAOS_CLOUD_API_KEY                  │
│  Effectively enabled when: cloud.enabled || Boolean(cloud.apiKey)│
│  Provides: free inference credits (limited models)              │
└─────────────────────────────────────────────────────────────────┘

┌─ Direct API Keys ───────────────────────────────────────────────┐
│  Set in config.env: ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.    │
│  Or in .env file                                                │
│  Standard ElizaOS plugin auto-detection                         │
└─────────────────────────────────────────────────────────────────┘
```

**Priority order:** Subscription credentials OVERWRITE config.env values (applied after). Cloud runs as a separate plugin alongside others. When both Anthropic subscription and Cloud are configured, both plugins load — model selection in config determines which handles each request.

### Anthropic Subscription OAuth Flow (Complete Trace)

```
1. User clicks "Login with Claude" in UI
   └── POST /api/subscription/anthropic/start

2. Server calls startAnthropicLogin() → @mariozechner/pi-ai
   └── PKCE challenge generated, returns authUrl

3. UI opens authUrl in browser
   └── User completes Anthropic OAuth consent

4. User gets redirect with code#state fragment
   └── POST /api/subscription/anthropic/exchange { code }

5. Server calls flow.submitCode(code)
   └── pi-ai performs PKCE token exchange

6. Credentials returned: { access: "sk-ant-oat01-...", refresh: "sk-ant-ort01-...", expires }
   └── Saved to ~/.milaidy/auth/anthropic-subscription.json (0o600)

7. applySubscriptionCredentials() called
   └── Sets process.env.ANTHROPIC_API_KEY = access token

8. @elizaos/plugin-anthropic discovers ANTHROPIC_API_KEY, registers as provider
```

### OpenAI Codex OAuth Flow

Same pattern but uses a local callback server on port 1455 (with manual code-paste fallback). Returns JWT tokens instead of `sk-ant-*` format. Server has a 5-minute cleanup timer for the flow.

### Token Lifecycle

| Event | Trigger | What Happens |
|-------|---------|--------------|
| Token issued | OAuth completion | ~7-8 hour TTL, saved to disk |
| Refresh check | Runtime startup, hot-reload, OAuth completion | If within 5min of expiry, auto-refresh |
| Refresh success | `refreshAnthropicToken()` returns | New tokens saved, env var updated |
| Refresh failure | Network error, invalid refresh token | Logged, returns null, **no user notification** |
| Token expired mid-session | Not detected | API calls fail with 401, **no auto-refresh during runtime** |
| Server-side revocation | External event | Local timestamp says valid, API says invalid, **no detection** |

### Silent Failure Map (Where Users Get No Feedback)

| Failure | Where | User Sees |
|---------|-------|-----------|
| Token refresh fails | `credentials.ts:134-136` | Nothing (error only in server logs) |
| Stored token rejected by API | Any API call | Cryptic error: "invalid x-api-key" |
| Subscription apply fails at startup | `eliza.ts:1686-1688` | Nothing (warning in logs, runtime continues without auth) |
| Token expires mid-session | Not checked | Requests fail, no notification |
| Cloud key out of credits | External | Requests fail, no notification |
| Model shows as "unknown" | `/api/status` response | User can't tell which provider is active |
| Cloud fallback activated | `effectivelyEnabled` logic | User doesn't know they switched from subscription to cloud |

### The Current Bug (What We Observed)

The stored Anthropic subscription token at `~/.milaidy/auth/anthropic-subscription.json`:
- Has `expires` = 2026-02-11 (not expired by timestamp)
- Has valid-looking access token: `sk-ant-oat01-OWf81u-...`
- **API rejects it with `invalid x-api-key`**

This means the server-side session was likely revoked, but the local auth system has no way to know. `hasValidCredentials()` only checks the `expires` timestamp — it never validates the token against the API.

The system silently fell back to Eliza Cloud (`cloud.apiKey` in config with `effectivelyEnabled` logic), so the agent works but the user had no idea which model was serving their requests.

### The @mariozechner/pi-ai Dependency

- **Package:** `@mariozechner/pi-ai ^0.52.9`
- **What it is:** OAuth client library for Claude Pro/Max and ChatGPT Plus/Pro subscriptions
- **Implements:** PKCE flow, token exchange, token refresh
- **Used by:** `src/auth/anthropic.ts` and `src/auth/openai-codex.ts` as thin wrappers
- **Also provides:** Stealth mode support for Claude Code setup tokens (`src/auth/claude-code-stealth.ts` intercepts `api.anthropic.com` fetch requests, converts `x-api-key` to `Authorization: Bearer`, adds special headers)

### Security Assessment

| Aspect | Status | Notes |
|--------|--------|-------|
| Credential file permissions | Good | 0o600 files, 0o700 auth dir |
| PKCE OAuth flow | Good | Prevents code interception attacks |
| Refresh token rotation | Good | New tokens on each refresh |
| No credentials in database | Good | Filesystem-only storage |
| No credentials in logs | Good | Actions logged, never tokens |
| No auth between extension and relay | Bad | Any local process can send CDP commands |
| No server-side session validation | Bad | Local expiry check only |
| Config API can leak setup tokens | Risk | `GET /api/config` returns `config.env` which may contain `ANTHROPIC_API_KEY` |
| No credential schema validation | Risk | Malformed JSON in auth files = crash |

### Roadmap Assessment

- **Quick win:** Add token validation endpoint — when subscription credentials are applied, make a lightweight API call to verify they work. If rejected, delete stored credentials and notify user.
- **Quick win:** Surface auth status in chat header — show "Claude (subscription)" or "Eliza Cloud" or "No provider" indicator.
- **Medium effort:** Implement periodic token health checks (every 30 min during runtime), auto-refresh, and user notification on failure.
- **Full effort:** Provider health dashboard in UI showing all configured providers, their status, which is active for each model tier, and credit balances.

---

## Concrete Bugs Found

### BUG-1: Debug console.log left in production (EASY FIX)
**File:** `src/runtime/eliza.ts:1884`
```typescript
console.log("sqlPlugin", sqlPlugin);  // DEBUG CODE LEFT IN
```
Leaks plugin config data to stdout. Trivial fix, good first PR.

### BUG-2: Race condition in hot-reload message service (CRITICAL)
**File:** `src/runtime/eliza.ts:2256-2262`
During hot-reload, the `runtime` variable is reassigned but the CLI chat loop continues using old references. If a message arrives during the 50-100ms swap window, `messageService` check fails and chat appears frozen.

### BUG-3: Hot-reload failure leaves agent in broken state (CRITICAL)
**File:** `src/runtime/eliza.ts:2106-2107`
When hot-reload fails, it returns `null` but the old runtime is already partially torn down (line 2012). Database connections may be half-closed, plugin resources partially released. No recovery — agent stuck in "restarting" state.

### BUG-4: Config JSON parse has no error handling (HIGH)
**File:** `src/config/config.ts:24`
`JSON5.parse(raw)` has no try-catch. Corrupted config (trailing comma, truncated write) = agent won't start with an obscure error. No fallback to defaults.

### BUG-5: Token refresh has no retry logic (HIGH)
**File:** `src/auth/credentials.ts:120-137`
Network timeout during token refresh → auth immediately unavailable. No backoff, no retry queue. Next API request fails, user gets no notification.

### BUG-6: Database DNS validation fails open (HIGH - Security)
**File:** `src/api/database.ts:242-279`
DNS lookup failure (NXDOMAIN) silently passes through validation instead of blocking. Could allow SSRF to metadata services.

### BUG-7: OAuth flow resource leak on timeout
**File:** `src/api/server.ts:1792-1804`
Multiple OAuth flows started within 10min window accumulate callback servers on port 1455. Next attempt fails with EADDRINUSE.

### BUG-8: Chrome extension zombie tabs on restart
**File:** `apps/chrome-extension/background.js`
Attached debugger tabs become orphaned on extension restart — state isn't persisted. Tabs stay attached but extension lost track.

### BUG-9: Chrome extension WebSocket race condition
**File:** `apps/chrome-extension/background.js:100-102`
Second caller to relay connection can bypass the connect guard during initial promise.

### BUG-10: Unprotected JSON.parse in SSE stream reader
**File:** `src/cloud/bridge-client.ts:182`
`JSON.parse(eventData)` with no try-catch — malformed SSE data crashes the stream.

---

## What's Fully Functional (UI)

All 10 main tabs are **real, working features** — no placeholder screens:

| Tab | Status | Notes |
|-----|--------|-------|
| Chat | Working | WebSocket + REST, streaming text, voice I/O, 3D VRM avatar |
| Apps | Working | Browse + launch iframe-embedded experiences |
| Inventory | Working | Multi-chain wallet balances (EVM + Solana), NFT gallery |
| Features | Working | Toggle capability plugins (Browser, Vision, Computer Use) |
| Connectors | Working | Messaging integrations (Telegram, Discord, Signal, etc.) |
| Skills | Working | Install, manage, security scan, marketplace |
| Character | Working | Edit personality, voice presets, avatar selection |
| Config | Working | Theme, providers, API keys, updates, export/import |
| Admin | Working | Logs, core plugins, database explorer with SQL |
| Workbench | Working | Goals + todos overview |

### What's Minimal/Incomplete

1. **Chrome Extension** — client is complete, relay server is missing (see Deep Dive 1)
2. **Telegram Draft Stream** — `src/plugins/telegram-enhanced/draft-stream.ts` has empty stubs (intentional Phase 2 placeholder)
3. **Audio Config** — `src/config/types.messages.ts:177` has `AudioConfig = { [key: string]: unknown }` placeholder

---

## Code Quality Observations

### Positive
- **No TODO/FIXME/HACK comments** in source code (clean)
- **No `throw new Error("not implemented")`** patterns
- **No skipped tests** (no `.skip`, `.only`, `xit`, `xdescribe`)
- **Biome formatting/linting** enforced
- **Type safety** is good — `as any` casts limited to telegram-enhanced (justified by untyped deps)
- **Config file permissions**: `0o600` for config, `0o700` for auth dir
- **Proper cleanup**: `clearInterval(statusInterval)` + `wss.close()` + `server.close()` on shutdown
- **Strong API security**: SSRF protection, timing-safe auth, prototype pollution guards, SQL injection prevention

### Areas for Improvement
- `src/api/server.ts` at 6427 lines violates the project's own "~500 LOC" guideline
- Some type bypasses in telegram-enhanced (`@ts-expect-error`, `biome-ignore`) — documented but worth fixing if upstream adds types
- Hot-reload restart logic has concurrent restart guard but could benefit from timeout
- Synchronous filesystem I/O throughout (should be async)
- No caching layer for plugin/skill discovery (re-reads files on every API request)

---

## Browser Testing Checklist

Use this when clicking through `http://localhost:2138`:

### Chat
- [ ] Send a message — does agent respond? What model name appears?
- [ ] Try `/status` — does it show model + tokens?
- [ ] Try `/compact`, `/new`, `/reset`
- [ ] Refresh page — does history persist?
- [ ] Check WebSocket in DevTools > Network > WS

### Navigation
- [ ] Click every sidebar tab — which ones load?
- [ ] Any empty/placeholder pages?

### Plugins
- [ ] Are plugins listed?
- [ ] Toggle a plugin on/off
- [ ] Configure plugin parameters (API keys, tokens)

### Config
- [ ] Change theme — does it persist?
- [ ] Check model provider status
- [ ] Try cloud login flow
- [ ] Check update status

### Wallet/Inventory
- [ ] Are addresses shown?
- [ ] Token balances loading?
- [ ] NFT gallery?

### Admin
- [ ] Logs streaming?
- [ ] Filter by level/source
- [ ] Database explorer — can you browse tables?
- [ ] Run a SQL query

### DevTools
- [ ] Console errors?
- [ ] Failed network requests (red)?
- [ ] CORS issues?

---

## Roadmap Proposal

### Tier 1: Quick Wins (demonstrate value immediately)

| # | Task | Area | Impact |
|---|------|------|--------|
| 1 | Remove `console.log("sqlPlugin")` debug line | Runtime | BUG-1 fix, good first PR |
| 2 | Add try-catch around `JSON5.parse` in config loader | Config | BUG-4 fix, prevents startup crashes |
| 3 | Add try-catch around `JSON.parse` in SSE stream reader | Cloud | BUG-10 fix, prevents stream crashes |
| 4 | Add model name + provider to `/api/status` response | API | Users can see which model is active |
| 5 | Add auth status indicator to chat header in UI | UI | Users see "Claude (subscription)" vs "Eliza Cloud" |

### Tier 2: Reliability Improvements (medium effort, high impact)

| # | Task | Area | Impact |
|---|------|------|--------|
| 6 | Token validation on apply — verify tokens work before trusting them | Auth | Prevents "invalid x-api-key" confusion |
| 7 | Surface auth errors in UI — toast/banner when subscription fails | Auth | Users know when to re-authenticate |
| 8 | Fix hot-reload failure recovery — don't tear down old runtime before new one is ready | Runtime | BUG-3, prevents stuck "restarting" state |
| 9 | Fix DNS validation fail-open in database routes | API | BUG-6, security fix |
| 10 | Fix Chrome extension zombie tabs + WebSocket race | Extension | BUG-8/BUG-9, reliability |

### Tier 3: Architecture (bigger effort, long-term payoff)

| # | Task | Area | Impact |
|---|------|------|--------|
| 11 | Split `server.ts` into route modules | API | Makes the file maintainable, enables testing |
| 12 | Add basic happy-path tests for top 10 API endpoints | API | Catch regressions on the most critical file |
| 13 | Implement relay server for Chrome extension | Extension | Completes the extension feature end-to-end |
| 14 | Provider health dashboard in UI | Auth/UI | Shows all providers, status, credits, active model |
| 15 | Add integration tests for auth flow (token refresh, expiry, fallback) | Auth | Prevents silent auth failures in production |

---

## Deep Dive 4: Action Selection Investigation

**Date:** 2026-02-12
**Branch:** fix/auth-observability

### Problem Statement

The LLM (GPT-5 via TEXT_LARGE model mapping) frequently selects `REPLY` instead of the correct action (e.g., `CREATE_TASK`, `EXECUTE_COMMAND`, `SEARCH_SKILLS`). This means the agent converses about doing things instead of actually doing them.

### How ElizaOS Action Selection Works

```
User message
  → composeState(message, ["ACTIONS"])
    → ACTIONS provider validates all 44 actions, formats names + descriptions + examples
    → Template rendered via Handlebars ({{providers}} injects ACTIONS provider text)
  → dynamicPromptExecFromState (LLM call)
    → LLM outputs XML with <actions> tag
  → Parse actions from XML response
  → Mode determination:
      isSimple = (actions.length === 1 && actions[0] === "REPLY" && no providers)
      mode = isSimple ? "simple" : "actions"
  → If "simple" mode: SKIP processActions entirely → NO ACTION_COMPLETED event
  → If "actions" mode: processActions finds handler, executes, emits events
```

**Key insight:** When the LLM outputs `REPLY`, mode is "simple" and `processActions()` never runs. This means `ACTION_COMPLETED` events only fire for non-REPLY actions. The benchmark must account for this.

### Root Causes Identified

#### 1. REPLY Gravity (FIXED)

The default ElizaOS message handler template has strong REPLY bias:
- 4 REPLY examples vs 0 for most other actions
- Template instructions emphasize "always pick an action" but examples all show REPLY
- Actions are SHUFFLED on every prompt composition (random order)

**Fix applied:** Custom `MILAIDY_MESSAGE_HANDLER_TEMPLATE` in `src/runtime/eliza.ts` with explicit rules:
```
- User asks to run/execute a command → EXECUTE_COMMAND
- User asks to search/find/list plugins or skills → SEARCH_SKILLS
- User asks to install/add a plugin or skill → INSTALL_SKILL
- User asks to create a task or todo → CREATE_TASK
- User asks to spawn/create a subagent → SPAWN_SUBAGENT
```

#### 2. ActionFilterService Threshold (FIXED)

The `ActionFilterService` uses BM25 scoring with a `threshold: 0.5` that filters out valid actions before the LLM even sees them. Many action descriptions were too terse for BM25 to match user intent.

**Fix applied:** Set `actionFilterThreshold: 0` in config to disable pre-filtering, and enriched action descriptions in `src/runtime/milaidy-plugin.ts`:
```typescript
const ACTION_DESCRIPTION_ENRICHMENTS = {
  CREATE_TASK: "Create, add, or make a new task, todo, or reminder...",
  EXECUTE_COMMAND: "Run, execute, or invoke a shell command...",
  INSTALL_SKILL: "Install, add, set up, download, or enable a new skill...",
  SEARCH_SKILLS: "Search, find, browse, list, or discover available skills...",
};
```

#### 3. Benchmark Room Pollution (FIXED)

**Critical discovery:** The benchmark script sent all messages through `POST /api/chat`, which uses a single persistent room (`stringToUuid("Meira-web-chat-room")`). Messages from ALL benchmark runs accumulated in this room. After 5+ runs (~100+ messages), the `RECENT_MESSAGES` context flooded the prompt, drowning out action selection instructions.

This caused a catastrophic regression from 91.3% to 47.8% that appeared to be a code regression but was actually data pollution.

**Fix applied:** Benchmark now creates a fresh conversation per run via `POST /api/conversations`, sending messages through `POST /api/conversations/:id/messages` instead of the shared `/api/chat` endpoint.

### Benchmark Progression

| Run | Accuracy | Changes Applied |
|-----|----------|----------------|
| Baseline | 47.8% | No changes — default ElizaOS template, default filter threshold |
| +Template | 56.5% | Custom messageHandlerTemplate with action rules |
| +Disabled filter | 69.6% | Set actionFilterThreshold: 0 |
| +Enriched descriptions | 82.6% | Added ACTION_DESCRIPTION_ENRICHMENTS |
| +Stabilized | 91.3% | Best run — SEARCH_SKILLS, INSTALL_SKILL, EXECUTE_COMMAND all passing |
| Regression | 47.8% | NOT a code regression — room pollution from accumulated messages |

### Remaining Failures (at 91.3%)

| Test | Expected | Issue |
|------|----------|-------|
| "create a new task called fix the bug" | CREATE_TASK | LLM sees CREATE_TASK but still picks REPLY. CREATE_TASK has no examples in ElizaOS core. |
| "add a task to review the PR" | CREATE_TASK | Same — "add" phrasing doesn't trigger CREATE_TASK. |
| "post something on farcaster" | REPLY | Got SEARCH_SKILLS — LLM tries to find a farcaster plugin. Debatable if this is actually wrong. |

### Debug Infrastructure Built

- `GET /api/debug/action-log` — In-memory log of all ACTION_COMPLETED events (requires `MILAIDY_DEBUG_ACTIONS=1`)
- `DELETE /api/debug/action-log` — Clear the log between benchmark runs
- `GET /api/debug/context` — Expose action metadata, provider sizes, and composed state info
- `GET /api/debug/validate-actions` — Show which actions pass validation for a given input
- `scripts/test-action-selection.ts` — Automated benchmark with 23 test cases

### Architecture Notes

- **Model mismatch:** Config shows `"primary": "openai/gpt-4o"` but runtime maps `TEXT_LARGE` to `gpt-5`. The `/api/status` endpoint shows the configured model, not the runtime model.
- **Single-action truncation:** ElizaOS core (line 101953) truncates to `actions[0]` if the LLM outputs multiple actions. Only the first action in `<actions>` is used.
- **Action shuffling:** `formatActionNames` and `formatActions` shuffle the action list on every prompt composition, making behavior non-deterministic.
- **PGLite persistence:** Messages persist across server restarts. Deleting a conversation via API only removes it from the in-memory `Map`, not from the database.

### Next Steps

1. Re-run benchmark with conversation isolation to get a clean baseline
2. Investigate CREATE_TASK failures — may need example injection (code is stashed but untested with clean context)
3. Consider per-test isolation if intra-run message accumulation affects later test cases
