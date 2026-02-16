# Milady Benchmark Server

HTTP server and plugin that expose the milady agent runtime to Python benchmark runners.

## Architecture

```
Python Benchmark Runner
    |  (imports milady-adapter)
milady-adapter  (Python client)
    |  (HTTP requests)
server.ts  (this directory)         <-- you are here
    |  (injects context via plugin)
plugin.ts  (benchmark provider + action)
    |
ElizaOS AgentRuntime
```

This directory contains the **server side** of the benchmark bridge:

| File | Purpose |
|---|---|
| `server.ts` | HTTP server on port 3939 (configurable). Wraps a full `AgentRuntime` and exposes it over three endpoints. |
| `plugin.ts` | `milady-benchmark` plugin providing the `MILADY_BENCHMARK` context provider and `BENCHMARK_ACTION` action handler. |

The **client side** (Python HTTP client + benchmark-specific adapters) lives at [`benchmarks/milady-adapter/`](../../../benchmarks/milady-adapter/).

## Starting the server

```bash
# from the milady package root
npm run benchmark:server

# or directly
node --import tsx src/benchmark/server.ts
```

The server prints `MILADY_BENCH_READY port=3939` to stdout once it is accepting connections. The Python `MiladyServerManager` watches for this sentinel.

## HTTP API

### `GET /api/benchmark/health`

Returns server status.

```json
{ "status": "ready", "agent_name": "Milady", "plugins": 4 }
```

### `POST /api/benchmark/reset`

Start a fresh session for a new task.

```json
{ "task_id": "webshop-42", "benchmark": "agentbench" }
```

Response:

```json
{ "status": "ok", "room_id": "<uuid>" }
```

### `POST /api/benchmark/message`

Send a message (with optional task context) and receive the agent's response.

Request:

```json
{
  "text": "Find a laptop under $500",
  "context": {
    "benchmark": "agentbench",
    "taskId": "webshop-42",
    "goal": "Buy a laptop under $500",
    "observation": { "page": "search results..." },
    "actionSpace": ["search[query]", "click[id]", "buy[id]"]
  }
}
```

Response:

```json
{
  "text": "Searching for laptops...",
  "thought": "I should search for laptops under $500",
  "actions": ["BENCHMARK_ACTION"],
  "params": { "command": "search[laptop under $500]" }
}
```

## Plugin details

### `MILADY_BENCHMARK` provider

Injects benchmark task context (goal, observation, action space, tools, HTML elements, passages) into the agent's state so the LLM can reason about the task.

### `BENCHMARK_ACTION` action

Captures the agent's chosen action and its parameters. Supports three benchmark formats:

| Benchmark | Params |
|---|---|
| AgentBench | `command` |
| tau-bench | `tool_name` + `arguments` |
| Mind2Web | `operation` + `element_id` + `value` |

### Message template

A custom `messageHandlerTemplate` is injected that instructs the LLM to read the benchmark context, choose one action, and respond in structured XML format.

## Configuration

| Environment variable | Default | Description |
|---|---|---|
| `MILADY_BENCH_PORT` | `3939` | Port to listen on |

Model provider plugins are auto-detected from API key env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `AI_GATEWAY_API_KEY`, `GOOGLE_API_KEY`, `GROQ_API_KEY`, `XAI_API_KEY`, `OPENROUTER_API_KEY`, `OLLAMA_BASE_URL`).

## Python adapter reference

The Python client and benchmark-specific adapters are maintained separately:

- **Package:** [`benchmarks/milady-adapter/`](../../../benchmarks/milady-adapter/)
- **Client:** `MiladyClient` -- HTTP client wrapping the endpoints above
- **Server Manager:** `MiladyServerManager` -- spawns this server as a subprocess
- **Adapters:** AgentBench, context-bench, Mind2Web, tau-bench

See the [milady-adapter README](../../../benchmarks/milady-adapter/README.md) for usage examples and the full module listing.
