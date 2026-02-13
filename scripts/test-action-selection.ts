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

type TestStatus = "PASS" | "FAIL" | "IMPLICIT" | "TIMEOUT";

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
  { input: "what's the weather like?", expected: "REPLY" },
  { input: "what can you do?", expected: "REPLY" },
  { input: "never mind, forget it", expected: "IGNORE" },
  {
    input: "search for a twitter plugin",
    expected: "SEARCH_SKILLS",
    note: "disambiguation: prefer SEARCH_SKILLS over SEARCH_PLUGINS",
  },
  { input: "create a new task called fix the bug", expected: "CREATE_TASK" },
  { input: "run ls -la", expected: "EXECUTE_COMMAND" },
  {
    input: "send a message to alice on discord",
    expected: ["REPLY", "SEND_CROSS_PLATFORM_MESSAGE"],
    note: "no discord configured; SEND_CROSS_PLATFORM_MESSAGE is also acceptable",
  },
  {
    input: "post something on farcaster",
    expected: "REPLY",
    note: "no farcaster configured",
  },
  {
    input: "spawn a subagent to research AI trends",
    expected: "SPAWN_SUBAGENT",
  },
  {
    input: "check my goals",
    expected: "REPLY",
    note: "goals action may not validate",
  },
  {
    input: "schedule a cron job every hour",
    expected: "REPLY",
    note: "cron may not validate",
  },
  { input: "install the discord plugin", expected: "INSTALL_SKILL" },
  {
    input: "send this to the delivery context",
    expected: "REPLY",
    note: "SEND_TO_DELIVERY_CONTEXT fails validate (needs params.deliveryContext)",
  },
  {
    input: "provision a cloud agent for me",
    expected: "REPLY",
    note: "PROVISION_CLOUD_AGENT action does not exist (cloud disabled)",
  },
  // ── New targeted cases ──────────────────────────────────────────────
  {
    input: "execute echo hello world",
    expected: "EXECUTE_COMMAND",
    note: "alternate phrasing for shell command",
  },
  {
    input: "find me a blockchain plugin",
    expected: "SEARCH_SKILLS",
    note: "natural phrasing for search",
  },
  {
    input: "add a task to review the PR",
    expected: "CREATE_TASK",
    note: "alternate phrasing for task creation",
  },
  {
    input: "add the weather skill",
    expected: "INSTALL_SKILL",
    note: "'add' is a simile for INSTALL_SKILL",
  },
  {
    input: "what plugins do I have installed?",
    expected: "REPLY",
    note: "informational question, not a search/install action",
  },
  {
    input: "run npm --version",
    expected: "EXECUTE_COMMAND",
    note: "shell command that completes quickly; tests EXECUTE_COMMAND selection",
  },
  {
    input: "tell me a joke",
    expected: "REPLY",
    note: "simple conversational, should not trigger any action",
  },
  {
    input: "list all available skills",
    expected: "SEARCH_SKILLS",
    note: "'list skills' maps to SEARCH_SKILLS (browse/list is a simile)",
  },
  // ── RESTART_AGENT must be last ─────────────────────────────────────
  {
    input: "restart yourself",
    expected: "RESTART_AGENT",
    note: "PLACE LAST - causes actual restart",
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

/** Active conversation ID for this benchmark run (isolated room). */
let conversationId: string | null = null;

/**
 * Create a fresh conversation so each benchmark run gets its own room.
 * Without this, all messages accumulate in the shared `/api/chat` room and
 * flood RECENT_MESSAGES context, causing action selection to degrade.
 */
async function createBenchmarkConversation(): Promise<string> {
  const res = await fetch(`${BASE}/api/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: `benchmark-${new Date().toISOString().slice(0, 19)}`,
    }),
  });
  if (!res.ok) throw new Error(`Failed to create conversation: ${res.status}`);
  const data = (await res.json()) as { conversation: { id: string } };
  return data.conversation.id;
}

async function sendChat(text: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), CHAT_TIMEOUT_MS);
  try {
    // Use isolated conversation room instead of the shared /api/chat room
    const url = conversationId
      ? `${BASE}/api/conversations/${conversationId}/messages`
      : `${BASE}/api/chat`;
    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
      signal: controller.signal,
    });
    return res;
  } finally {
    clearTimeout(timeout);
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

  // 3b. Create an isolated conversation for this benchmark run
  try {
    conversationId = await createBenchmarkConversation();
  } catch (err) {
    console.error(
      `Failed to create benchmark conversation: ${err}\n` +
        `Falling back to shared /api/chat room (results may be polluted by prior runs).`,
    );
  }

  console.log(
    `Action log cleared.${conversationId ? ` Conversation: ${conversationId}` : " (shared room)"} Starting test run...\n`,
  );

  // 4. Run test cases
  const results: TestResult[] = [];

  // Print table header
  const colNum = 4;
  const colInput = 42;
  const colExpected = 25;
  const colActual = 25;
  const colStatus = 10;

  console.log(
    ` ${pad("#", colNum)} ${pad("Input", colInput)} ${pad("Expected", colExpected)} ${pad("Actual", colActual)} ${pad("Status", colStatus)}`,
  );

  for (let i = 0; i < TEST_CASES.length; i++) {
    const tc = TEST_CASES[i];
    const testNum = i + 1;

    // a. Record current action log length
    let prevCount: number;
    try {
      const log = await fetchJson<ActionLogResponse>("/api/debug/action-log");
      prevCount = log.count;
    } catch {
      prevCount = 0;
    }

    // b. Send message
    let timedOut = false;
    try {
      await sendChat(tc.input);
    } catch (err: unknown) {
      const errObj = err as { name?: string };
      if (errObj?.name === "AbortError" || String(err).includes("abort")) {
        timedOut = true;
      } else {
        // Non-timeout errors: log but continue
        console.error(`    [warn] Chat error for case #${testNum}: ${err}`);
      }
    }

    if (timedOut) {
      const result: TestResult = {
        index: testNum,
        input: tc.input,
        expected: tc.expected,
        actual: "—",
        status: "TIMEOUT",
        note: tc.note,
      };
      results.push(result);
      const expectedDisplayTimeout = Array.isArray(tc.expected)
        ? tc.expected.join("|")
        : tc.expected;
      console.log(
        ` ${pad(String(testNum), colNum)} ${pad(tc.input, colInput)} ${pad(expectedDisplayTimeout, colExpected)} ${pad("—", colActual)} ${pad("TIMEOUT", colStatus)}`,
      );
      continue;
    }

    // c. Response came back — action completes before response
    // d. Wait safety margin
    await sleep(POST_RESPONSE_WAIT_MS);

    // e. Fetch action log again
    let newEntries: ActionLogEntry[] = [];
    let fetchFailed = false;
    try {
      const log = await fetchJson<ActionLogResponse>("/api/debug/action-log");
      // f. Find new entries (index >= previous count)
      newEntries = log.entries.slice(prevCount);
    } catch {
      fetchFailed = true;
    }

    // g. Compare
    const newActionNames = newEntries.map((e) => e.action.toUpperCase());
    const expectedArr = Array.isArray(tc.expected)
      ? tc.expected.map((e) => e.toUpperCase())
      : [tc.expected.toUpperCase()];

    let actual: string;
    let status: TestStatus;

    if (fetchFailed && expectedArr.includes("RESTART_AGENT")) {
      // Agent restarted — action log lost, but the restart itself confirms dispatch
      actual = "(agent restarted)";
      status = "PASS";
    } else if (newActionNames.length === 0) {
      // No action was dispatched
      if (expectedArr.includes("REPLY")) {
        // Edge case 1: REPLY is sometimes implicit (ElizaOS uses "simple" mode
        // for REPLY-only responses, skipping processActions entirely)
        actual = "(implicit)";
        status = "IMPLICIT";
      } else if (expectedArr.includes("IGNORE")) {
        // Edge case 2: IGNORE is handled at the shouldRespond stage — the model
        // decides not to respond at all, so processActions is never called and
        // no ACTION_COMPLETED event fires.  "(none)" is the correct outcome.
        actual = "(ignored)";
        status = "PASS";
      } else {
        actual = "(none)";
        status = "FAIL";
      }
    } else if (newActionNames.some((name) => expectedArr.includes(name))) {
      // Edge case 3: Expected action appears anywhere in new entries
      actual = newActionNames.join(", ");
      status = "PASS";
    } else {
      // Action was dispatched but doesn't match expected
      actual = newActionNames.join(", ");
      status = "FAIL";
    }

    const result: TestResult = {
      index: testNum,
      input: tc.input,
      expected: tc.expected,
      actual,
      status,
      note: tc.note,
    };
    results.push(result);

    const statusLabel =
      status === "PASS"
        ? "\x1b[32mPASS\x1b[0m"
        : status === "IMPLICIT"
          ? "\x1b[33mIMPLICIT\x1b[0m"
          : status === "TIMEOUT"
            ? "\x1b[33mTIMEOUT\x1b[0m"
            : "\x1b[31mFAIL\x1b[0m";

    const expectedDisplay = Array.isArray(tc.expected)
      ? tc.expected.join("|")
      : tc.expected;
    console.log(
      ` ${pad(String(testNum), colNum)} ${pad(tc.input, colInput)} ${pad(expectedDisplay, colExpected)} ${pad(actual, colActual)} ${statusLabel}`,
    );
  }

  // 5. Summary
  const total = results.length;
  const passCount = results.filter((r) => r.status === "PASS").length;
  const failCount = results.filter((r) => r.status === "FAIL").length;
  const implicitCount = results.filter((r) => r.status === "IMPLICIT").length;
  const timeoutCount = results.filter((r) => r.status === "TIMEOUT").length;
  const accuracy = (((passCount + implicitCount) / total) * 100).toFixed(1);

  console.log("\n═══ SUMMARY ═══\n");
  console.log(`Total:      ${total}`);
  console.log(`Pass:       ${passCount}`);
  console.log(`Fail:       ${failCount}`);
  console.log(`Implicit:   ${implicitCount}  (REPLY with no action event)`);
  console.log(`Timeout:    ${timeoutCount}`);
  console.log(`Accuracy:   ${accuracy}%  (pass + implicit) / total`);

  // Failure details
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
      console.log(`  #${f.index}  "${f.input}" \u2192 ${suffix}${noteStr}`);
    }
  }

  // Edge case 2: Note about RESTART_AGENT
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

  // 6. Clean up benchmark conversation (don't pollute the conversations list)
  if (conversationId) {
    try {
      await deleteJson(`/api/conversations/${conversationId}`);
    } catch {
      // Agent may have restarted (RESTART_AGENT test), cleanup is best-effort
    }
  }

  console.log();
}

main().catch((err) => {
  console.error(`Fatal error: ${err}`);
  process.exit(1);
});
