---
name: electrobun-feature
description: Build a complete Electrobun feature end-to-end using the two-agent team — UI agent designs views and produces the RPC contract, backend agent implements bun-side wiring. Produces all renderer files plus updated bun entrypoint and electrobun.config.ts.
argument-hint: <feature description>
---

Build a complete Electrobun feature using the UI + backend agent team.

## Setup Check

First, check if agent teams are enabled:

```bash
echo ${CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS:-"NOT SET"}
```

If `NOT SET`, run in sequential subagent mode (slower but same output). If set, use full team mode with TeamCreate.

## Step 1: Gather Feature Spec

Ask the user:
1. **Feature name** — one word or short phrase (e.g. "clipboard-manager", "settings-panel")
2. **What the user sees and does** — describe the UI and interactions
3. **What the app needs to do on the bun side** — file access, system calls, APIs, etc.
4. **How many windows?** — one main window, or multiple windows?
5. **Platform requirements?** — CEF needed? Tray? GlobalShortcut? macOS titleBarStyle?

Compose a complete feature spec from the answers.

## Step 2: Run UI Agent

### Team mode (CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1):

```
TeamCreate {
  team_name: "electrobun-feature-team",
  description: "Building <feature-name>"
}

TaskCreate { subject: "T1: UI agent — design views and RPC contract" }
TaskCreate { subject: "T2: Backend agent — bun-side wiring from contract" }
TaskUpdate { taskId: "T2", addBlockedBy: ["T1"] }

# Spawn UI agent with full feature spec
Agent {
  name: "ui-agent",
  team_name: "electrobun-feature-team",
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: "
    You are the electrobun-ui-agent for this project.
    Read: ~/.claude/plugins/electrobun-dev/agents/electrobun-ui-agent.md

    Feature spec:
    <paste full feature spec here>

    Project root: <working directory>

    Complete all Phase 1–4 steps. When done, send the RPC Contract Handoff
    document to the orchestrator via SendMessage.
  "
}
TaskUpdate { taskId: "T1", status: "in_progress", owner: "ui-agent" }
```

### Sequential mode (no teams):

Dispatch the UI agent as a subagent. Provide the full feature spec and instruct it to:
1. Create all renderer files
2. Write `src/shared/types.ts`
3. Return the complete RPC Contract Handoff document

## Step 3: Receive Contract and Validate

When the UI agent completes:
1. Read the RPC Contract Handoff document
2. Verify these files exist:
   - `src/shared/types.ts`
   - `src/<viewname>/index.html`, `index.css`, `index.ts` (for each view)
3. If any are missing, ask the UI agent to complete them before continuing
4. Mark T1 complete: `TaskUpdate { taskId: "T1", status: "completed" }`

## Step 4: Run Backend Agent

### Team mode:

```
Agent {
  name: "backend-agent",
  team_name: "electrobun-feature-team",
  subagent_type: "general-purpose",
  model: "sonnet",
  prompt: "
    You are the electrobun-backend-agent for this project.
    Read: ~/.claude/plugins/electrobun-dev/agents/electrobun-backend-agent.md

    RPC Contract Handoff:
    <paste full handoff document here>

    Project root: <working directory>

    Complete all Phase 1–6 steps. Read the existing electrobun.config.ts
    before editing — merge your additions without removing existing entries.
    When done, report DONE with smoke-test instructions.
  "
}
TaskUpdate { taskId: "T2", status: "in_progress", owner: "backend-agent" }
```

### Sequential mode:

Dispatch the backend agent as a subagent with the full handoff document.

## Step 5: Verify and Report

After the backend agent completes:

1. Verify the complete file tree:
   ```bash
   ls src/bun/index.ts
   ls src/shared/types.ts
   grep "views:" electrobun.config.ts
   ```

2. Shutdown the team (team mode only):
   ```
   SendMessage { target: "ui-agent", type: "shutdown_request" }
   SendMessage { target: "backend-agent", type: "shutdown_request" }
   ```

3. Tell the user:
   ```
   Feature "<name>" is ready.

   Files created:
   - src/<view>/index.{html,css,ts}   (renderer — UI agent)
   - src/shared/types.ts              (RPC schema)
   - src/bun/index.ts                 (bun-side — backend agent)
   - electrobun.config.ts             (updated with views + copy)

   To test:
     bun start

   To add more features:
     /electrobun-feature <next feature>
   ```
