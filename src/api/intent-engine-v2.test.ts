import { describe, expect, it } from "vitest";
import {
  buildCapabilityGraph,
  composeResponseV2,
  interpretIntentV2,
  type V2PluginSnapshot,
} from "./intent-engine-v2.js";

const plugins: V2PluginSnapshot[] = [
  {
    id: "openai",
    name: "OpenAI",
    category: "ai-provider",
    enabled: true,
    configured: true,
    validationErrors: [],
  },
  {
    id: "discord",
    name: "Discord",
    category: "connector",
    enabled: false,
    configured: false,
    validationErrors: [{ field: "DISCORD_API_TOKEN" }],
  },
  {
    id: "polymarket",
    name: "Polymarket",
    category: "connector",
    enabled: true,
    configured: false,
    validationErrors: [{ field: "POLYMARKET_PRIVATE_KEY" }],
  },
];

describe("intent-engine-v2: interpret", () => {
  it("classifies crypto planning advice without setup misroute", () => {
    const intent = interpretIntentV2(
      "set up a 5 step plan to get wealthier through crypto",
    );
    expect(intent.kind).toBe("planning_advice");
    expect(intent.confidence).toBeGreaterThan(0.8);
  });

  it("classifies direct trading advice asks", () => {
    const intent = interpretIntentV2("im asking for crypto trading advice");
    expect(intent.kind).toBe("planning_advice");
  });

  it("classifies markets/apps action-plan asks as markets_apps_plan", () => {
    const intent = interpretIntentV2(
      "Set up my next action plan for markets and apps.",
    );
    expect(intent.kind).toBe("markets_apps_plan");
  });

  it("classifies degen slang as planning advice", () => {
    const intent = interpretIntentV2("should i ape full port into meme coins");
    expect(intent.kind).toBe("planning_advice");
  });

  it("classifies gratitude as acknowledgement", () => {
    const intent = interpretIntentV2("thanks");
    expect(intent.kind).toBe("acknowledgement");
  });

  it("does not misclassify continuation when actionable request is included", () => {
    const intent = interpretIntentV2("continue and find bets about fed rates", {
      lastAssistantText: "Continuing from previous context.",
    });
    expect(intent.kind).not.toBe("continuation");
  });
});

describe("intent-engine-v2: capability graph", () => {
  it("builds readiness from plugin snapshots", () => {
    const graph = buildCapabilityGraph(plugins, true);
    expect(graph.providersReady).toContain("OpenAI");
    expect(graph.integrationsReady).toEqual([]);
    expect(graph.walletConnected).toBe(true);
    expect(graph.polymarketEnabled).toBe(true);
    expect(graph.polymarketReady).toBe(false);
  });
});

describe("intent-engine-v2: compose", () => {
  it("returns conversational planning reply for planning intent", () => {
    const graph = buildCapabilityGraph(plugins, true);
    const intent = interpretIntentV2("im asking for crypto trading advice");
    const reply = composeResponseV2(intent, graph, {
      username: "@remilia",
      priorGoal: null,
    });
    expect(reply).toBeTruthy();
    expect(reply?.toLowerCase()).toContain("plan");
    expect(reply?.toLowerCase()).toContain("risk");
  });

  it("returns concrete Markets & Apps action plan reply", () => {
    const graph = buildCapabilityGraph(plugins, true);
    const intent = interpretIntentV2(
      "Set up my next action plan for markets and apps.",
    );
    const reply = composeResponseV2(intent, graph, {
      username: "@remilia",
      priorGoal: null,
    });
    expect(reply).toBeTruthy();
    expect(reply?.toLowerCase()).toContain("next action plan for markets & apps");
    expect(reply?.toLowerCase()).toContain("smoke test");
  });

  it("returns natural acknowledgement reply for thanks", () => {
    const graph = buildCapabilityGraph(plugins, true);
    const intent = interpretIntentV2("thanks");
    const reply = composeResponseV2(intent, graph, {
      username: "@remilia",
      priorGoal: "i want to spin up a polymarket bet",
    });
    expect(reply).toBeTruthy();
    expect(reply?.toLowerCase()).toContain("anytime");
    expect(reply?.toLowerCase()).toContain("polymarket");
  });
});
