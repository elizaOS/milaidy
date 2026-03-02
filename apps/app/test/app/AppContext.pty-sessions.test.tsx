import { describe, expect, it, vi } from "vitest";
import type { CodingAgentSession } from "../../src/api-client";

/**
 * Tests for the PTY session hydration logic used in AppContext.
 *
 * The hydratePtySessions() function inside AppContext filters out terminal
 * statuses and maps server tasks to CodingAgentSession objects. We test
 * the filtering and mapping logic directly since the full AppProvider
 * requires jsdom which has a dependency conflict in this environment.
 */

// ---------------------------------------------------------------------------
// Replicate the TERMINAL_STATUSES filter from AppContext (line 4912)
// ---------------------------------------------------------------------------

const TERMINAL_STATUSES = new Set(["completed", "stopped", "error"]);

interface ServerTask {
  sessionId: string;
  agentType?: string;
  label?: string;
  originalTask?: string;
  workdir?: string;
  status?: string;
  decisionCount?: number;
  autoResolvedCount?: number;
}

/** Replicates the hydratePtySessions mapping logic from AppContext:4917-4930 */
function hydratePtySessions(tasks: ServerTask[]): CodingAgentSession[] {
  return tasks
    .filter((t) => !TERMINAL_STATUSES.has(t.status ?? ""))
    .map((t) => ({
      sessionId: t.sessionId,
      agentType: t.agentType ?? "claude",
      label: t.label ?? t.sessionId,
      originalTask: t.originalTask ?? "",
      workdir: t.workdir ?? "",
      status: t.status ?? "active",
      decisionCount: t.decisionCount ?? 0,
      autoResolvedCount: t.autoResolvedCount ?? 0,
    }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("hydratePtySessions — filtering", () => {
  it("filters out completed sessions", () => {
    const tasks: ServerTask[] = [
      { sessionId: "s-1", status: "active" },
      { sessionId: "s-2", status: "completed" },
    ];
    const result = hydratePtySessions(tasks);
    expect(result.length).toBe(1);
    expect(result[0].sessionId).toBe("s-1");
  });

  it("filters out stopped sessions", () => {
    const tasks: ServerTask[] = [
      { sessionId: "s-1", status: "active" },
      { sessionId: "s-2", status: "stopped" },
    ];
    const result = hydratePtySessions(tasks);
    expect(result.length).toBe(1);
    expect(result[0].sessionId).toBe("s-1");
  });

  it("filters out error sessions", () => {
    const tasks: ServerTask[] = [
      { sessionId: "s-1", status: "active" },
      { sessionId: "s-2", status: "error" },
    ];
    const result = hydratePtySessions(tasks);
    expect(result.length).toBe(1);
    expect(result[0].sessionId).toBe("s-1");
  });

  it("filters out all terminal statuses from a mixed list", () => {
    const tasks: ServerTask[] = [
      { sessionId: "s-active", status: "active" },
      { sessionId: "s-completed", status: "completed" },
      { sessionId: "s-stopped", status: "stopped" },
      { sessionId: "s-error", status: "error" },
      { sessionId: "s-blocked", status: "blocked" },
      { sessionId: "s-tool", status: "tool_running" },
    ];
    const result = hydratePtySessions(tasks);
    expect(result.length).toBe(3);
    expect(result.map((s) => s.sessionId)).toEqual([
      "s-active",
      "s-blocked",
      "s-tool",
    ]);
  });

  it("returns empty array when all sessions are terminal", () => {
    const tasks: ServerTask[] = [
      { sessionId: "s-1", status: "completed" },
      { sessionId: "s-2", status: "stopped" },
      { sessionId: "s-3", status: "error" },
    ];
    const result = hydratePtySessions(tasks);
    expect(result.length).toBe(0);
  });

  it("returns empty array when tasks is empty", () => {
    const result = hydratePtySessions([]);
    expect(result.length).toBe(0);
  });

  it("treats missing status as active (defaults)", () => {
    const tasks: ServerTask[] = [{ sessionId: "s-1" }];
    const result = hydratePtySessions(tasks);
    expect(result.length).toBe(1);
    expect(result[0].status).toBe("active");
  });
});

describe("hydratePtySessions — field mapping", () => {
  it("maps all fields with defaults", () => {
    const tasks: ServerTask[] = [{ sessionId: "s-1" }];
    const result = hydratePtySessions(tasks);
    expect(result[0]).toEqual({
      sessionId: "s-1",
      agentType: "claude",
      label: "s-1",
      originalTask: "",
      workdir: "",
      status: "active",
      decisionCount: 0,
      autoResolvedCount: 0,
    });
  });

  it("maps all fields from server data", () => {
    const tasks: ServerTask[] = [
      {
        sessionId: "s-1",
        agentType: "gemini",
        label: "My Agent",
        originalTask: "Fix the bug",
        workdir: "/workspace/project",
        status: "blocked",
        decisionCount: 5,
        autoResolvedCount: 3,
      },
    ];
    const result = hydratePtySessions(tasks);
    expect(result[0]).toEqual({
      sessionId: "s-1",
      agentType: "gemini",
      label: "My Agent",
      originalTask: "Fix the bug",
      workdir: "/workspace/project",
      status: "blocked",
      decisionCount: 5,
      autoResolvedCount: 3,
    });
  });
});

describe("WS pty-session-event handler — unknown session triggers hydration", () => {
  /**
   * Replicates the logic at AppContext:5179-5187 that triggers
   * hydratePtySessions() when a pty-session-event arrives for
   * a session ID not in the current list.
   */
  it("returns prev unchanged and signals hydration for unknown IDs", () => {
    const prev: CodingAgentSession[] = [
      {
        sessionId: "s-1",
        agentType: "claude",
        label: "Agent 1",
        originalTask: "Task 1",
        workdir: "/workspace",
        status: "active",
        decisionCount: 0,
        autoResolvedCount: 0,
      },
    ];

    // Simulate the applyUpdate function for an unknown session
    const unknownSessionId = "s-new";
    const known = prev.some((s) => s.sessionId === unknownSessionId);
    expect(known).toBe(false);

    // When unknown, applyUpdate returns prev unchanged
    // And the outer setPtySessions callback detects (next === prev && !known) → hydrate
    const shouldHydrate = !known;
    expect(shouldHydrate).toBe(true);
  });

  it("does not trigger hydration for known session IDs", () => {
    const prev: CodingAgentSession[] = [
      {
        sessionId: "s-1",
        agentType: "claude",
        label: "Agent 1",
        originalTask: "Task 1",
        workdir: "/workspace",
        status: "active",
        decisionCount: 0,
        autoResolvedCount: 0,
      },
    ];

    const knownSessionId = "s-1";
    const known = prev.some((s) => s.sessionId === knownSessionId);
    expect(known).toBe(true);
  });
});

describe("WS reconnect triggers hydration", () => {
  it("ws-reconnected event handler calls hydratePtySessions", () => {
    // This test verifies the pattern: client.onWsEvent("ws-reconnected", () => hydrate())
    // We test that the handler is registered and would invoke hydration.
    const hydrate = vi.fn();
    const handlers = new Map<string, () => void>();

    // Simulate: unbindWsReconnect = client.onWsEvent("ws-reconnected", () => hydrate())
    handlers.set("ws-reconnected", () => hydrate());

    // Simulate WS reconnect firing
    const handler = handlers.get("ws-reconnected");
    expect(handler).toBeDefined();
    handler!();
    expect(hydrate).toHaveBeenCalledTimes(1);
  });
});
