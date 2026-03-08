import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  shouldFireAlert,
  buildAlertEvent,
  processAlerts,
} from "./hook-bridge";
import type { AlertRule, TokenCandidate, DexPairSnapshot, RiskProfile } from "./types";

// Mock the hooks registry
vi.mock("../../hooks/registry", () => ({
  createHookEvent: vi.fn((type, action, sessionKey, context) => ({
    type,
    action,
    sessionKey,
    timestamp: new Date(),
    messages: [],
    context,
  })),
  triggerHook: vi.fn(async () => {}),
}));

vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

function makePair(overrides: Partial<DexPairSnapshot> = {}): DexPairSnapshot {
  return {
    chainId: "solana",
    dexId: "raydium",
    pairAddress: "abc",
    pairUrl: "https://dexscreener.com/solana/abc",
    baseAddress: "token1",
    baseSymbol: "HOT",
    baseName: "HotToken",
    quoteSymbol: "SOL",
    priceUsd: 0.01,
    volumeH24: 500_000,
    volumeH6: 100_000,
    volumeH1: 30_000,
    volumeM5: 5000,
    buysH1: 200,
    sellsH1: 100,
    buysH24: 3000,
    sellsH24: 2000,
    priceChangeH1: 10,
    priceChangeH24: 25,
    liquidityUsd: 150_000,
    marketCap: 1_000_000,
    fdv: 2_000_000,
    pairCreatedAtMs: Date.now() - 6 * 3_600_000,
    raw: {},
    ...overrides,
  };
}

function makeCandidate(overrides: Partial<TokenCandidate> = {}): TokenCandidate {
  return {
    pair: makePair(),
    score: 82,
    boostTotal: 100,
    boostCount: 3,
    hasProfile: true,
    discovery: "top-boosts",
    tags: ["momentum", "buy-pressure"],
    risk: { score: 90, penalty: 0, flags: [] },
    ...overrides,
  };
}

function makeRule(overrides: Partial<AlertRule> = {}): AlertRule {
  return {
    id: "rule-1",
    name: "Test Alert",
    enabled: true,
    minScore: 75,
    cooldownSeconds: 900,
    chains: [],
    channels: ["hook", "log"],
    requiredTags: [],
    blockedRiskFlags: [],
    autoHook: true,
    hookAction: "dexscreener:alert",
    ...overrides,
  };
}

describe("shouldFireAlert", () => {
  it("fires for candidates above min score", () => {
    const result = shouldFireAlert(makeRule(), [makeCandidate()]);
    expect(result.fire).toBe(true);
    expect(result.reason).toBe("ok");
  });

  it("does not fire when disabled", () => {
    const result = shouldFireAlert(
      makeRule({ enabled: false }),
      [makeCandidate()],
    );
    expect(result.fire).toBe(false);
    expect(result.reason).toBe("rule-disabled");
  });

  it("does not fire below min score", () => {
    const result = shouldFireAlert(
      makeRule({ minScore: 90 }),
      [makeCandidate({ score: 80 })],
    );
    expect(result.fire).toBe(false);
    expect(result.reason).toBe("no-matches");
  });

  it("filters by chain", () => {
    const result = shouldFireAlert(
      makeRule({ chains: ["base"] }),
      [makeCandidate({ pair: makePair({ chainId: "solana" }) })],
    );
    expect(result.fire).toBe(false);
    expect(result.reason).toBe("no-matches");
  });

  it("fires when chain matches", () => {
    const result = shouldFireAlert(
      makeRule({ chains: ["solana"] }),
      [makeCandidate()],
    );
    expect(result.fire).toBe(true);
  });

  it("requires at least one matching tag when requiredTags set", () => {
    const result = shouldFireAlert(
      makeRule({ requiredTags: ["high-volume"] }),
      [makeCandidate({ tags: ["momentum"] })],
    );
    expect(result.fire).toBe(false);
    expect(result.reason).toBe("no-tag-match");
  });

  it("fires when required tag matches", () => {
    const result = shouldFireAlert(
      makeRule({ requiredTags: ["momentum"] }),
      [makeCandidate({ tags: ["momentum", "buy-pressure"] })],
    );
    expect(result.fire).toBe(true);
  });

  it("blocks candidates with blocked risk flags", () => {
    const result = shouldFireAlert(
      makeRule({ blockedRiskFlags: ["low-liquidity"] }),
      [
        makeCandidate({
          risk: { score: 70, penalty: 5, flags: ["low-liquidity"] },
        }),
      ],
    );
    expect(result.fire).toBe(false);
    expect(result.reason).toBe("blocked-by-risk");
  });

  it("respects cooldown", () => {
    const result = shouldFireAlert(
      makeRule({
        cooldownSeconds: 900,
        lastAlertAt: new Date(Date.now() - 60_000).toISOString(), // 1 min ago
      }),
      [makeCandidate()],
    );
    expect(result.fire).toBe(false);
    expect(result.reason).toBe("cooldown");
  });

  it("fires after cooldown expires", () => {
    const result = shouldFireAlert(
      makeRule({
        cooldownSeconds: 60,
        lastAlertAt: new Date(Date.now() - 120_000).toISOString(), // 2 min ago
      }),
      [makeCandidate()],
    );
    expect(result.fire).toBe(true);
  });
});

describe("buildAlertEvent", () => {
  it("builds structured alert event", () => {
    const event = buildAlertEvent(makeRule(), [makeCandidate()]);
    expect(event.ruleId).toBe("rule-1");
    expect(event.ruleName).toBe("Test Alert");
    expect(event.candidates).toHaveLength(1);
    expect(event.topCandidate).not.toBeNull();
    expect(event.topCandidate?.token).toBe("HOT");
    expect(event.topCandidate?.score).toBe(82);
  });

  it("caps candidates at 5", () => {
    const candidates = Array.from({ length: 10 }, () => makeCandidate());
    const event = buildAlertEvent(makeRule(), candidates);
    expect(event.candidates).toHaveLength(5);
  });

  it("handles empty candidates", () => {
    const event = buildAlertEvent(makeRule(), []);
    expect(event.topCandidate).toBeNull();
    expect(event.candidates).toHaveLength(0);
  });
});

describe("processAlerts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("processes rules and returns results", async () => {
    const { triggerHook } = await import("../../hooks/registry");
    const result = await processAlerts(
      [makeRule()],
      [makeCandidate()],
    );
    expect(result.firedCount).toBe(1);
    expect(result.results[0].fired).toBe(true);
    expect(result.updatedRules[0].lastAlertAt).toBeDefined();
    expect(triggerHook).toHaveBeenCalled();
  });

  it("skips disabled rules", async () => {
    const result = await processAlerts(
      [makeRule({ enabled: false })],
      [makeCandidate()],
    );
    expect(result.firedCount).toBe(0);
    expect(result.results[0].fired).toBe(false);
  });

  it("handles multiple rules", async () => {
    const result = await processAlerts(
      [
        makeRule({ id: "r1", name: "Rule 1", minScore: 75 }),
        makeRule({ id: "r2", name: "Rule 2", minScore: 90 }),
      ],
      [makeCandidate({ score: 82 })],
    );
    expect(result.firedCount).toBe(1);
    expect(result.results[0].fired).toBe(true); // 82 >= 75
    expect(result.results[1].fired).toBe(false); // 82 < 90
  });
});
