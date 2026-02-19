import { describe, expect, it } from "vitest";
import {
  classifyCoreIntents,
  isLowContextInput,
  normalizeComponentName,
  resolveComponentTarget,
  type IntentComponent,
} from "./intent-engine.js";

const components: IntentComponent[] = [
  {
    id: "openai",
    name: "OpenAI",
    category: "ai-provider",
    parameters: [{ key: "OPENAI_API_KEY" }],
  },
  {
    id: "discord",
    name: "Discord",
    category: "connector",
    parameters: [
      { key: "DISCORD_API_TOKEN" },
      { key: "DISCORD_APPLICATION_ID" },
    ],
  },
  {
    id: "polymarket",
    name: "Polymarket",
    category: "connector",
    parameters: [{ key: "POLYMARKET_PRIVATE_KEY" }],
  },
];

describe("intent-engine: classifyCoreIntents", () => {
  it("detects mixed greeting + capability asks", () => {
    const f = classifyCoreIntents("hey there, what do you do");
    expect(f.isGenericOpener).toBe(true);
    expect(f.capabilityIntent).toBe(true);
  });

  it("detects enabled-tools safety review asks", () => {
    const f = classifyCoreIntents(
      "Review my enabled tools and suggest safer defaults.",
    );
    expect(f.toolSafetyReviewIntent).toBe(true);
  });

  it("detects platform/agent workflow wording", () => {
    const a = classifyCoreIntents("i want to first understand this agent");
    const b = classifyCoreIntents("explain the workflow");
    expect(a.agentOverviewIntent).toBe(true);
    expect(b.workflowExplainIntent).toBe(true);
  });

  it("detects in-app security and trade-app intents", () => {
    const a = classifyCoreIntents("where do i find confirmations and limits");
    const b = classifyCoreIntents("what apps can you use to trade/bet");
    expect(a.securityControlsIntent).toBe(true);
    expect(b.inAppTradeBetAppsIntent).toBe(true);
  });

  it("detects broad post-setup execution variants", () => {
    const variants = [
      "okay when setup then what",
      "how do you execute when ive set it up",
      "once configured how do you run actions",
      "after setup how do you carry out tasks",
      "then how do you trigger execution after enabled",
    ];
    for (const text of variants) {
      expect(classifyCoreIntents(text).postSetupExecutionIntent).toBe(true);
    }
  });

  it("detects broad next-step variants", () => {
    const variants = [
      "then what",
      "what next",
      "next step",
      "what now",
      "after that",
      "and then",
      "now what",
      "what happens next",
      "then how",
      "what after",
      "then",
      "next",
    ];
    for (const text of variants) {
      expect(classifyCoreIntents(text).nextStepIntent).toBe(true);
    }
  });

  it("detects setup-no-target variants", () => {
    const variants = [
      "setup",
      "set up",
      "configure this",
      "connect it",
      "enable please",
      "install it",
      "plug in provider",
    ];
    for (const text of variants) {
      expect(classifyCoreIntents(text).setupNoTargetIntent).toBe(true);
    }
  });

  it("does not misclassify planning asks that contain 'set up' wording", () => {
    const f = classifyCoreIntents(
      "set up a 5 step plan to get wealthier through crypto",
    );
    expect(f.setupNoTargetIntent).toBe(false);
    expect(f.planningAdviceIntent).toBe(true);
  });

  it("does not misclassify markets/apps action-plan asks as setup", () => {
    const f = classifyCoreIntents(
      "Set up my next action plan for markets and apps.",
    );
    expect(f.setupNoTargetIntent).toBe(false);
  });

  it("detects crypto trading advice intent", () => {
    const f = classifyCoreIntents("im asking for crypto trading advice");
    expect(f.planningAdviceIntent).toBe(true);
  });

  it("detects degen slang as planning/trading intent", () => {
    const f = classifyCoreIntents("should i ape full port into memes or nah");
    expect(f.planningAdviceIntent).toBe(true);
  });
});

describe("intent-engine: isLowContextInput", () => {
  it("treats plain short text as low context", () => {
    expect(
      isLowContextInput("do it", {
        agentOverviewIntent: false,
        workflowExplainIntent: false,
      }),
    ).toBe(true);
  });

  it("does not classify platform/workflow asks as low context", () => {
    expect(
      isLowContextInput("understand this platform", {
        agentOverviewIntent: true,
        workflowExplainIntent: false,
      }),
    ).toBe(false);
  });

  it("does not classify crypto advice asks as low context", () => {
    expect(
      isLowContextInput("im asking for crypto trading advice", {
        agentOverviewIntent: false,
        workflowExplainIntent: false,
      }),
    ).toBe(false);
  });

  it("does not classify degen slang asks as low context", () => {
    expect(
      isLowContextInput("im rekt should i ape back in", {
        agentOverviewIntent: false,
        workflowExplainIntent: false,
      }),
    ).toBe(false);
  });

  it("does not classify 'poly market prediction markets' as low context", () => {
    expect(
      isLowContextInput("poly market prediction markets", {
        agentOverviewIntent: false,
        workflowExplainIntent: false,
      }),
    ).toBe(false);
  });
});

describe("intent-engine: resolveComponentTarget", () => {
  it("resolves by direct name/id", () => {
    const t = resolveComponentTarget("how do i use discord", components);
    expect(t?.id).toBe("discord");
  });

  it("resolves by typo/alias", () => {
    const t = resolveComponentTarget(
      "lets spin up a polymarketbet",
      components,
    );
    expect(t?.id).toBe("polymarket");
  });

  it("resolves by config key mention", () => {
    const t = resolveComponentTarget(
      "i dont know how to get DISCORD_API_TOKEN",
      components,
    );
    expect(t?.id).toBe("discord");
  });

  it("resolves by recent setup context", () => {
    const t = resolveComponentTarget(
      "how does it work",
      components,
      "Discord setup — quickest path:",
    );
    expect(t?.id).toBe("discord");
  });
});

describe("intent-engine: normalizeComponentName", () => {
  it("normalizes known casing", () => {
    expect(normalizeComponentName("openai")).toBe("OpenAI");
    expect(normalizeComponentName("xai")).toBe("xAI");
  });
});
