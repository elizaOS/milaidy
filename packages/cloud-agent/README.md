# @elizaos/cloud-agent

ElizaOS cloud agent daemon — bridge, health, and snapshot services for containerized agents.

This package runs inside Docker containers to provide a JSON-RPC bridge between the Eliza Cloud platform and an ElizaOS `AgentRuntime`. It handles message routing, health checks, and state snapshot/restore for container lifecycle management.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   Cloud Agent Container                  │
│                                                          │
│  ┌─────────────┐    ┌──────────────────────────────┐    │
│  │   Health     │    │       Bridge Server(s)        │    │
│  │   Server     │    │                              │    │
│  │  :2138       │    │  :31337 (primary)            │    │
│  │             │    │  :18790 (compat)             │    │
│  │  GET /health │    │                              │    │
│  │  GET /       │    │  POST /bridge     (JSON-RPC) │    │
│  └─────────────┘    │  POST /bridge/stream  (SSE)  │    │
│                      │  POST /api/snapshot          │    │
│                      │  POST /api/restore           │    │
│                      │  GET  /health                │    │
│                      └──────────┬───────────────────┘    │
│                                 │                        │
│                      ┌──────────▼───────────────────┐    │
│                      │     Snapshot Manager          │    │
│                      │   (in-memory state)           │    │
│                      │   memories, config, files     │    │
│                      └──────────┬───────────────────┘    │
│                                 │                        │
│                      ┌──────────▼───────────────────┐    │
│                      │     Agent Runtime             │    │
│                      │   @elizaos/core (if avail)    │    │
│                      │   or echo-mode fallback       │    │
│                      └──────────────────────────────┘    │
│                                                          │
└─────────────────────────────────────────────────────────┘
         ▲                        ▲
         │                        │
    ECS/Docker               Eliza Cloud
    healthcheck              Proxy / Dashboard
```

## Quick Start

### Run with tsx (development)

```bash
# From this directory
npm install
npx tsx src/index.ts

# Or with environment variables
PORT=2138 BRIDGE_PORT=31337 npx tsx src/index.ts
```

### Run in Docker

```dockerfile
FROM node:22-bookworm-slim
WORKDIR /app
COPY packages/cloud-agent/dist/ ./node_modules/@elizaos/cloud-agent/dist/
COPY packages/cloud-agent/package.json ./node_modules/@elizaos/cloud-agent/

# Optional: install ElizaOS for real agent (omit for echo mode)
RUN npm install @elizaos/core@next @elizaos/plugin-sql@next @elizaos/plugin-elizacloud@next

ENV PORT=2138 BRIDGE_PORT=31337 BRIDGE_COMPAT_PORT=18790
HEALTHCHECK CMD curl -f http://localhost:${PORT}/health || exit 1
EXPOSE 2138 31337 18790

CMD ["node", "node_modules/@elizaos/cloud-agent/dist/index.js"]
```

### Use as a library

```typescript
import { start } from "@elizaos/cloud-agent";

const servers = await start({
  healthPort: 2138,
  bridgePort: 31337,
  compatBridgePort: 18790,
});

// Later: graceful shutdown
servers.shutdown();
```

## Bridge Protocol

The bridge uses a JSON-RPC 2.0-like protocol over HTTP.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET\|HEAD` | `/health` | Health check (on all servers) |
| `GET\|HEAD` | `/` | Service info |
| `GET\|HEAD` | `/bridge` | Bridge status |
| `GET\|HEAD` | `/bridge/health` | Bridge health |
| `POST` | `/bridge` | JSON-RPC request/response |
| `POST` | `/bridge/stream` | JSON-RPC → SSE stream |
| `POST` | `/stream` | Alias for `/bridge/stream` |
| `POST` | `/api/snapshot` | Capture in-memory state |
| `POST` | `/snapshot` | Alias for `/api/snapshot` |
| `POST` | `/api/restore` | Restore in-memory state |
| `POST` | `/restore` | Alias for `/api/restore` |

### JSON-RPC Methods

#### `message.send`

Send a message to the agent and receive a response.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "message.send",
  "params": {
    "text": "Hello, how are you?",
    "roomId": "default",
    "mode": "simple"
  }
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "text": "I'm doing well! How can I help you today?",
    "metadata": {
      "timestamp": 1710489600000
    }
  }
}
```

**Parameters:**
- `text` (string) — Message text to send to the agent
- `roomId` (string, default: `"default"`) — Room/conversation ID
- `mode` (string, default: `"power"`) — Chat mode: `"simple"` or `"power"`

#### `message.send` (Streaming)

Same as above, but via `POST /bridge/stream`. Returns Server-Sent Events:

```
event: connected
data: {"rpcId":1,"timestamp":1710489600000,"bridgePorts":[31337,18790]}

event: chunk
data: {"text":"I'm doing well!"}

event: chunk
data: {"text":" How can I help you today?"}

event: done
data: {"rpcId":1,"timestamp":1710489600123}
```

**Error event:**
```
event: error
data: {"message":"Something went wrong","timestamp":1710489600000}
```

#### `status.get`

Get the agent's current status.

**Request:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "status.get"
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "status": "running",
    "uptime": 3600,
    "memoriesCount": 42,
    "startedAt": "2026-03-15T00:00:00.000Z",
    "bridgePorts": [31337, 18790],
    "primaryBridgePort": 31337
  }
}
```

#### `heartbeat`

Keep-alive ping. Returns a notification (no `id`).

**Request:**
```json
{
  "jsonrpc": "2.0",
  "method": "heartbeat"
}
```

**Response:**
```json
{
  "jsonrpc": "2.0",
  "method": "heartbeat.ack",
  "params": {
    "timestamp": 1710489600000,
    "runtimeReady": true
  }
}
```

### Snapshot/Restore

#### Capture State

`POST /api/snapshot` — Returns the current in-memory state.

**Response:**
```json
{
  "memories": [
    { "role": "user", "text": "Hello", "timestamp": 1710489600000 },
    { "role": "assistant", "text": "Hi there!", "timestamp": 1710489600001 }
  ],
  "config": {},
  "workspaceFiles": {},
  "timestamp": "2026-03-15T00:00:00.000Z"
}
```

#### Restore State

`POST /api/restore` — Restore state from a previous snapshot.

**Request body:** Same shape as the snapshot response. Only provided fields are overwritten.

**Response:**
```json
{ "success": true }
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `2138` | Health endpoint port |
| `BRIDGE_PORT` | `31337` | Primary bridge port |
| `BRIDGE_COMPAT_PORT` | `18790` | Compatibility bridge port |
| `AGENT_NAME` | `"CloudAgent"` | Agent character name |
| `DATABASE_URL` | — | PostgreSQL connection string |
| `ELIZAOS_CLOUD_API_KEY` | — | ElizaOS Cloud API key |
| `OPENAI_API_KEY` | — | OpenAI API key |
| `ANTHROPIC_API_KEY` | — | Anthropic API key |
| `GOOGLE_API_KEY` | — | Google AI API key |
| `XAI_API_KEY` | — | xAI API key |
| `GROQ_API_KEY` | — | Groq API key |

## Echo Mode

When `@elizaos/core` is not installed, the agent runs in **echo mode** — all messages are returned with an `[echo]` prefix. This is useful for:

- Testing the bridge protocol end-to-end
- Container health checking without full runtime
- Development and CI environments

Echo mode is automatic — no configuration needed. Just don't install `@elizaos/core`.

## Package Exports

```typescript
// Main entry — start() function and all re-exports
import { start, SnapshotManager, initRuntime } from "@elizaos/cloud-agent";

// Bridge module — server, handlers, and protocol types
import { createBridgeServers, BridgeRpcRequest } from "@elizaos/cloud-agent/bridge";

// Health module — health server
import { createHealthServer } from "@elizaos/cloud-agent/health";

// Types only
import type { ChatMode, CloudAgentRuntime, AgentState } from "@elizaos/cloud-agent/types";
```

## Module Structure

```
src/
├── index.ts              ← Main entry + start() + re-exports
├── types.ts              ← Shared types (ChatMode, AgentState, etc.)
├── bridge/
│   ├── index.ts          ← Bridge module re-exports
│   ├── server.ts         ← HTTP server for JSON-RPC bridge
│   ├── protocol.ts       ← TypeScript types for bridge protocol
│   └── handlers.ts       ← Handler functions for each RPC method
├── health/
│   ├── index.ts          ← Health module re-exports
│   └── server.ts         ← Health endpoint HTTP server
├── snapshot/
│   └── manager.ts        ← State capture/restore logic
├── runtime/
│   └── init.ts           ← ElizaOS runtime bootstrap (dynamic import)
└── util/
    └── http.ts           ← HTTP request/response helpers
```

## License

MIT
