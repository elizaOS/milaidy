#!/usr/bin/env bun
/**
 * Action Selection Baseline Test — Measures how accurately the LLM picks
 * the correct action for ground-truth test messages.
 *
 * Sends messages through the full ElizaOS pipeline and compares the
 * dispatched action (from the debug action log) against expected values.
 *
 * Prerequisites:
 *   - Dev server running at localhost:2138
 *   - MILAIDY_DEBUG_ACTIONS=1 environment variable set
 *
 * Usage: bun run scripts/test-action-selection.ts
 */

const BASE = "http://localhost:2138";
const CHAT_TIMEOUT_MS = 90_000;
const POST_RESPONSE_WAIT_MS = 1_000;

// ── Types ──────────────────────────────────────────────────────────────

interface TestCase {
  input: string;
  expected: string | string[];
  /** Message sent before input to establish context (e.g. create a task).
   *  Runs in a per-test isolated conversation. Not scored. */
  setup?: string;
  note?: string;
}

interface ActionLogEntry {
  action: string;
  status: string;
  roomId: string;
  timestamp: number;
  messageId?: string;
}

interface ActionLogResponse {
  entries: ActionLogEntry[];
  count: number;
}

type TestStatus = "PASS" | "FAIL" | "IMPLICIT" | "TIMEOUT" | "SKIP";

interface TestResult {
  index: number;
  input: string;
  expected: string | string[];
  actual: string;
  status: TestStatus;
  note?: string;
}

// ── Test cases ─────────────────────────────────────────────────────────

const TEST_CASES: TestCase[] = [
  // ── Conversational / REPLY ──────────────────────────────────────────
  { input: "what's the weather like?", expected: ["REPLY", "NONE"] },
  { input: "what can you do?", expected: ["REPLY", "NONE"] },
  { input: "never mind, forget it", expected: "IGNORE" },
  {
    input: "tell me a joke",
    expected: ["REPLY", "NONE"],
    note: "simple conversational",
  },
  {
    input: "what plugins do I have installed?",
    expected: ["REPLY", "NONE"],
    note: "informational question, not a search/install action",
  },
  {
    input: "check my goals",
    expected: ["REPLY", "NONE"],
    note: "goals action may not validate",
  },
  {
    input: "schedule a cron job every hour",
    expected: ["REPLY", "NONE"],
    note: "cron may not validate",
  },
  {
    input: "post something on farcaster",
    expected: ["REPLY", "NONE", "SEARCH_SKILLS"],
    note: "no farcaster configured — searching for a skill is also reasonable",
  },
  {
    input: "provision a cloud agent for me",
    expected: ["REPLY", "NONE"],
    note: "action does not exist (cloud disabled)",
  },

  // ── Search / Discovery ──────────────────────────────────────────────
  {
    input: "search for a twitter plugin",
    expected: ["SEARCH_SKILLS", "SEARCH_PLUGINS"],
    note: "both are reasonable — 'plugin' keyword can trigger either",
  },
  {
    input: "find me a blockchain plugin",
    expected: "SEARCH_SKILLS",
    note: "natural phrasing for search",
  },
  {
    input: "list all available skills",
    expected: "SEARCH_SKILLS",
    note: "'list skills' maps to SEARCH_SKILLS",
  },
  {
    input: "search the plugin registry for auth",
    expected: "SEARCH_PLUGINS",
    note: "explicit 'plugin registry' → SEARCH_PLUGINS",
  },
  {
    input: "search for tasks about deployment",
    expected: ["REPLY", "NONE"],
    note: "SEARCH_TASKS fails validate (orchestrator not configured)",
  },

  // ── Task Management ─────────────────────────────────────────────────
  { input: "create a new task called fix the bug", expected: "CREATE_TASK" },
  {
    input: "add a task to review the PR",
    expected: "CREATE_TASK",
    note: "alternate phrasing for task creation",
  },
  { input: "show my tasks", expected: "LIST_TASKS" },
  {
    input: "what tasks are active?",
    expected: ["REPLY", "NONE"],
    note: "LIST_TASKS.validate() requires 'list task'/'show task'/'my task' — this phrasing fails validate",
  },
  {
    input: "switch to the auth bug task",
    expected: "SWITCH_TASK",
    note: "validates even without matching task",
  },
  { input: "pause the current task", expected: "PAUSE_TASK" },
  { input: "resume the paused task", expected: "RESUME_TASK" },
  {
    input: "cancel task number 3",
    expected: "CANCEL_TASK",
  },
  // Two-step task tests (setup creates real task, then test the action)
  {
    setup: "create a task called deploy fixes",
    input: "switch to the deploy fixes task",
    expected: "SWITCH_TASK",
    note: "two-step: requires task from setup",
  },
  {
    setup: "create a task called test runner",
    input: "pause the current task",
    expected: "PAUSE_TASK",
    note: "two-step: requires active task",
  },
  {
    setup: "create a task called cleanup job",
    input: "cancel the cleanup job task",
    expected: "CANCEL_TASK",
    note: "two-step: requires task from setup",
  },

  // ── Shell / Command ─────────────────────────────────────────────────
  { input: "run ls -la", expected: "EXECUTE_COMMAND" },
  {
    input: "execute echo hello world",
    expected: "EXECUTE_COMMAND",
    note: "alternate phrasing for shell command",
  },
  {
    input: "run npm --version",
    expected: "EXECUTE_COMMAND",
    note: "fast shell command",
  },
  {
    input: "clear the terminal history",
    expected: "CLEAR_SHELL_HISTORY",
  },
  {
    input: "show running processes",
    expected: ["MANAGE_PROCESS", "EXECUTE_COMMAND"],
    note: "may route to EXECUTE_COMMAND instead",
  },
  {
    input: "kill process 1234",
    expected: ["MANAGE_PROCESS", "EXECUTE_COMMAND"],
    note: "may route to EXECUTE_COMMAND instead",
  },

  // ── Skill Management ────────────────────────────────────────────────
  {
    input: "install the discord plugin",
    expected: ["INSTALL_SKILL", "INSTALL_PLUGIN_FROM_REGISTRY"],
    note: "both validate — 'plugin' keyword can trigger either",
  },
  {
    input: "add the weather skill",
    expected: "INSTALL_SKILL",
    note: "'add' is a simile for INSTALL_SKILL",
  },
  { input: "uninstall the twitter plugin", expected: "UNINSTALL_SKILL" },
  { input: "tell me about the weather skill", expected: "GET_SKILL_DETAILS" },
  {
    input: "how do I use the browser skill?",
    expected: "GET_SKILL_GUIDANCE",
  },
  { input: "refresh the skill catalog", expected: "SYNC_SKILL_CATALOG" },
  { input: "enable the discord skill", expected: "TOGGLE_SKILL" },
  { input: "disable the telegram skill", expected: "TOGGLE_SKILL" },
  {
    input: "run the setup script for the twitter skill",
    expected: "RUN_SKILL_SCRIPT",
  },

  // ── Plugin Lifecycle ────────────────────────────────────────────────
  {
    input: "load the anthropic plugin",
    expected: ["REPLY", "NONE", "INSTALL_PLUGIN_FROM_REGISTRY", "INSTALL_SKILL"],
    note: "LOAD_PLUGIN fails validate — installing is a reasonable fallback",
  },
  {
    input: "unload the discord plugin",
    expected: ["REPLY", "NONE", "TOGGLE_SKILL"],
    note: "UNLOAD_PLUGIN fails validate — toggling is reasonable, uninstalling is too destructive",
  },
  {
    input: "clone the weather plugin from registry",
    expected: "CLONE_PLUGIN",
  },
  {
    input: "publish my custom plugin",
    expected: "PUBLISH_PLUGIN",
  },
  {
    input: "install plugin @elizaos/plugin-weather",
    expected: "INSTALL_PLUGIN_FROM_REGISTRY",
    note: "uses @elizaos/ prefix",
  },
  {
    input: "tell me more about the twitter plugin",
    expected: ["REPLY", "NONE"],
    note: "GET_PLUGIN_DETAILS fails validate",
  },

  // ── Subagent Management ─────────────────────────────────────────────
  {
    input: "spawn a subagent to research AI trends",
    expected: "SPAWN_SUBAGENT",
  },
  {
    input: "show all running subagents",
    expected: ["REPLY", "NONE"],
    note: "LIST_SUBAGENTS fails validate (needs active subagents)",
  },
  {
    input: "what's the status of my research subagent?",
    expected: ["REPLY", "NONE"],
    note: "GET_SUBAGENT_STATUS fails validate",
  },
  {
    input: "cancel the background research task",
    expected: "CANCEL_SUBAGENT",
  },
  {
    input: 'send "check the logs" to the monitor agent',
    expected: "SEND_TO_SESSION",
  },

  // ── Communication ───────────────────────────────────────────────────
  {
    input: "send a message to alice on discord",
    expected: ["REPLY", "NONE", "SEND_CROSS_PLATFORM_MESSAGE"],
    note: "no discord configured",
  },
  {
    input: "list my messaging channels",
    expected: "LIST_MESSAGING_CHANNELS",
  },
  {
    input: 'send "hello" to the general room',
    expected: ["REPLY", "NONE"],
    note: "SEND_TO_ROOM fails validate (no rooms configured)",
  },
  {
    input: "send this to the delivery context",
    expected: ["REPLY", "NONE", "SEND_TO_SESSION"],
    note: "SEND_TO_DELIVERY_CONTEXT fails validate — SEND_TO_SESSION is reasonable, listing channels is not",
  },
  {
    input: "deliver this to the context",
    expected: ["REPLY", "NONE"],
    note: "SEND_TO_DELIVERY_CONTEXT fails validate",
  },

  // ── Computer Use (validate fails → REPLY) ──────────────────────────
  {
    input: "open the Chrome browser",
    expected: ["REPLY", "NONE"],
    note: "computer use not configured",
  },
  {
    input: "click the submit button",
    expected: ["REPLY", "NONE"],
    note: "computer use not configured",
  },
  {
    input: 'type "hello world" in the search box',
    expected: ["REPLY", "NONE"],
    note: "computer use not configured",
  },
  {
    input: "list running applications",
    expected: ["REPLY", "NONE", "EXECUTE_COMMAND", "MANAGE_PROCESS"],
    note: "computer use not configured — shell actions are a reasonable fallback",
  },
  {
    input: "show the window tree",
    expected: ["REPLY", "NONE"],
    note: "computer use not configured",
  },

  // ── Edge / Disambiguation ──────────────────────────────────────────
  {
    input: "do nothing",
    expected: ["NONE", "REPLY"],
    note: "explicit no-action",
  },
  {
    input: "tell me more about the weather skill",
    expected: "GET_SKILL_DETAILS",
    note: "'more about' + 'skill'",
  },
  {
    input: "send a notification to the session",
    expected: ["SEND_TO_SESSION", "REPLY", "NONE"],
    note: "SEND_TO_SESSION_MESSAGE may not validate",
  },

  // ── RESTART_AGENT must be last ─────────────────────────────────────
  {
    input: "restart yourself",
    expected: "RESTART_AGENT",
    note: "PLACE LAST — causes actual restart",
  },
];

// ── Helpers ─────────────────────────────────────────────────────────────

async function fetchJson<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

async function deleteJson<T = unknown>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status} ${res.statusText}`);
  return res.json() as Promise<T>;
}

/** Create a fresh isolated conversation. Returns { convId, roomId }. */
async function createConversation(): Promise<{ convId: string; roomId: string }> {
  const res = await fetch(`${BASE}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `bench-${Date.now()}`,
    }),
  });
  if (!res.ok) throw new Error(`Failed to create conversation: ${res.status}`);
  const data = (await res.json()) as {
    conversation: { id: string; roomId: string };
  };
  return {
    convId: data.conversation.id,
    roomId: data.conversation.roomId,
  };
}

/** Send a message to a conversation. Drains response body to ensure
 *  the server has finished processing (actions dispatch before response). */
async function sendChat(text: string, convId: string): Promise<number> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    const res = await fetch(
      `${BASE}/api/conversations/${convId}/messages`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
        signal: controller.signal,
      },
    );
    // Drain body — ensures server finished processing before we read action log
    await res.text();
    return res.status;
  } finally {
    clearTimeout(timeout);
  }
}

/** Delete a conversation (best-effort, swallows errors). */
async function deleteConversation(convId: string): Promise<void> {
  try {
    await deleteJson(`/api/conversations/${convId}`);
  } catch {
    // best-effort — agent may have restarted
  }
}

/** Get current action log count. */
async function getActionLogCount(): Promise<number> {
  try {
    const log = await fetchJson<ActionLogResponse>("/api/debug/action-log");
    return log.count;
  } catch {
    return 0;
  }
}

/** Get action log entries after a given offset, optionally filtered by roomId. */
async function getNewActions(
  afterOffset: number,
  roomId?: string,
): Promise<{ entries: ActionLogEntry[]; fetchFailed: boolean }> {
  try {
    const log = await fetchJson<ActionLogResponse>("/api/debug/action-log");
    let entries = log.entries.slice(afterOffset);
    if (roomId) {
      entries = entries.filter((e) => e.roomId === roomId);
    }
    return { entries, fetchFailed: false };
  } catch {
    return { entries: [], fetchFailed: true };
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function pad(s: string, w: number): string {
  if (s.length >= w) return s.slice(0, w);
  return s.padEnd(w);
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log("╔═════════════════════════════════════════════╗");
  console.log("║    ACTION SELECTION BASELINE TEST            ║");
  console.log("╚═════════════════════════════════════════════╝\n");

  // 1. Check agent is running
  let agentName = "unknown";
  let model = "unknown";
  try {
    const status = await fetchJson<{
      state: string;
      agentName?: string;
      model?: string;
    }>("/api/status");
    if (status.state !== "running") {
      console.error("Agent is not running. Start with: bun run dev");
      process.exit(1);
    }
    agentName = status.agentName || "unknown";
    model = status.model || "unknown";
  } catch (err) {
    console.error(`Failed to reach agent at ${BASE}/api/status: ${err}`);
    process.exit(1);
  }

  console.log(`Agent: ${agentName} | Model: ${model}\n`);

  // 2. Check action log endpoint is accessible (confirms MILAIDY_DEBUG_ACTIONS=1)
  try {
    await fetchJson<ActionLogResponse>("/api/debug/action-log");
  } catch (err) {
    console.error(
      `Failed to access /api/debug/action-log.\n` +
        `Make sure MILAIDY_DEBUG_ACTIONS=1 is set in your environment.\n` +
        `Error: ${err}`,
    );
    process.exit(1);
  }

  // 3. Clear the action log
  try {
    await deleteJson("/api/debug/action-log");
  } catch (err) {
    console.error(`Failed to clear action log: ${err}`);
    process.exit(1);
  }

  console.log(`Action log cleared. Per-test isolation enabled. Starting...\n`);

  // 4. Run test cases — each test gets its own conversation
  const results: TestResult[] = [];

  const colNum = 4;
  const colInput = 46;
  const colExpected = 28;
  const colActual = 28;
  const colStatus = 10;

  console.log(
    ` ${pad("#", colNum)} ${pad("Input", colInput)} ${pad("Expected", colExpected)} ${pad("Actual", colActual)} ${pad("Status", colStatus)}`,
  );

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    const testNum = i + 1;

    // a. Create isolated conversation for this test
    let convId: string;
    let roomId: string;
    try {
      ({ convId, roomId } = await createConversation());
    } catch (err) {
      console.error(`  [error] Failed to create conversation for #${testNum}: ${err}`);
      results.push({
        index: testNum,
        input: tc.input,
        expected: tc.expected,
        actual: "(no conv)",
        status: "FAIL",
        note: tc.note,
      });
      continue;
    }

    // b. If setup, send setup message first (not scored)
    if (tc.setup) {
      const setupBefore = await getActionLogCount();
      let setupOk = false;
      try {
        const setupStatus = await sendChat(tc.setup, convId);
        await sleep(POST_RESPONSE_WAIT_MS);
        if (setupStatus >= 200 && setupStatus < 300) {
          // Verify CREATE_TASK actually fired (filter by this conversation's room)
          const { entries: setupActions } = await getNewActions(setupBefore, roomId);
          const taskCreated = setupActions.some(
            (e) => e.action.toUpperCase() === "CREATE_TASK",
          );
          if (taskCreated) {
            setupOk = true;
          } else {
            console.error(
              `    [warn] Setup for #${testNum}: CREATE_TASK did not fire (got: ${setupActions.map((e) => e.action).join(", ") || "none"})`,
            );
          }
        } else {
          console.error(
            `    [warn] Setup for #${testNum}: HTTP ${setupStatus}`,
          );
        }
      } catch (err) {
        console.error(`    [warn] Setup failed for #${testNum}: ${err}`);
      }
      if (!setupOk) {
        const expectedDisplay = Array.isArray(tc.expected)
          ? tc.expected.join("|")
          : tc.expected;
        results.push({
          index: testNum,
          input: tc.input,
          expected: tc.expected,
          actual: "(setup failed)",
          status: "SKIP",
          note: tc.note,
        });
        console.log(
          ` ${pad(String(testNum), colNum)} ${pad(tc.input + " [2-step]", colInput)} ${pad(expectedDisplay, colExpected)} ${pad("(setup failed)", colActual)} \x1b[33mSKIP\x1b[0m`,
        );
        await deleteConversation(convId);
        continue;
      }
    }

    // c. Record action log offset (after setup)
    const prevCount = await getActionLogCount();

    // d. Send the actual test message
    let timedOut = false;
    let httpStatus = 0;
    try {
      httpStatus = await sendChat(tc.input, convId);
    } catch (err: unknown) {
      const errObj = err as { name?: string };
      if (errObj?.name === "AbortError" || String(err).includes("abort")) {
        timedOut = true;
      } else {
        console.error(`    [warn] Chat error for #${testNum}: ${err}`);
      }
    }

    if (timedOut) {
      results.push({
        index: testNum,
        input: tc.input,
        expected: tc.expected,
        actual: "—",
        status: "TIMEOUT",
        note: tc.note,
      });
      const expectedDisplayTimeout = Array.isArray(tc.expected)
        ? tc.expected.join("|")
        : tc.expected;
      console.log(
        ` ${pad(String(testNum), colNum)} ${pad(tc.input, colInput)} ${pad(expectedDisplayTimeout, colExpected)} ${pad("—", colActual)} \x1b[33mTIMEOUT\x1b[0m`,
      );
      await deleteConversation(convId);
      continue;
    }

    // e. Wait for action to complete
    await sleep(POST_RESPONSE_WAIT_MS);

    // f. Check action log (filtered by this test's room to prevent cross-test bleed)
    const { entries: newEntries, fetchFailed } = await getNewActions(prevCount, roomId);
    const newActionNames = newEntries.map((e) => e.action.toUpperCase());
    const expectedArr = Array.isArray(tc.expected)
      ? tc.expected.map((e) => e.toUpperCase())
      : [tc.expected.toUpperCase()];

    let actual: string;
    let status: TestStatus;

    // Server error — don't count as IMPLICIT pass unless expected action
    // is known to have a broken handler (validates but handler crashes)
    if (httpStatus >= 500 && newActionNames.length === 0) {
      // Handler crashed — action was likely selected but threw before logging.
      // If expected includes REPLY/NONE, count as implicit (server correctly tried).
      // Otherwise report the HTTP error.
      if (expectedArr.includes("REPLY") || expectedArr.includes("NONE")) {
        actual = `(HTTP ${httpStatus}, implicit)`;
        status = "IMPLICIT";
      } else {
        actual = `(HTTP ${httpStatus})`;
        status = "FAIL";
      }
    } else if (httpStatus >= 400 && httpStatus < 500 && !fetchFailed) {
      actual = `(HTTP ${httpStatus})`;
      status = "FAIL";
    } else if (fetchFailed && expectedArr.includes("RESTART_AGENT")) {
      actual = "(agent restarted)";
      status = "PASS";
    } else if (newActionNames.length === 0) {
      if (expectedArr.includes("REPLY") || expectedArr.includes("NONE")) {
        actual = "(implicit)";
        status = "IMPLICIT";
      } else if (expectedArr.includes("IGNORE")) {
        actual = "(ignored)";
        status = "PASS";
      } else {
        actual = "(none)";
        status = "FAIL";
      }
    } else if (newActionNames.some((name) => expectedArr.includes(name))) {
      actual = newActionNames.join(", ");
      status = "PASS";
    } else {
      actual = newActionNames.join(", ");
      status = "FAIL";
    }

    results.push({
      index: testNum,
      input: tc.input,
      expected: tc.expected,
      actual,
      status,
      note: tc.note,
    });

    const statusLabel =
      status === "PASS"
        ? "\x1b[32mPASS\x1b[0m"
        : status === "IMPLICIT"
          ? "\x1b[33mIMPLICIT\x1b[0m"
          : "\x1b[31mFAIL\x1b[0m";

    const expectedDisplay = Array.isArray(tc.expected)
      ? tc.expected.join("|")
      : tc.expected;
    const label = tc.setup ? `${tc.input} [2-step]` : tc.input;
    console.log(
      ` ${pad(String(testNum), colNum)} ${pad(label, colInput)} ${pad(expectedDisplay, colExpected)} ${pad(actual, colActual)} ${statusLabel}`,
    );

    // g. Clean up
    await deleteConversation(convId);
  }

  // 5. Summary
  const total = results.length;
  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  const implicitCount = results.filter((r) => r.status === "IMPLICIT").length;
  const timeoutCount = results.filter((r) => r.status === "TIMEOUT").length;
  const skipCount = results.filter((r) => r.status === "SKIP").length;
  const scored = total - skipCount;
  const accuracy = scored > 0
    ? (((passCount + implicitCount) / scored) * 100).toFixed(1)
    : "N/A";

  console.log("\n═══ SUMMARY ═══\n");
  console.log(`Total:      ${total}${skipCount > 0 ? ` (${skipCount} skipped)` : ""}`);
  console.log(`Pass:       ${passCount}`);
  console.log(`Fail:       ${failCount}`);
  console.log(`Implicit:   ${implicitCount}  (REPLY/NONE with no action event)`);
  console.log(`Timeout:    ${timeoutCount}`);
  if (skipCount > 0) console.log(`Skip:       ${skipCount}  (setup precondition failed)`);
  console.log(`Accuracy:   ${accuracy}%  (pass + implicit) / scored`);

  const failures = results.filter(
    (r) => r.status === "FAIL" || r.status === "TIMEOUT",
  );
  if (failures.length > 0) {
    console.log("\nFailure details:");
    for (const f of failures) {
      const fExpectedDisplay = Array.isArray(f.expected)
        ? f.expected.join("|")
        : f.expected;
      const suffix =
        f.status === "TIMEOUT"
          ? `timed out after ${CHAT_TIMEOUT_MS / 1000}s`
          : `expected ${fExpectedDisplay}, got ${f.actual}`;
      const noteStr = f.note ? ` (${f.note})` : "";
      console.log(`  #${f.index}  "${f.input}" → ${suffix}${noteStr}`);
    }
  }

  const restartResult = results.find((r) =>
    Array.isArray(r.expected)
      ? r.expected.includes("RESTART_AGENT")
      : r.expected === "RESTART_AGENT",
  );
  if (restartResult) {
    console.log(
      "\nNote: RESTART_AGENT test was last. The agent may now be restarting.",
    );
  }

  console.log();
}

main().catch((err) => {
  console.error(`Fatal error: ${err}`);
  process.exit(1);
});
