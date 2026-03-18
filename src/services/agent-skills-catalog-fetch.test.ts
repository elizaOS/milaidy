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
    ]);

    expect(first).toEqual([]);
    expect(second).toEqual([]);
    // Concurrent forceRefresh calls are coalesced into a single fetch
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // @2.0.0-alpha.11 silently handles 429 without logger.info —
    // the rate-limit logging was removed upstream
    expect(logger.warn).not.toHaveBeenCalled();

    // Third call within cooldown should not trigger another fetch
    await expect(service.getCatalog({ forceRefresh: true })).resolves.toEqual(
      [],
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
