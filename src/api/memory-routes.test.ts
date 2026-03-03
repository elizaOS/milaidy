import type { AgentRuntime, Memory, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createRouteInvoker } from "../test-support/route-test-helpers.js";
import { handleMemoryRoutes } from "./memory-routes.js";

const AGENT_ID = "00000000-0000-0000-0000-000000000001" as UUID;

function uuid(n: number): UUID {
  return `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` as UUID;
}

function buildMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: uuid(9000),
    agentId: AGENT_ID,
    roomId: uuid(7000),
    entityId: AGENT_ID,
    content: { text: "" },
    createdAt: 1,
    ...overrides,
  } as Memory;
}

describe("memory routes", () => {
  let runtime: AgentRuntime | null;
  let createMemoryMock: ReturnType<typeof vi.fn>;
  let getMemoriesMock: ReturnType<typeof vi.fn>;
  let useModelMock: ReturnType<typeof vi.fn>;
  let knowledgeGetMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    createMemoryMock = vi.fn(async () => undefined);
    getMemoriesMock = vi.fn(async () => []);
    useModelMock = vi.fn(async () => "quick answer");
    knowledgeGetMock = vi.fn(async () => []);

    runtime = {
      agentId: AGENT_ID,
      character: { name: "Milady" },
      ensureConnection: vi.fn(async () => undefined),
      createMemory: createMemoryMock,
      getMemories: getMemoriesMock,
      useModel: useModelMock,
      getService: (name: string) =>
        name === "knowledge"
          ? {
              getKnowledge: knowledgeGetMock,
            }
          : null,
      getServiceLoadPromise: async () => undefined,
    } as unknown as AgentRuntime;
  });

  const invoke = createRouteInvoker<
    Record<string, unknown> | null,
    AgentRuntime | null,
    Record<string, unknown>
  >(
    (ctx) =>
      handleMemoryRoutes({
        req: ctx.req,
        res: ctx.res,
        method: ctx.method,
        pathname: ctx.pathname,
        url: new URL(ctx.req.url ?? ctx.pathname, "http://localhost:2138"),
        runtime: ctx.runtime,
        agentName: "Milady",
        readJsonBody: async () => ctx.readJsonBody(),
        json: (res, data, status) => ctx.json(res, data, status),
        error: (res, message, status) => ctx.error(res, message, status),
      }),
    { runtimeProvider: () => runtime },
  );

  test("stores #remember notes in messages table with hash_memory source", async () => {
    const result = await invoke({
      method: "POST",
      pathname: "/api/memory/remember",
      body: { text: "we use typescript" },
    });

    expect(result.handled).toBe(true);
    expect(result.status).toBe(200);
    expect(createMemoryMock).toHaveBeenCalledTimes(1);
    expect(createMemoryMock).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.objectContaining({
          text: "we use typescript",
          source: "hash_memory",
        }),
      }),
      "messages",
    );
  });

  test("search returns only matching hash memories", async () => {
    getMemoriesMock.mockResolvedValue([
      buildMemory({
        id: uuid(1),
        createdAt: 1,
        content: { text: "we use typescript", source: "hash_memory" },
      }),
      buildMemory({
        id: uuid(2),
        createdAt: 2,
        content: { text: "python only", source: "hash_memory" },
      }),
      buildMemory({
        id: uuid(3),
        createdAt: 3,
        content: { text: "noise", source: "client_chat" },
      }),
    ]);

    const result = await invoke({
      method: "GET",
      pathname: "/api/memory/search",
      url: "/api/memory/search?q=typescript&limit=5",
    });

    expect(result.status).toBe(200);
    expect(
      (result.payload as { results: Array<{ text: string }> }).results.map(
        (item) => item.text,
      ),
    ).toEqual(["we use typescript"]);
  });

  test("quick context returns model answer with memory and knowledge context", async () => {
    getMemoriesMock.mockResolvedValue([
      buildMemory({
        id: uuid(11),
        createdAt: 11,
        content: { text: "use TypeScript for services", source: "hash_memory" },
      }),
    ]);
    knowledgeGetMock.mockResolvedValue([
      {
        id: uuid(100),
        content: { text: "Repo uses Bun and TypeScript" },
        similarity: 0.88,
        metadata: { filename: "README.md" },
      },
    ]);
    useModelMock.mockResolvedValue("TypeScript is the preferred stack.");

    const result = await invoke({
      method: "GET",
      pathname: "/api/context/quick",
      url: "/api/context/quick?q=typescript&limit=3",
    });

    expect(result.status).toBe(200);
    expect((result.payload as { answer: string }).answer).toContain(
      "TypeScript",
    );
    expect((result.payload as { memories: unknown[] }).memories).toHaveLength(
      1,
    );
    expect((result.payload as { knowledge: unknown[] }).knowledge).toHaveLength(
      1,
    );
    expect(useModelMock).toHaveBeenCalledTimes(1);
  });
});
