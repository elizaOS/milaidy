import type { AgentRuntime } from "@elizaos/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import type { MiladyConfig } from "../config/types";
import { createRouteInvoker } from "../test-support/route-test-helpers";
import {
  type CharacterRouteState,
  handleCharacterRoutes,
} from "./character-routes";

function createRuntimeStub(): AgentRuntime {
  const character: Record<string, unknown> = {
    name: "Milady",
    bio: ["Initial bio"],
    system: "System prompt",
    adjectives: ["curious"],
    topics: ["fashion", "ai"],
    style: { all: ["be concise"], chat: [], post: [] },
    messageExamples: [
      {
        examples: [
          { name: "{{user1}}", content: { text: "hello" } },
          { name: "Milady", content: { text: "hi" } },
        ],
      },
    ],
    postExamples: ["post one"],
  };

  return {
    character,
    useModel: vi.fn(async () => "generated output"),
  } as unknown as AgentRuntime;
}

describe("character routes", () => {
  let state: CharacterRouteState;
  let pickRandomNames: ReturnType<typeof vi.fn>;
  let saveConfig: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    pickRandomNames = vi.fn(() => ["Reimu"]);
    saveConfig = vi.fn();
    state = {
      runtime: createRuntimeStub(),
      agentName: "Milady",
      config: {
        agents: {
          list: [{ id: "main", default: true, name: "Milady" }],
        },
      } as MiladyConfig,
    };
  });

  const invoke = createRouteInvoker<
    Record<string, unknown>,
    CharacterRouteState,
    Record<string, unknown>
  >(
    async (ctx) =>
      handleCharacterRoutes({
        req: ctx.req,
        res: ctx.res,
        method: ctx.method,
        pathname: ctx.pathname,
        state: ctx.runtime,
        saveConfig,
        readJsonBody: async () => ctx.readJsonBody(),
        json: (res, data, status) => ctx.json(res, data, status),
        error: (res, message, status) => ctx.error(res, message, status),
        pickRandomNames,
      }),
    { runtimeProvider: () => state },
  );

  test("returns false for non-character routes", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/status",
    });

    expect(result.handled).toBe(false);
  });

  test("returns merged character payload from runtime", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/character",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      agentName: "Milady",
      character: {
        name: "Milady",
        bio: ["Initial bio"],
        topics: ["fashion", "ai"],
        messageExamples: expect.any(Array),
      },
    });
  });

  test("updates character and agent name", async () => {
    const result = await invoke({
      method: "PUT",
      pathname: "/api/character",
      body: {
        name: "Sakuya",
        bio: ["new bio"],
        system: "new system",
      },
    });

    expect(result.status).toBe(200);
    expect(state.agentName).toBe("Sakuya");
    expect(
      (state.runtime as unknown as { character: Record<string, unknown> })
        .character.name,
    ).toBe("Sakuya");
    expect(result.payload).toMatchObject({
      ok: true,
      agentName: "Sakuya",
    });
  });

  test("updates message examples", async () => {
    const messageExamples = [
      {
        examples: [
          { name: "{{user1}}", content: { text: "question" } },
          { name: "Sakuya", content: { text: "answer" } },
        ],
      },
    ];

    const result = await invoke({
      method: "PUT",
      pathname: "/api/character",
      body: {
        messageExamples,
      },
    });

    expect(result.status).toBe(200);
    expect(
      (state.runtime as unknown as { character: Record<string, unknown> })
        .character.messageExamples,
    ).toEqual(messageExamples);
  });

  test("persists the full character payload including username across save and reload", async () => {
    const fullCharacter = {
      name: "Sakuya",
      username: "Sakuya",
      bio: ["new bio", "second line"],
      system: "new system",
      adjectives: ["precise", "calm"],
      topics: ["timekeeping", "discipline"],
      style: {
        all: ["Be exact"],
        chat: ["Stay calm"],
        post: ["Be clear"],
      },
      messageExamples: [
        {
          examples: [
            { name: "{{user1}}", content: { text: "status?" } },
            { name: "Sakuya", content: { text: "On track." } },
          ],
        },
      ],
      postExamples: ["Mission remains on schedule."],
    };

    const putResult = await invoke({
      method: "PUT",
      pathname: "/api/character",
      body: fullCharacter,
    });

    expect(putResult.status).toBe(200);
    expect(putResult.payload).toMatchObject({
      ok: true,
      agentName: "Sakuya",
      character: fullCharacter,
    });
    expect(state.agentName).toBe("Sakuya");
    expect(
      (state.runtime as unknown as { character: Record<string, unknown> })
        .character,
    ).toMatchObject(fullCharacter);

    const getResult = await invoke({
      method: "GET",
      pathname: "/api/character",
    });

    expect(getResult.status).toBe(200);
    expect(getResult.payload).toMatchObject({
      agentName: "Sakuya",
      character: fullCharacter,
    });
  });

  test("syncs character post examples into config so they survive restart", async () => {
    const result = await invoke({
      method: "PUT",
      pathname: "/api/character",
      body: {
        name: "Reimu",
        topics: ["shrines", "danmaku"],
        postExamples: ["default fallback post"],
        messageExamples: [
          {
            examples: [
              { name: "{{user1}}", content: { text: "hi" } },
              { name: "Reimu", content: { text: "hello" } },
            ],
          },
        ],
      },
    });

    expect(result.status).toBe(200);
    expect(saveConfig).toHaveBeenCalledTimes(1);
    expect(state.config?.agents?.list?.[0]).toMatchObject({
      id: "main",
      default: true,
      name: "Reimu",
      topics: ["shrines", "danmaku"],
      postExamples: ["default fallback post"],
      messageExamples: [
        {
          examples: [
            { name: "{{user1}}", content: { text: "hi" } },
            { name: "Reimu", content: { text: "hello" } },
          ],
        },
      ],
    });
  });

  test("returns 422 for invalid character payload", async () => {
    const result = await invoke({
      method: "PUT",
      pathname: "/api/character",
      body: {
        name: "",
      },
    });

    expect(result.status).toBe(422);
    expect(result.payload).toMatchObject({
      ok: false,
      validationErrors: expect.any(Array),
    });
  });

  test("returns random name from picker", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/character/random-name",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({ name: "Reimu" });
    expect(pickRandomNames).toHaveBeenCalledWith(1);
  });

  test("generates character content with model (bio)", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/character/generate",
      body: {
        field: "bio",
        context: {
          name: "Milady",
          system: "agent system",
          bio: "bio text",
        },
      },
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({ generated: "generated output" });
    expect(
      (state.runtime as unknown as { useModel: ReturnType<typeof vi.fn> })
        .useModel,
    ).toHaveBeenCalledTimes(1);
  });

  test("generates character content with model (system)", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/character/generate",
      body: {
        field: "system",
        context: {
          name: "Milady",
          system: "agent system",
          bio: "bio text",
        },
      },
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({ generated: "generated output" });
    expect(
      (state.runtime as unknown as { useModel: ReturnType<typeof vi.fn> })
        .useModel,
    ).toHaveBeenCalledTimes(1);
  });

  test("returns error when generation field is unknown", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/character/generate",
      body: {
        field: "not-real",
        context: {},
      } as unknown as Record<string, unknown>,
    });

    expect(result.status).toBe(400);
    expect(result.payload).toMatchObject({
      error: "Unknown field: not-real",
    });
  });

  test("returns schema fields", async () => {
    const result = await invoke({
      method: "GET",
      pathname: "/api/character/schema",
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      fields: expect.any(Array),
    });
  });
});
