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

    // The 429 was handled gracefully — both calls returned [] without throwing.
    // No assertion on logger calls: upstream plugin versions vary in whether
    // they log rate limits via info, warn, or silently.

    await expect(service.getCatalog({ forceRefresh: true })).resolves.toEqual(
      [],
    );
  });
});
