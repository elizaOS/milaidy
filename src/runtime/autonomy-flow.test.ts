import {
  AgentRuntime,
  ChannelType,
  type Content,
  type GenerateTextParams,
  type Memory,
  ModelType,
  type Plugin,
  stringToUuid,
  type UUID,
} from "@elizaos/core";
import { afterEach, describe, expect, it } from "vitest";

let hasSqlPlugin = false;
try {
  await import("@elizaos/plugin-sql");
  hasSqlPlugin = true;
} catch {
  // @elizaos/plugin-sql not installed — skip integration tests
}

type AutonomyTestState = {
  shouldRespondCalls: number;
  multiStepDecisionCalls: number;
};

type Harness = {
  runtime: AgentRuntime;
  roomId: UUID;
  userEntityId: UUID;
  state: AutonomyTestState;
};

const activeRuntimes: AgentRuntime[] = [];

function extractPrompt(
  input: GenerateTextParams | string | null | undefined,
): string {
  if (typeof input === "string") return input;
  if (input && typeof input === "object" && typeof input.prompt === "string") {
    return input.prompt;
  }
  return "";
}

function extractValidationFields(prompt: string): Record<string, string> {
  const fields: Record<string, string> = {};

  const inlineMatches = prompt.matchAll(
    /<(code_[A-Za-z0-9_-]+_(?:start|end)|one_(?:initial|middle|end)_code|two_(?:initial|middle|end)_code)>([\s\S]*?)<\/\1>/g,
  );
  for (const [, key, value] of inlineMatches) {
    fields[key] = value.trim();
  }

  const checkpointMatches = prompt.matchAll(
    /(second\s+)?(initial|middle|end)\s+code:\s*([a-f0-9-]{16,})/gi,
  );
  for (const [, second, stage, value] of checkpointMatches) {
    const prefix = second ? "two" : "one";
    fields[`${prefix}_${stage.toLowerCase()}_code`] = value.trim();
  }

  return fields;
}

function buildXmlResponse(
  prompt: string,
  fields: Record<string, string | undefined>,
): string {
  const withValidation = { ...fields, ...extractValidationFields(prompt) };
  const body = Object.entries(withValidation)
    .filter((entry): entry is [string, string] => {
      return typeof entry[1] === "string" && entry[1].length > 0;
    })
    .map(([key, value]) => `<${key}>${value}</${key}>`)
    .join("\n");
  return `<response>\n${body}\n</response>`;
}

function createAutonomyTestPlugin(state: AutonomyTestState): Plugin {
  const respond = (prompt: string): string => {
    if (prompt.includes("Decide on behalf of")) {
      state.shouldRespondCalls += 1;
      return buildXmlResponse(prompt, {
        name: "AutonomyTestAgent",
        reasoning: "Respond to continue workflow.",
        action: "RESPOND",
      });
    }

    if (prompt.includes("Determine the next step")) {
      state.multiStepDecisionCalls += 1;
      if (state.multiStepDecisionCalls === 1) {
        return buildXmlResponse(prompt, {
          thought: "Run one no-op action before finishing.",
          providers: "",
          action: "NONE",
          parameters: "{}",
          isFinish: "false",
        });
      }
      return buildXmlResponse(prompt, {
        thought: "Task is complete after one step.",
        providers: "",
        action: "",
        parameters: "{}",
        isFinish: "true",
      });
    }

    if (prompt.includes("Summarize what the assistant has done so far")) {
      return buildXmlResponse(prompt, {
        thought: "Summarizing completed autonomous workflow.",
        text: "Autonomy multi-step complete",
      });
    }

    if (prompt.includes("Generate dialog and actions for the character")) {
      return buildXmlResponse(prompt, {
        thought: "Process autonomous loop tick.",
        actions: "REPLY",
        providers: "",
        text: "Autonomy loop tick acknowledged",
      });
    }

    return buildXmlResponse(prompt, {
      thought: "Fallback response",
      actions: "REPLY",
      providers: "",
      text: "ok",
    });
  };

  return {
    name: "autonomy-flow-test-model",
    description: "Deterministic runtime model for autonomy flow tests",
    priority: 1000,
    models: {
      [ModelType.TEXT_SMALL]: async (_runtime, params) =>
        respond(extractPrompt(params)),
      [ModelType.TEXT_LARGE]: async (_runtime, params) =>
        respond(extractPrompt(params)),
      [ModelType.TEXT_EMBEDDING]: async () => {
        const vector = new Array(384).fill(0);
        vector[0] = 1;
        return vector;
      },
    },
  };
}

async function createHarness(): Promise<Harness> {
  const state: AutonomyTestState = {
    shouldRespondCalls: 0,
    multiStepDecisionCalls: 0,
  };
  const sqlPluginModule = (await import("@elizaos/plugin-sql")) as {
    default?: Plugin;
  };
  const sqlPlugin = sqlPluginModule.default as Plugin;
  if (!sqlPlugin) {
    throw new Error("@elizaos/plugin-sql default export was not found");
  }

  const runtime = new AgentRuntime({
    character: {
      name: "AutonomyTestAgent",
      bio: ["Deterministic autonomy flow test agent."],
      messageExamples: [],
      topics: [],
      adjectives: [],
      plugins: [],
      settings: {
        secrets: {},
      },
    },
    plugins: [sqlPlugin, createAutonomyTestPlugin(state)],
  });

  await runtime.initialize();
  activeRuntimes.push(runtime);

  const worldId = stringToUuid("autonomy-flow-test-world");
  const messageServerId = stringToUuid("autonomy-flow-test-message-server");
  const roomId = stringToUuid("autonomy-flow-test-room");
  const userEntityId = stringToUuid("autonomy-flow-test-user");

  await runtime.ensureWorldExists({
    id: worldId,
    name: "Autonomy Flow Test World",
    agentId: runtime.agentId,
    messageServerId,
    metadata: { type: "test" },
  });
  await runtime.ensureRoomExists({
    id: roomId,
    name: "autonomy-flow-room",
    source: "test",
    type: ChannelType.API,
    channelId: "autonomy-flow-test-room",
    messageServerId,
    worldId,
    metadata: { type: "test" },
  });
  await runtime.ensureConnection({
    entityId: userEntityId,
    roomId,
    worldId,
    userName: "Autonomy Test User",
    source: "test",
    channelId: "autonomy-flow-test-room",
    type: ChannelType.API,
    messageServerId,
    metadata: { type: "test" },
  });
  await runtime.ensureParticipantInRoom(runtime.agentId, roomId);

  return { runtime, roomId, userEntityId, state };
}

async function runMessage(
  harness: Harness,
  text: string,
  metadata?: Record<string, unknown>,
  options?: {
    useMultiStep?: boolean;
    maxMultiStepIterations?: number;
  },
) {
  const message: Memory = {
    id: stringToUuid(`autonomy-flow-msg:${Date.now()}:${Math.random()}`),
    entityId: harness.userEntityId,
    agentId: harness.runtime.agentId,
    roomId: harness.roomId,
    createdAt: Date.now(),
    content: {
      text,
      ...(metadata ? { metadata } : {}),
    },
  };

  const callback = async (_content: Content): Promise<Memory[]> => {
    return [];
  };

  return harness.runtime.messageService.handleMessage(
    harness.runtime,
    message,
    callback,
    options,
  );
}

afterEach(async () => {
  const runtimes = activeRuntimes.splice(0, activeRuntimes.length);
  for (const runtime of runtimes) {
    await runtime.stop();
  }
});

describe.skipIf(!hasSqlPlugin)("autonomy flow integration", () => {
  it("bypasses shouldRespond when message is marked autonomous loop tick", async () => {
    const harness = await createHarness();
    const result = await runMessage(
      harness,
      "loop tick: continue autonomous work",
      { isAutonomous: true, autonomyMode: "loop" },
      { useMultiStep: false },
    );

    expect(result.didRespond).toBe(true);
    expect(result.responseContent?.text).toBe(
      "Autonomy loop tick acknowledged",
    );
    expect(result.responseContent?.actions).toEqual(["REPLY"]);
    expect(harness.state.shouldRespondCalls).toBe(0);
  });

  it("continues multi-step processing and finishes with summary text", async () => {
    const harness = await createHarness();
    const result = await runMessage(
      harness,
      "Please run this autonomously and continue until complete.",
      undefined,
      { useMultiStep: true, maxMultiStepIterations: 4 },
    );

    expect(result.didRespond).toBe(true);
    expect(harness.state.multiStepDecisionCalls).toBeGreaterThanOrEqual(2);
    expect(result.responseContent?.text).toBe("Autonomy multi-step complete");
    expect(result.responseContent?.actions).toEqual(["MULTI_STEP_SUMMARY"]);
  });
});
