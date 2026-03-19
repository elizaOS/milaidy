---
name: Electrobun Teams
description: Use when orchestrating multi-agent Electrobun feature development. Explains the electrobun-feature-team architecture — UI agent (views, RPC contract) followed by backend agent (bun-side wiring) — the RPC contract handoff format, and how to run the team using CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1.
version: 1.0.0
---

# Electrobun Feature Team

Two-agent sequential pipeline for building complete Electrobun features — renderer first, bun-side second.

## Team Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Orchestrator (main Claude / /electrobun-feature command)   │
│  Creates team, assigns tasks, receives handoff, passes it   │
└──────────┬───────────────────────────────────┬──────────────┘
           │ Task 1                            │ Task 2 (after T1)
           ▼                                   ▼
┌──────────────────────┐             ┌───────────────────────┐
│  electrobun-ui-agent │  ────────►  │ electrobun-backend-   │
│                      │  contract   │ agent                 │
│  Produces:           │  handoff    │                       │
│  • src/<view>/       │             │  Produces:            │
│  • src/shared/types  │             │  • src/bun/index.ts   │
│  • RPC contract doc  │             │  • electrobun.config  │
└──────────────────────┘             └───────────────────────┘
```

## Enabling Teams

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
claude  # start Claude Code with teams enabled
```

Teams require this env var. Without it, the team tools (TeamCreate, TaskCreate, SendMessage) are not available.

## Orchestrator: How to Run the Team

```
1. Create team:
   TeamCreate { team_name: "electrobun-feature-team", description: "Building <feature>" }

2. Create tasks:
   TaskCreate { subject: "T1: UI agent — design views and produce RPC contract" }
   TaskCreate { subject: "T2: Backend agent — implement bun-side wiring from RPC contract" }
   TaskUpdate { taskId: "T2", addBlockedBy: ["T1"] }  // T2 blocked until T1 done

3. Spawn UI agent:
   Agent {
     name: "ui-agent",
     team_name: "electrobun-feature-team",
     subagent_type: "general-purpose",
     prompt: "You are the electrobun-ui-agent. [full feature spec] ..."
   }
   TaskUpdate { taskId: "T1", status: "in_progress", owner: "ui-agent" }

4. Wait for UI agent to complete T1 and produce handoff document.
   UI agent sends message: SendMessage to orchestrator with contract.

5. Receive contract. Pass to backend agent:
   Agent {
     name: "backend-agent",
     team_name: "electrobun-feature-team",
     subagent_type: "general-purpose",
     prompt: "You are the electrobun-backend-agent. Contract: [paste handoff] ..."
   }
   TaskUpdate { taskId: "T2", status: "in_progress", owner: "backend-agent" }

6. Wait for backend agent to complete T2.

7. Shutdown team:
   SendMessage { target: "ui-agent", type: "shutdown_request" }
   SendMessage { target: "backend-agent", type: "shutdown_request" }

8. Report completion to user.
```

## Team Roles

### electrobun-ui-agent
**Input**: Feature description from orchestrator
**Output**: RPC contract handoff document + all renderer files

Produces:
- `src/<viewname>/index.html` — markup with `#id-kebab-case` on every control
- `src/<viewname>/index.css` — layout and styles
- `src/<viewname>/index.ts` — Electroview wiring using `electrobun/view`
- `src/shared/types.ts` — the `MyRPCType` typed RPC schema

### electrobun-backend-agent
**Input**: RPC contract handoff from UI agent
**Output**: Complete bun-side implementation + config update

Produces:
- `src/bun/index.ts` — BrowserWindow creation + BrowserView.defineRPC()
- Updated `electrobun.config.ts` — views + copy entries

## The RPC Contract Handoff Format

```markdown
# RPC Contract Handoff — <FeatureName>

## Views created
| View name | Source dir | Electrobun.config entry |
|---|---|---|
| mainview | src/mainview/ | mainview: { entrypoint: "src/mainview/index.ts" } |

## RPC type location
src/shared/types.ts — exports MyRPCType

## Bun-side requests (renderer calls → bun responds)
| RPC name | Params | Return | Trigger |
|---|---|---|---|
| doTheThing | { param: string } | string | #btn-primary-action click |

## Bun-side messages (renderer sends → bun, no response)
| RPC name | Payload | Trigger |
|---|---|---|
| closeWindow | {} | #btn-done click |

## Webview-side requests (bun calls → renderer responds)
| RPC name | Params | Return |
|---|---|---|
| getViewState | {} | { value: string } |

## Webview-side messages (bun sends → renderer)
| RPC name | Payload | UI updated |
|---|---|---|
| updateStatus | { status: string } | #status-display |

## electrobun.config.ts copy entries
copy: {
  "src/mainview/index.html": "views/mainview/index.html",
}

## Platform notes
- Requires CEF: no
- titleBarStyle: default
- Entitlements: none
```

## Sequential Flow: Why UI First?

1. **UI defines the contract** — the renderer knows what it needs from bun (requests) and what it will push to bun (messages). This is the natural source of truth for the RPC schema.

2. **Backend implements the contract** — once the schema is known, the bun side is purely mechanical: implement each handler, return the right types.

3. **No parallel work** — both agents write to different files (renderer vs bun), but the backend agent needs the schema to type its handlers. Running in parallel would require speculative typing.

## Using /electrobun-feature Without Full Teams Mode

If `CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1` is not set, the orchestrator runs the agents sequentially as subagents (one at a time) instead of as teammates. This is slower but produces the same output.

The `/electrobun-feature` command handles both modes.

## Key Rules for Teammates

- UI agent must not touch `src/bun/` — backend agent owns that directory
- Backend agent must not touch `src/<viewname>/` — UI agent owns those directories
- Both agents read `src/shared/types.ts` — UI agent creates it, backend agent imports it
- Orchestrator passes the full handoff document — do not rely on teammates reading each other's files
