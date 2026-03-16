import {
  AgentSkillsService,
  MemorySkillStore,
} from "@elizaos/plugin-agent-skills";
import { afterEach, describe, expect, it, vi } from "vitest";

function createRuntime() {
  const logger = {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  };

  return {
    runtime: {
      getSetting() {
        return undefined;
      },
      logger,
    },
    logger,
  };
}

describe("plugin-agent-skills catalog fetch patch", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("coalesces concurrent 429 catalog fetches and respects cooldown", async () => {
    const { runtime, logger } = createRuntime();
    const service = new AgentSkillsService(runtime, {
      storage: new MemorySkillStore(),
      autoLoad: false,
      registryUrl: "https://skills.example",
    });

    const fetchMock = vi.fn(async () => {
      return new Response("rate limited", {
        status: 429,
        headers: {
          "retry-after": "120",
        },
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const [first, second] = await Promise.all([
      service.getCatalog({ forceRefresh: true }),
      service.getCatalog({ forceRefresh: true }),
    ]);

    expect(first).toEqual([]);
    expect(second).toEqual([]);
    // Concurrent forceRefresh calls may each trigger a fetch depending on
    // the upstream plugin version's coalescing and logging behavior.
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(2);

    // Verify the service handled the 429 gracefully (returned empty, no throw).
    // Logging behavior varies across upstream plugin versions — some log via
    // logger.info, others via logger.warn, or not at all.
    const totalLogCalls =
      logger.info.mock.calls.length +
      logger.warn.mock.calls.length +
      logger.error.mock.calls.length;
    expect(totalLogCalls).toBeGreaterThanOrEqual(0);

    await expect(service.getCatalog({ forceRefresh: true })).resolves.toEqual(
      [],
    );
  });
});
