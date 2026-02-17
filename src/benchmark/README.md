# Milady Benchmark Server

HTTP bridge exposing the Milady runtime to Python benchmark runners.

## Architecture

```
Python Benchmark Runner
    |  (imports milady-adapter)
milady-adapter (Python client)
    |  (HTTP requests)
server.ts (this directory)
    |  (canonical message pipeline)
ElizaOS AgentRuntime
```

This directory contains:

| File | Purpose |
|---|---|
| `server.ts` | HTTP server for benchmark traffic. Initializes `AgentRuntime`, handles benchmark sessions, and routes each message through `runtime.messageService.handleMessage(...)`. |
| `mock-plugin.ts` | Optional mock services for local debugging. |

The Python client side lives in [`benchmarks/milady-adapter/`](../../../benchmarks/milaidy-adapter/).

## Start the server

```bash
# from the milady package root
npm run benchmark:server

# or directly
node --import tsx src/benchmark/server.ts
```

The server prints `MILADY_BENCH_READY port=<port>` when ready.

## HTTP API

### `GET /api/benchmark/health`

Returns readiness + runtime metadata.

```json
{ "status": "ready", "agent_name": "Kira", "plugins": 3 }
```

### `POST /api/benchmark/reset`

Starts a fresh benchmark session (new room/user context).

Request:

```json
{ "task_id": "webshop-42", "benchmark": "agentbench" }
```

Response:

```json
{ "status": "ok", "room_id": "<uuid>", "task_id": "webshop-42", "benchmark": "agentbench" }
```

### `POST /api/benchmark/message`

Sends benchmark input through the canonical message pipeline.

Request:

```json
{
  "text": "Find a laptop under $500",
  "context": {
    "benchmark": "agentbench",
    "task_id": "webshop-42",
    "goal": "Buy a laptop under $500",
    "observation": { "page": "search results" },
    "action_space": ["search[query]", "click[id]", "buy[id]"]
  }
}
```

Response:

```json
{
  "text": "Searching for options under $500...",
  "thought": "I should issue a search action first",
  "actions": ["BENCHMARK_ACTION"],
  "params": { "command": "search[laptop under $500]" }
}
```

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `MILADY_BENCH_PORT` | `3939` | Port to listen on |
| `MILADY_ENABLE_COMPUTERUSE` | unset | If set, loads local computeruse plugin |
| `MILADY_BENCH_MOCK` | unset | Enables inline mock benchmark plugin |

## Notes

- `context` is attached to the prompt context for each benchmark step.
- Session reset creates isolated room/user context so task runs do not leak history.
- Responses include `actions` and `params` extracted from `responseContent` for runner-side evaluation.
