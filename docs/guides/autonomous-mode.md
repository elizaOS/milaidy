---
title: Autonomous Mode
sidebarTitle: Autonomous Mode
description: Configure and monitor the agent's autonomous reasoning loop, where it acts independently between conversations.
---

# Autonomous Mode

Autonomous mode allows the Milady agent to reason and act independently between user conversations. When enabled, the agent runs a continuous loop -- observing its environment, making decisions, and executing actions without waiting for explicit user input. This is useful for background monitoring, scheduled workflows, and proactive behavior.

## Enabling and Disabling

Autonomous mode is managed through the Autonomy Service (`AUTONOMY`), which exposes two API endpoints and a dashboard toggle.

### API Endpoints

**GET `/api/agent/autonomy`**

Returns the current autonomy state:

```json
{
  "enabled": true,
  "thinking": false
}
```

- `enabled` -- whether autonomous mode is active.
- `thinking` -- whether the autonomous loop is currently executing a reasoning cycle.

**POST `/api/agent/autonomy`**

Toggle autonomy on or off by sending a JSON body:

```json
{
  "enabled": true
}
```

Response:

```json
{
  "ok": true,
  "autonomy": true,
  "thinking": false
}
```

When `enabled` is `true`, the service calls `enableAutonomy()` on the Autonomy Service. When `false`, it calls `disableAutonomy()`.

### Dashboard Toggle

The Autonomous Panel in the dashboard UI provides a visual toggle for enabling and disabling autonomy. The panel reads agent status from the `useApp()` context, which tracks `agentStatus` including autonomy state.

## Autonomous State Provider

The `miladyAutonomousState` provider bridges context between autonomous loop iterations. It is a dynamic ElizaOS provider (position 10) that injects a snapshot of recent autonomous activity into the agent's context on every reasoning cycle.

### How It Works

1. **Event Subscription** -- `ensureAutonomousStateTracking()` subscribes to the `AGENT_EVENT` service for the current agent. All events (thoughts, actions, tool calls) and heartbeats are cached in memory.

2. **Event Cache** -- Up to 240 events are cached per agent in a circular buffer. Old events are evicted when the buffer is full.

3. **Context Injection** -- On each provider call, the 10 most recent events from the `assistant`, `action`, and `tool` streams are rendered as text lines and injected into the agent's state:

```
Autonomous state snapshot:
- [assistant] I should check the latest market data
- [action] Fetched price feed from API
- [tool] Processed 15 data points
- [heartbeat/idle] to discord -- monitoring channel
```

4. **Provider Result** -- The provider returns structured data including:
   - `hasAutonomousState` -- whether any events exist
   - `autonomousEventsCount` -- total cached events
   - `heartbeatStatus` -- last heartbeat status string
   - `events` -- array of recent event summaries (runId, seq, stream, ts)
   - `heartbeat` -- last heartbeat object (status, ts, target)

## Activity Stream

The autonomous state provider tracks several event streams:

| Stream | Description |
|--------|-------------|
| `assistant` | Agent reasoning/thought outputs |
| `action` | Actions the agent has executed |
| `tool` | Tool calls made during execution |
| `error` | Error events from the loop |
| `provider` | Provider-level events |
| `evaluator` | Self-evaluation events |

### Heartbeats

Heartbeats are separate from the main event stream and represent the agent's periodic status signals. Each heartbeat contains:

- `status` -- current state (e.g., "idle", "busy")
- `to` -- optional target (e.g., a Discord channel name)
- `preview` -- short text preview of what the agent is doing
- `durationMs` -- how long the current state has lasted
- `hasMedia` -- whether the current action involves media
- `channel` -- which channel the agent is operating on

## The Autonomous Panel

The dashboard UI includes an `AutonomousPanel` component that provides real-time visibility into autonomous operations. The panel displays:

- **Workbench Tasks** -- active tasks the agent is working on
- **Triggers** -- scheduled triggers (interval, cron, one-time) that wake the agent
- **Todos** -- task items tracked by the agent
- **Activity Stream** -- a reverse-chronological feed of the last 120 events, color-coded by type:
  - Heartbeat events in accent color
  - Error events in danger/red
  - Action, tool, and provider events in success/green
  - Assistant thoughts in accent color
  - Other events in muted gray

The panel groups events into "thoughts" (assistant/evaluator streams) and "actions" (action/tool/provider streams) for visual clarity.

## Safety Considerations

- **Resource consumption** -- The autonomous loop runs continuously when enabled. Monitor CPU and memory usage, especially with frequent reasoning cycles.
- **Action limits** -- Triggers have configurable `maxRuns` limits and per-creator quotas (default 100 active triggers) to prevent runaway execution.
- **Event buffer cap** -- The event cache is limited to 240 entries per agent (`MAX_CACHED_EVENTS`) to bound memory usage.
- **Heartbeat monitoring** -- Use the heartbeat status to detect if the agent is stuck or unresponsive.
- **Disable when not needed** -- Turn off autonomous mode via the API or dashboard when continuous agent activity is not required.
- **SSRF protection** -- Custom actions executed during autonomous mode enforce the same SSRF guards as user-initiated actions, blocking requests to private/internal network addresses.
