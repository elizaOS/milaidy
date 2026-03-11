import type { CodingAgentSession } from "@milady/app-core/api";
import React from "react";
import TestRenderer, { act } from "react-test-renderer";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("@milady/app-core/api", () => ({
  client: {
    stopCodingAgent: vi.fn(async () => {}),
    subscribePtyOutput: vi.fn(),
    unsubscribePtyOutput: vi.fn(),
    sendPtyInput: vi.fn(),
    resizePty: vi.fn(),
    getPtyBufferedOutput: vi.fn(async () => ""),
    onWsEvent: vi.fn(() => () => {}),
  },
}));

// Mock XTerminal as a simple div so we can detect mount/unmount
vi.mock("../../src/components/XTerminal", () => ({
  XTerminal: (props: { sessionId: string; active?: boolean }) =>
    React.createElement("div", {
      "data-testid": `xterminal-${props.sessionId}`,
      "data-active": String(props.active ?? false),
    }),
}));

import { CodingAgentsSection } from "../../src/components/CodingAgentsSection";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createSession(
  id: string,
  overrides: Partial<CodingAgentSession> = {},
): CodingAgentSession {
  return {
    sessionId: id,
    agentType: "claude",
    label: `Agent ${id}`,
    originalTask: `Task for ${id}`,
    workdir: "/workspace",
    status: "active",
    decisionCount: 0,
    autoResolvedCount: 0,
    ...overrides,
  };
}

function findByTestId(
  root: TestRenderer.ReactTestInstance,
  testId: string,
): TestRenderer.ReactTestInstance | null {
  try {
    return root.findByProps({ "data-testid": testId });
  } catch {
    return null;
  }
}

function findAllByTestId(
  root: TestRenderer.ReactTestInstance,
  pattern: RegExp,
): TestRenderer.ReactTestInstance[] {
  return root.findAll(
    (node) =>
      typeof node.props["data-testid"] === "string" &&
      pattern.test(node.props["data-testid"]),
  );
}

/** Find session card toggle elements (div[role="button"] with w-full text-left) */
function sessionCardButtons(
  root: TestRenderer.ReactTestInstance,
): TestRenderer.ReactTestInstance[] {
  return root.findAll(
    (node) =>
      node.type === "div" &&
      node.props.role === "button" &&
      typeof node.props.className === "string" &&
      node.props.className.includes("w-full text-left"),
  );
}

async function flush(): Promise<void> {
  await new Promise((r) => setTimeout(r, 0));
  await act(async () => {});
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("CodingAgentsSection — terminal keep-alive", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("mountedSessions grows when terminal is toggled open", async () => {
    const sessions = [createSession("s-1"), createSession("s-2")];

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(CodingAgentsSection, { sessions }),
      );
    });

    // Initially no XTerminals should be mounted
    let terminals = findAllByTestId(tree?.root, /^xterminal-/);
    expect(terminals.length).toBe(0);

    const buttons = sessionCardButtons(tree?.root);
    expect(buttons.length).toBe(2);

    // Click first session card to expand it
    await act(async () => {
      buttons[0].props.onClick();
    });
    await flush();

    // Now s-1's XTerminal should be mounted
    terminals = findAllByTestId(tree?.root, /^xterminal-/);
    expect(terminals.length).toBe(1);
    expect(findByTestId(tree?.root, "xterminal-s-1")).not.toBeNull();

    // Toggle s-2 open
    await act(async () => {
      buttons[1].props.onClick();
    });
    await flush();

    // Both should be mounted (s-1 hidden, s-2 active)
    terminals = findAllByTestId(tree?.root, /^xterminal-/);
    expect(terminals.length).toBe(2);
    expect(findByTestId(tree?.root, "xterminal-s-1")).not.toBeNull();
    expect(findByTestId(tree?.root, "xterminal-s-2")).not.toBeNull();
  });

  it("hidden terminals render with height: 0", async () => {
    const sessions = [createSession("s-1"), createSession("s-2")];

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(CodingAgentsSection, { sessions }),
      );
    });

    const buttons = sessionCardButtons(tree?.root);

    // Open s-1
    await act(async () => {
      buttons[0].props.onClick();
    });
    await flush();

    // Open s-2 (s-1 becomes hidden)
    await act(async () => {
      buttons[1].props.onClick();
    });
    await flush();

    // Find the wrapper divs with height style
    const wrapperDivs = tree?.root.findAll(
      (node) =>
        node.type === "div" &&
        node.props.style &&
        typeof node.props.style.height === "number",
    );

    // Should have two wrappers: one at height 0 (s-1), one at height 300 (s-2)
    expect(wrapperDivs.length).toBe(2);
    const heights = wrapperDivs.map((d) => d.props.style.height as number);
    expect(heights).toContain(0);
    expect(heights).toContain(300);
  });

  it("stale sessions are cleaned from mountedSessions when removed from props", async () => {
    const session1 = createSession("s-1");
    const session2 = createSession("s-2");

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(
        React.createElement(CodingAgentsSection, {
          sessions: [session1, session2],
        }),
      );
    });

    const buttons = sessionCardButtons(tree?.root);

    // Open both terminals
    await act(async () => {
      buttons[0].props.onClick();
    });
    await flush();
    await act(async () => {
      buttons[1].props.onClick();
    });
    await flush();

    // Both should be mounted
    let terminals = findAllByTestId(tree?.root, /^xterminal-/);
    expect(terminals.length).toBe(2);

    // Remove s-1 from sessions (simulating task completion)
    await act(async () => {
      tree.update(
        React.createElement(CodingAgentsSection, { sessions: [session2] }),
      );
    });
    await flush();

    // s-1's terminal should be cleaned up, only s-2 remains
    terminals = findAllByTestId(tree?.root, /^xterminal-/);
    expect(terminals.length).toBe(1);
    expect(findByTestId(tree?.root, "xterminal-s-2")).not.toBeNull();
    expect(findByTestId(tree?.root, "xterminal-s-1")).toBeNull();
  });
});
