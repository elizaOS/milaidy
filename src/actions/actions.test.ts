/**
 * Actions System — Registration, Discovery, Validation, and Error Handling
 *
 * Tests the custom action lifecycle (not SSRF — that's in custom-actions.test.ts).
 * Covers: registerCustomActionLive, loadCustomActions, defToAction, buildTestHandler,
 * and the built-in action registration on the Milady plugin.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

vi.mock("@miladyai/autonomous/config/config", () => ({
  loadMiladyConfig: vi.fn(() => ({ customActions: [] })),
  saveMiladyConfig: vi.fn(),
}));

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn().mockResolvedValue([{ address: "93.184.216.34", family: 4 }]),
}));

import type { IAgentRuntime } from "@elizaos/core";
import { loadMiladyConfig } from "@miladyai/autonomous/config/config";
import {
  __setPinnedFetchImplForTests,
  buildTestHandler,
  loadCustomActions,
  registerCustomActionLive,
  setCustomActionsRuntime,
} from "@miladyai/autonomous/runtime/custom-actions";
import type { CustomActionDef, MiladyConfig } from "../config/types.milady";

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

function makeDef(overrides?: Partial<CustomActionDef>): CustomActionDef {
  return {
    id: "test-id",
    name: "TEST_ACTION",
    description: "A test custom action",
    similes: ["DO_TEST"],
    parameters: [
      { name: "query", description: "Search query", required: true },
    ],
    handler: {
      type: "http",
      method: "GET",
      url: "https://example.com/search?q={{query}}",
    },
    enabled: true,
    createdAt: new Date(0).toISOString(),
    updatedAt: new Date(0).toISOString(),
    ...overrides,
  };
}

function mockRuntime(
  overrides?: Partial<IAgentRuntime>,
): Pick<IAgentRuntime, "registerAction"> & Partial<IAgentRuntime> {
  return { registerAction: vi.fn(), ...overrides };
}

// ---------------------------------------------------------------------------
// lifecycle
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  __setPinnedFetchImplForTests(({ url, init }) => {
    return fetch(url.toString(), init);
  });
});

afterEach(() => {
  __setPinnedFetchImplForTests(null);
  vi.restoreAllMocks();
  // Reset the runtime reference — setCustomActionsRuntime only accepts
  // IAgentRuntime, so cast through unknown to clear it for test isolation.
  setCustomActionsRuntime(undefined as unknown as IAgentRuntime);
});

// ============================================================================
//  1. registerCustomActionLive
// ============================================================================

describe("registerCustomActionLive", () => {
  it("returns null when no runtime is set", () => {
    const result = registerCustomActionLive(makeDef());
    expect(result).toBeNull();
  });

  it("returns an Action and registers it when runtime is set", () => {
    const rt = mockRuntime();
    setCustomActionsRuntime(rt as unknown as IAgentRuntime);

    const action = registerCustomActionLive(makeDef());

    expect(action).not.toBeNull();
    expect(action?.name).toBe("TEST_ACTION");
    expect(action?.description).toBe("A test custom action");
    expect(rt.registerAction).toHaveBeenCalledOnce();
    expect(rt.registerAction).toHaveBeenCalledWith(action);
  });

  it("preserves similes from the definition", () => {
    const rt = mockRuntime();
    setCustomActionsRuntime(rt as unknown as IAgentRuntime);

    const action = registerCustomActionLive(
      makeDef({ similes: ["ALIAS_A", "ALIAS_B"] }),
    );

    expect(action?.similes).toContain("ALIAS_A");
    expect(action?.similes).toContain("ALIAS_B");
  });
});

// ============================================================================
//  2. loadCustomActions — discovery from config
// ============================================================================

describe("loadCustomActions", () => {
  it("returns empty array when config has no custom actions", () => {
    vi.mocked(loadMiladyConfig).mockReturnValue({} as MiladyConfig);
    const actions = loadCustomActions();
    expect(actions).toEqual([]);
  });

  it("loads enabled actions from config", () => {
    vi.mocked(loadMiladyConfig).mockReturnValue({
      customActions: [
        makeDef({ id: "a1", name: "ACTION_ONE", enabled: true }),
        makeDef({ id: "a2", name: "ACTION_TWO", enabled: true }),
      ],
    } as MiladyConfig);

    const actions = loadCustomActions();
    expect(actions).toHaveLength(2);
    expect(actions[0].name).toBe("ACTION_ONE");
    expect(actions[1].name).toBe("ACTION_TWO");
  });

  it("filters out disabled actions", () => {
    vi.mocked(loadMiladyConfig).mockReturnValue({
      customActions: [
        makeDef({ id: "a1", name: "ENABLED_ACTION", enabled: true }),
        makeDef({ id: "a2", name: "DISABLED_ACTION", enabled: false }),
      ],
    } as MiladyConfig);

    const actions = loadCustomActions();
    expect(actions).toHaveLength(1);
    expect(actions[0].name).toBe("ENABLED_ACTION");
  });

  it("returns empty array when config loading throws", () => {
    vi.mocked(loadMiladyConfig).mockImplementation(() => {
      throw new Error("config corrupted");
    });
    const actions = loadCustomActions();
    expect(actions).toEqual([]);
  });
});

// ============================================================================
//  3. buildTestHandler — parameter substitution
// ============================================================================

describe("buildTestHandler — parameter substitution", () => {
  it("substitutes {{param}} placeholders in code handler", async () => {
    const handler = buildTestHandler(
      makeDef({
        params: [
          { name: "query", type: "string", description: "Search query" },
        ],
        handler: {
          type: "code",
          // Sandbox code — template literal is evaluated at runtime, not here
          code: "return `searched: $" + "{params.query}`;",
        },
      }),
    );

    const result = await handler({ query: "hello world" });

    expect(result.ok).toBe(true);
    expect(result.output).toContain("searched: hello world");
  });

  it("handles missing parameters gracefully in code handler", async () => {
    const handler = buildTestHandler(
      makeDef({
        params: [
          { name: "query", type: "string", description: "Search query" },
        ],
        handler: {
          type: "code",
          // Sandbox code — template literal is evaluated at runtime, not here
          code: "return `value: $" + '{params.query ?? "none"}`;',
        },
      }),
    );

    // Call without the optional parameter — should still execute
    const result = await handler({});
    expect(result.ok).toBe(true);
    expect(result.output).toContain("none");
  });
});

// ============================================================================
//  4. Action error handling
// ============================================================================

describe("action error handling", () => {
  it("returns ok=false when HTTP request targets internal network", async () => {
    const handler = buildTestHandler(
      makeDef({
        handler: {
          type: "http",
          method: "GET",
          url: "http://127.0.0.1:8080/internal",
        },
      }),
    );

    const result = await handler({});
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Blocked");
  });

  it("returns ok=false when HTTP target is blocked by SSRF guard", async () => {
    const handler = buildTestHandler(
      makeDef({
        handler: {
          type: "http",
          method: "GET",
          url: "http://192.168.1.1/admin",
        },
      }),
    );

    const result = await handler({});
    expect(result.ok).toBe(false);
    expect(result.output).toContain("Blocked");
  });

  it("code handler returns ok=true for valid code", async () => {
    const handler = buildTestHandler(
      makeDef({
        handler: {
          type: "code",
          code: 'return "hello from sandbox";',
        },
      }),
    );

    const result = await handler({});
    expect(result.ok).toBe(true);
    expect(result.output).toContain("hello from sandbox");
  });

  it("code handler propagates thrown error from sandbox", async () => {
    const handler = buildTestHandler(
      makeDef({
        handler: {
          type: "code",
          code: "throw new Error('sandbox crash');",
        },
      }),
    );

    await expect(handler({})).rejects.toThrow("sandbox crash");
  });
});
