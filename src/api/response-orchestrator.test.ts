import { describe, expect, it } from "vitest";
import {
  orchestrateUniversalReply,
  pickActiveGoal,
  type OrchestratorPlugin,
} from "./response-orchestrator.js";

const plugins: OrchestratorPlugin[] = [
  {
    id: "openai",
    name: "OpenAI",
    category: "ai-provider",
    enabled: true,
    configured: true,
    validationErrors: [],
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

describe("response-orchestrator: active goal", () => {
  it("ignores filler/ack turns when selecting active goal", () => {
    const goal = pickActiveGoal([
      { user: "i wan tto sping up a poly market bet", assistant: "..." },
      { user: "thanks", assistant: "..." },
      { user: "yes continue", assistant: "..." },
    ]);
    expect(goal.toLowerCase()).toContain("poly market bet");
  });
});

describe("response-orchestrator: dead-end prevention", () => {
  it("acknowledges thanks naturally (not one-line-goal fallback)", () => {
    const reply = orchestrateUniversalReply({
      userText: "thanks",
      turns: [{ user: "i wan tto sping up a poly market bet", assistant: "..." }],
      plugins,
      username: "@remilia",
      walletConnected: true,
    });
    expect(reply).toBeTruthy();
    expect(reply?.toLowerCase()).toContain("anytime");
    expect(reply?.toLowerCase()).not.toContain("goal in one line");
  });

  it("handles help me conversationally", () => {
    const reply = orchestrateUniversalReply({
      userText: "help me",
      turns: [{ user: "i wan tto sping up a poly market bet", assistant: "..." }],
      plugins,
      username: "@remilia",
      walletConnected: true,
    });
    expect(reply).toBeTruthy();
    expect(reply?.toLowerCase()).toContain("continue");
    expect(reply?.toLowerCase()).not.toContain("goal in one line");
  });

  it("routes planning advice even when text includes set up", () => {
    const reply = orchestrateUniversalReply({
      userText: "set up a 5 step plan to get wealthier through crypto",
      turns: [],
      plugins,
      username: "@remilia",
      walletConnected: true,
    });
    expect(reply).toBeTruthy();
    expect(reply?.toLowerCase()).toContain("risk-aware plan");
  });

  it("routes degen slang to planning advice", () => {
    const reply = orchestrateUniversalReply({
      userText: "should i ape full port into memes right now",
      turns: [],
      plugins,
      username: "@remilia",
      walletConnected: true,
    });
    expect(reply).toBeTruthy();
    expect(reply?.toLowerCase()).toContain("risk-aware plan");
  });

  it("answers automation scope questions with concrete capacity guidance", () => {
    const reply = orchestrateUniversalReply({
      userText: "how much can i automate at one time with app integrations",
      turns: [],
      plugins,
      username: "@remilia",
      walletConnected: true,
    });
    expect(reply).toBeTruthy();
    expect(reply?.toLowerCase()).toContain("multi-step workflows");
    expect(reply?.toLowerCase()).toContain("markets & apps");
  });

  it("routes 'set up my next action plan for markets and apps' to planning, not setup", () => {
    const reply = orchestrateUniversalReply({
      userText: "Set up my next action plan for markets and apps.",
      turns: [],
      plugins,
      username: "@remilia",
      walletConnected: true,
    });
    expect(reply).toBeTruthy();
    expect(reply?.toLowerCase()).toContain("next action plan for markets & apps");
    expect(reply?.toLowerCase()).not.toContain("i can route setup immediately");
  });

  it("explains polymarket execution workflow instead of only setup blocking", () => {
    const reply = orchestrateUniversalReply({
      userText:
        "i want to know how you execute the polymarkets on my behalf when i add my own plugin",
      turns: [],
      plugins,
      username: "@remilia",
      walletConnected: true,
    });
    expect(reply).toBeTruthy();
    expect(reply?.toLowerCase()).toContain("execution flow");
    expect(reply?.toLowerCase()).toContain("you give market, outcome, and amount");
    expect(reply?.toLowerCase()).toContain("status now");
  });

  it("normalizes provider naming in social replies", () => {
    const reply = orchestrateUniversalReply({
      userText: "hey",
      turns: [],
      plugins: [
        {
          id: "openai",
          name: "Openai",
          category: "ai-provider",
          enabled: true,
          configured: true,
          validationErrors: [],
        },
      ],
      username: "@remilia",
      walletConnected: true,
    });
    expect(reply).toBeTruthy();
    expect(reply).toContain("OpenAI");
    expect(reply).not.toContain("Openai");
  });

  it("treats hey/how are you as social (not platform explainer)", () => {
    const reply = orchestrateUniversalReply({
      userText: "hey milaidy how are you",
      turns: [],
      plugins,
      username: "@remilia",
      walletConnected: true,
    });
    expect(reply).toBeTruthy();
    expect(reply?.toLowerCase()).toContain("i’m good");
    expect(reply?.toLowerCase()).not.toContain("agent workspace");
    expect(reply?.toLowerCase()).not.toContain("run first");
  });

  it("treats 'whats good' as social, not low-context fallback", () => {
    const reply = orchestrateUniversalReply({
      userText: "whats good",
      turns: [],
      plugins,
      username: "@remilia",
      walletConnected: true,
    });
    expect(reply).toBeTruthy();
    expect(reply?.toLowerCase()).not.toContain("goal in one line");
  });

  it("answers identity-style social asks directly, not capability boilerplate", () => {
    const reply = orchestrateUniversalReply({
      userText: "hey my lady, are you milady?",
      turns: [],
      plugins,
      username: "@remilia",
      walletConnected: true,
    });
    expect(reply).toBeTruthy();
    expect(reply?.toLowerCase()).toContain("milaidy");
    expect(reply?.toLowerCase()).not.toContain("ready to go");
    expect(reply?.toLowerCase()).not.toContain("what are we solving today");
  });

  it("does not collapse mixed 'thanks + new request' into generic help", () => {
    const reply = orchestrateUniversalReply({
      userText:
        "thanks for the help but i want to talk about hot polymarket markets rn",
      turns: [],
      plugins,
      username: "@remilia",
      walletConnected: true,
    });
    expect(reply === null || !reply.toLowerCase().includes("happy to help")).toBe(
      true,
    );
  });

  it("does not force execution blocker for hot polymarket intel asks", () => {
    const reply = orchestrateUniversalReply({
      userText: "hot poly markets to bet on rn and why",
      turns: [],
      plugins,
      username: "@remilia",
      walletConnected: true,
    });
    expect(reply).toBeNull();
  });

  it("answers setup-complete capability asks without current setup blocker", () => {
    const reply = orchestrateUniversalReply({
      userText: "when setup is complete what can you bet on",
      turns: [],
      plugins,
      username: "@remilia",
      walletConnected: true,
    });
    expect(reply).toBeTruthy();
    expect(reply?.toLowerCase()).toContain("once setup is complete");
    expect(reply?.toLowerCase()).not.toContain("currently blocked by setup");
  });
});
