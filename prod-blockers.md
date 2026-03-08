# Production Blockers

Issues that need resolution before production use. Each item blocks real functionality.

---

## 1. AgentOrchestratorService — no-op provider (ACTIVE)

**Status:** Workaround in place (no-op provider), needs real implementation.

**What:** `@elizaos/plugin-agent-orchestrator` is configured with a no-op provider that tracks tasks in DB but doesn't execute them. CREATE_TASK creates a record, SPAWN_SUBAGENT creates a record — but nothing actually runs.

**Impact:** 13 actions work at the UI/selection level but don't perform real work:
- Task management: CREATE_TASK, LIST_TASKS, SWITCH_TASK, PAUSE_TASK, RESUME_TASK, CANCEL_TASK, SEARCH_TASKS
- Subagent management: SPAWN_SUBAGENT, LIST_SUBAGENTS, CANCEL_SUBAGENT, GET_SUBAGENT_STATUS
- Session messaging: SEND_TO_SESSION, SEND_TO_DELIVERY_CONTEXT

**Fix:** Replace no-op provider in `src/runtime/eliza.ts` (search for `configureAgentOrchestratorPlugin`) with a real provider. Options:
- `"claude-code"` — delegates to Claude Code CLI
- `"codex"` — delegates to OpenAI Codex CLI
- `"eliza+plugin-code"` — uses ElizaOS plugin-code's CoderService
- Custom provider with shell-based execution

**Reference:** See `elizaOS/examples/code/src/lib/agent.ts` for full provider implementations.

**Where:** `src/runtime/eliza.ts` ~line 1970, marked with `TODO(prod-blocker)`.

---

## 2. LOAD_PLUGIN / UNLOAD_PLUGIN / GET_PLUGIN_DETAILS — validate fails

**Status:** Not investigated.

**What:** These 3 plugin-manager actions fail `validate()` even though `PluginManagerService` is registered. Likely need specific plugin state or configuration.

**Impact:** Users can't dynamically load/unload plugins or get plugin details via chat.

**Fix:** Investigate validate() implementations in `@elizaos/plugin-plugin-manager`. May need specific config or registered plugins in a particular state.

---

## 3. SEND_TO_ROOM — validate fails (no rooms configured)

**Status:** Expected — no messaging platforms configured.

**What:** `SEND_TO_ROOM` fails validate because no messaging rooms (Discord, Telegram, etc.) are configured.

**Impact:** Can't send messages to specific rooms/channels.

**Fix:** Configure messaging platform integrations. This is expected behavior when running without external platform connections.

---

## 4. Computer Use — plugin not enabled

**Status:** Expected — feature flag not set.

**What:** 5 COMPUTERUSE_* actions fail validate because `@elizaos/plugin-computeruse` isn't loaded.

**Impact:** No browser/desktop automation.

**Fix:** Set `features.computeruse: true` in config. Only enable when computer use is actually needed.

---

## 5. LIST_SUBAGENTS / GET_SUBAGENT_STATUS / SEARCH_TASKS — validate fails

**Status:** Partially fixed by orchestrator config. May need active subagents/tasks to validate.

**What:** Some orchestrator actions may have additional validate() checks beyond service existence (e.g., LIST_SUBAGENTS may require at least one subagent to exist).

**Impact:** These actions may still fail validate in cold-start scenarios with no existing tasks/subagents.

**Fix:** Test after orchestrator config is applied. May need enriched validate() or may work as-is.
