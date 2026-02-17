import { lookup as dnsLookup } from "node:dns/promises";
import type { AgentRuntime, Memory, UUID } from "@elizaos/core";
import { beforeEach, describe, expect, test, vi } from "vitest";
import { createRouteInvoker } from "../test-support/route-test-helpers.js";
import { handleKnowledgeRoutes } from "./knowledge-routes.js";

vi.mock("node:dns/promises", () => ({
  lookup: vi.fn(),
}));

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
  let addKnowledgeMock: ReturnType<typeof vi.fn>;
  let getMemoriesMock: ReturnType<typeof vi.fn>;
  let deleteMemoryMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    addKnowledgeMock = vi.fn(async () => ({
      clientDocumentId: uuid(1111),
      storedDocumentMemoryId: uuid(1112),
      fragmentCount: 0,
    }));
    getMemoriesMock = vi.fn(async () => []);
    deleteMemoryMock = vi.fn(async () => undefined);

    const knowledgeService = {
      addKnowledge: addKnowledgeMock,
      getKnowledge: vi.fn(async () => []),
      getMemories: getMemoriesMock,
      countMemories: vi.fn(async () => 0),
      deleteMemory: deleteMemoryMock,
    };

    runtime = {
      agentId: AGENT_ID,
      getService: (name: string) =>
        name === "knowledge" ? knowledgeService : null,
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
        fragments: Array<{
          id: UUID;
          text: string;
          position: unknown;
          createdAt: number;
        }>;
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

  test("blocks URL import to loopback hosts", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/url",
      body: { url: "http://127.0.0.1:8000/secrets" },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error?: string }).error).toContain("blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(addKnowledgeMock).not.toHaveBeenCalled();
  });

  test("blocks URL import to IPv6 link-local hosts outside fe80::/16", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/url",
      body: { url: "http://[fea0::1]/x" },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error?: string }).error).toContain("blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(addKnowledgeMock).not.toHaveBeenCalled();
  });

  test("blocks URL import when DNS resolves to link-local/metadata IP", async () => {
    vi.mocked(dnsLookup).mockResolvedValue([
      { address: "169.254.169.254", family: 4 },
    ]);
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/url",
      body: { url: "http://metadata.nip.io/latest/meta-data" },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error?: string }).error).toContain("blocked");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(addKnowledgeMock).not.toHaveBeenCalled();
  });

  test("allows URL import for public hosts", async () => {
    vi.mocked(dnsLookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: new Headers({ "content-type": "text/plain; charset=utf-8" }),
      arrayBuffer: async () => new TextEncoder().encode("hello").buffer,
    } as Response);

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/url",
      body: { url: "https://example.com/doc.txt" },
    });

    expect(result.status).toBe(200);
    expect(result.payload).toMatchObject({
      ok: true,
      contentType: "text/plain; charset=utf-8",
      filename: "doc.txt",
      isYouTubeTranscript: false,
    });
    expect(addKnowledgeMock).toHaveBeenCalledTimes(1);
  });

  test("blocks URL import when fetch responds with redirect", async () => {
    vi.mocked(dnsLookup).mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
    ]);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 302,
      statusText: "Found",
      headers: new Headers({ location: "http://169.254.169.254/latest" }),
      arrayBuffer: async () => new ArrayBuffer(0),
    } as Response);

    const result = await invoke({
      method: "POST",
      pathname: "/api/knowledge/documents/url",
      body: { url: "https://example.com/redirect" },
    });

    expect(result.status).toBe(400);
    expect((result.payload as { error?: string }).error).toContain(
      "redirects are not allowed",
    );
    expect(fetchSpy).toHaveBeenCalledWith(
      "https://example.com/redirect",
      expect.objectContaining({ redirect: "manual" }),
    );
    expect(addKnowledgeMock).not.toHaveBeenCalled();
  });
});
