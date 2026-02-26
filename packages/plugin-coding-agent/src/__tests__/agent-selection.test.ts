/**
 * Agent selection algorithm tests
 */

import { describe, expect, it } from "bun:test";
import {
  computeAgentScore,
  selectAgentType,
} from "../services/agent-selection.js";

describe("computeAgentScore", () => {
  it("returns 0.5 for undefined metrics (cold start)", () => {
    expect(computeAgentScore(undefined)).toBe(0.5);
  });

  it("returns 0.5 when spawned is 0", () => {
    expect(
      computeAgentScore({
        spawned: 0,
        completed: 0,
        stallCount: 0,
        avgCompletionMs: 0,
      }),
    ).toBe(0.5);
  });

  it("scores higher for agents with better success rate", () => {
    const good = computeAgentScore({
      spawned: 10,
      completed: 9,
      stallCount: 0,
      avgCompletionMs: 30_000,
    });
    const bad = computeAgentScore({
      spawned: 10,
      completed: 3,
      stallCount: 0,
      avgCompletionMs: 30_000,
    });
    expect(good).toBeGreaterThan(bad);
  });

  it("penalizes stalls", () => {
    const noStalls = computeAgentScore({
      spawned: 10,
      completed: 8,
      stallCount: 0,
      avgCompletionMs: 30_000,
    });
    const manyStalls = computeAgentScore({
      spawned: 10,
      completed: 8,
      stallCount: 8,
      avgCompletionMs: 30_000,
    });
    expect(noStalls).toBeGreaterThan(manyStalls);
  });

  it("blends toward neutral with low sample count", () => {
    // With only 1 spawn, volume weight is 0.2, so 80% comes from neutral 0.5
    const oneSpawn = computeAgentScore({
      spawned: 1,
      completed: 1,
      stallCount: 0,
      avgCompletionMs: 10_000,
    });
    // Should be close to 0.5, not close to 1.0
    expect(oneSpawn).toBeGreaterThan(0.45);
    expect(oneSpawn).toBeLessThan(0.65);
  });

  it("applies weak speed penalty for slow agents", () => {
    const fast = computeAgentScore({
      spawned: 10,
      completed: 10,
      stallCount: 0,
      avgCompletionMs: 10_000,
    });
    const slow = computeAgentScore({
      spawned: 10,
      completed: 10,
      stallCount: 0,
      avgCompletionMs: 300_000,
    });
    expect(fast).toBeGreaterThan(slow);
    // Speed penalty is capped at 0.1
    expect(fast - slow).toBeLessThanOrEqual(0.1);
  });

  it("never returns negative", () => {
    const worst = computeAgentScore({
      spawned: 10,
      completed: 0,
      stallCount: 10,
      avgCompletionMs: 600_000,
    });
    expect(worst).toBeGreaterThanOrEqual(0);
  });
});

describe("selectAgentType", () => {
  it("returns fixedAgentType in fixed mode", () => {
    const result = selectAgentType({
      config: { strategy: "fixed", fixedAgentType: "gemini" },
      metrics: {},
      installedAgents: [],
    });
    expect(result).toBe("gemini");
  });

  it("falls back to fixedAgentType in ranked mode when nothing is installed", () => {
    const result = selectAgentType({
      config: { strategy: "ranked", fixedAgentType: "codex" },
      metrics: {},
      installedAgents: [
        {
          adapter: "claude",
          installed: false,
          installCommand: "",
          docsUrl: "",
        },
      ],
    });
    expect(result).toBe("codex");
  });

  it("returns the best-scoring installed agent in ranked mode", () => {
    const result = selectAgentType({
      config: { strategy: "ranked", fixedAgentType: "claude" },
      metrics: {
        claude: {
          spawned: 10,
          completed: 3,
          stallCount: 5,
          avgCompletionMs: 200_000,
        },
        gemini: {
          spawned: 10,
          completed: 9,
          stallCount: 1,
          avgCompletionMs: 30_000,
        },
      },
      installedAgents: [
        {
          adapter: "claude",
          installed: true,
          installCommand: "",
          docsUrl: "",
        },
        {
          adapter: "gemini",
          installed: true,
          installCommand: "",
          docsUrl: "",
        },
      ],
    });
    expect(result).toBe("gemini");
  });

  it("skips agents that are not installed", () => {
    const result = selectAgentType({
      config: { strategy: "ranked", fixedAgentType: "claude" },
      metrics: {
        gemini: {
          spawned: 10,
          completed: 10,
          stallCount: 0,
          avgCompletionMs: 1_000,
        },
      },
      installedAgents: [
        {
          adapter: "claude",
          installed: true,
          installCommand: "",
          docsUrl: "",
        },
        {
          adapter: "gemini",
          installed: false,
          installCommand: "",
          docsUrl: "",
        },
      ],
    });
    // Gemini has better metrics but isn't installed
    expect(result).toBe("claude");
  });

  it("returns claude by default order when all scores are tied", () => {
    const result = selectAgentType({
      config: { strategy: "ranked", fixedAgentType: "aider" },
      metrics: {},
      installedAgents: [
        {
          adapter: "claude",
          installed: true,
          installCommand: "",
          docsUrl: "",
        },
        {
          adapter: "gemini",
          installed: true,
          installCommand: "",
          docsUrl: "",
        },
        {
          adapter: "codex",
          installed: true,
          installCommand: "",
          docsUrl: "",
        },
      ],
    });
    // All have score 0.5 — claude is first in DEFAULT_ORDER
    expect(result).toBe("claude");
  });
});
