import type { AgentRuntime, Memory, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createRouteInvoker } from "../test-support/route-test-helpers.js";
import { handleKnowledgeRoutes } from "./knowledge-routes.js";

const AGENT_ID = "00000000-0000-0000-0000-000000000001" as UUID;

function uuid(n: number): UUID {
  return `00000000-0000-0000-0000-${String(n).padStart(12, "0")}` as UUID;
}

function buildMemory(overrides: Partial<Memory> = {}): Memory {
  return {
    id: uuid(9000),
    agentId: AGENT_ID,
    roomId: AGENT_ID,
    entityId: AGENT_ID,
    content: { text: "" },
    createdAt: 1,
    ...overrides,
  } as Memory;
}

describe("knowledge routes", () => {
  let runtime: AgentRuntime | null;
  let getMemoriesMock: ReturnType<typeof vi.fn>;
  let deleteMemoryMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    getMemoriesMock = vi.fn(async () => []);
    deleteMemoryMock = vi.fn(async () => undefined);

    const knowledgeService = {
      addKnowledge: vi.fn(async () => ({
        clientDocumentId: uuid(1111),
        storedDocumentMemoryId: uuid(1112),
        fragmentCount: 0,
      })),
      getKnowledge: vi.fn(async () => []),
      getMemories: getMemoriesMock,
      countMemories: vi.fn(async () => 0),
      deleteMemory: deleteMemoryMock,
    };

    runtime = {
      agentId: AGENT_ID,
      getService: (name: string) => (name === "knowledge" ? knowledgeService : null),
      getServiceLoadPromise: async () => undefined,
    } as unknown as AgentRuntime;
  });

  const invoke = createRouteInvoker<
    Record<string, unknown> | null,
    AgentRuntime | null,
    Record<string, unknown>
  >(
    (ctx) =>
      handleKnowledgeRoutes({
        req: ctx.req,
        res: ctx.res,
        method: ctx.method,
        pathname: ctx.pathname,
        url: new URL(ctx.req.url ?? ctx.pathname, "http://localhost:2138"),
        runtime: ctx.runtime,
        readJsonBody: async () => ctx.readJsonBody(),
        json: (res, data, status) => ctx.json(res, data, status),
        error: (res, message, status) => ctx.error(res, message, status),
      }),
    { runtimeProvider: () => runtime },
  );

  test("passes offset=1 through documents endpoint without off-by-one", async () => {
    getMemoriesMock.mockResolvedValueOnce([]);

    const result = await invoke({
      method: "GET",
      pathname: "/api/knowledge/documents",
      url: "/api/knowledge/documents?limit=10&offset=1",
    });

    expect(result.status).toBe(200);
    expect(getMemoriesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: "documents",
        roomId: AGENT_ID,
        count: 10,
        offset: 1,
      }),
    );
  });

  test("treats offset=0 as no skip for documents endpoint", async () => {
    getMemoriesMock.mockResolvedValueOnce([]);

    const result = await invoke({
      method: "GET",
      pathname: "/api/knowledge/documents",
      url: "/api/knowledge/documents?limit=10&offset=0",
    });

    expect(result.status).toBe(200);
    expect(getMemoriesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: "documents",
        roomId: AGENT_ID,
        count: 10,
        offset: undefined,
      }),
    );
  });

  test("filters fragments without id/createdAt and paginates batches", async () => {
    const documentId = uuid(1200);
    const firstBatch = [
      buildMemory({
        id: undefined,
        createdAt: 10,
        metadata: { documentId, position: 2 },
        content: { text: "missing-id" },
      }),
      buildMemory({
        id: uuid(1201),
        createdAt: undefined,
        metadata: { documentId, position: 1 },
        content: { text: "missing-created-at" },
      }),
      buildMemory({
        id: uuid(1202),
        createdAt: 20,
        metadata: { documentId, position: 5 },
        content: { text: "valid-first-batch" },
      }),
      ...Array.from({ length: 497 }, (_, i) =>
        buildMemory({
          id: uuid(2000 + i),
          metadata: { documentId: uuid(9999), position: i + 10 },
          createdAt: i + 100,
          content: { text: "other-doc" },
        }),
      ),
    ];

    const secondBatch = [
      buildMemory({
        id: uuid(1300),
        createdAt: 30,
        metadata: { documentId, position: 0 },
        content: { text: "valid-second-batch" },
      }),
      buildMemory({
        id: uuid(1301),
        createdAt: 40,
        metadata: { documentId: uuid(8888), position: 9 },
        content: { text: "other-doc-2" },
      }),
    ];

    getMemoriesMock.mockImplementation(async ({ tableName, offset }) => {
      if (tableName !== "knowledge") return [];
      if (offset === 0) return firstBatch;
      if (offset === 500) return secondBatch;
      return [];
    });

    const result = await invoke({
      method: "GET",
      pathname: `/api/knowledge/fragments/${documentId}`,
    });

    expect(result.status).toBe(200);
    expect(getMemoriesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: "knowledge",
        roomId: AGENT_ID,
        count: 500,
        offset: 0,
      }),
    );
    expect(getMemoriesMock).toHaveBeenCalledWith(
      expect.objectContaining({
        tableName: "knowledge",
        roomId: AGENT_ID,
        count: 500,
        offset: 500,
      }),
    );

    const fragments = (
      result.payload as {
        fragments: Array<{ id: UUID; text: string; position: unknown; createdAt: number }>;
      }
    ).fragments;

    expect(fragments).toEqual([
      {
        id: uuid(1300),
        text: "valid-second-batch",
        position: 0,
        createdAt: 30,
      },
      {
        id: uuid(1202),
        text: "valid-first-batch",
        position: 5,
        createdAt: 20,
      },
    ]);
  });

  test("delete document only deletes fragment memories with defined ids", async () => {
    const documentId = uuid(1400);
    const validFragmentId = uuid(1401);

    getMemoriesMock.mockResolvedValueOnce([
      buildMemory({
        id: undefined,
        metadata: { documentId },
      }),
      buildMemory({
        id: validFragmentId,
        metadata: { documentId },
      }),
    ]);

    const result = await invoke({
      method: "DELETE",
      pathname: `/api/knowledge/documents/${documentId}`,
    });

    expect(result.status).toBe(200);
    expect(deleteMemoryMock).toHaveBeenCalledTimes(2);
    expect(deleteMemoryMock).toHaveBeenNthCalledWith(1, validFragmentId);
    expect(deleteMemoryMock).toHaveBeenNthCalledWith(2, documentId);
    expect(result.payload).toMatchObject({ ok: true, deletedFragments: 1 });
  });
});
