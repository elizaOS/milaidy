import http from "node:http";
import type { AgentRuntime, UUID } from "@elizaos/core";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { startApiServer } from "./server";

function req(
  port: number,
  method: string,
  path: string,
  body?: Record<string, unknown>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const request = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload
            ? { "Content-Length": String(Buffer.byteLength(payload)) }
            : {}),
        },
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            data = { _raw: raw };
          }
          resolve({ status: response.statusCode ?? 0, data });
        });
      },
    );

    request.on("error", reject);
    if (payload) request.write(payload);
    request.end();
  });
}

describe("conversation no-response fallback", () => {
  let port = 0;
  let close: () => Promise<void> = async () => {};
  let updateRuntime: (runtime: AgentRuntime) => void = () => {};

  const createMemory = vi.fn(async () => undefined);
  const getMemories = vi.fn(async () => []);
  const handleMessage = vi.fn(async () => ({
    responseContent: { text: "(no response)" },
    responseMessages: [],
  }));
  const runtime = {
    agentId: "00000000-0000-0000-0000-000000000999" as UUID,
    character: {
      name: "Reimu",
      postExamples: ["Reimu default fallback post."],
    },
    ensureConnection: vi.fn(async () => undefined),
    getWorld: vi.fn(async () => null),
    updateWorld: vi.fn(async () => undefined),
    getMemories,
    createMemory,
    getService: vi.fn(() => null),
    messageService: {
      handleMessage,
    },
    logger: {
      info: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    },
    adapter: {},
  } as unknown as unknown as AgentRuntime;

  beforeAll(async () => {
    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
    updateRuntime = server.updateRuntime;
  }, 30_000);

  afterAll(async () => {
    await close();
  });

  it("uses the character default post when chat generation returns no response", async () => {
    updateRuntime(runtime);
    createMemory.mockClear();
    getMemories.mockClear();
    handleMessage.mockClear();

    const created = await req(port, "POST", "/api/conversations", {
      title: "Fallback thread",
    });
    expect(created.status).toBe(200);
    const conversationId = String(
      (created.data.conversation as { id?: string } | undefined)?.id ?? "",
    );
    expect(conversationId).not.toBe("");

    const response = await req(
      port,
      "POST",
      `/api/conversations/${conversationId}/messages`,
      {
        text: "hello",
      },
    );

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      text: "Reimu default fallback post.",
      agentName: "Reimu",
    });
  });

  it("uses the character default post when chat generation returns only a stage direction", async () => {
    updateRuntime(runtime);
    createMemory.mockClear();
    getMemories.mockClear();
    handleMessage.mockResolvedValueOnce({
      responseContent: { text: "*waves warmly*" },
      responseMessages: [],
    });

    const created = await req(port, "POST", "/api/conversations", {
      title: "Stage direction fallback thread",
    });
    expect(created.status).toBe(200);
    const conversationId = String(
      (created.data.conversation as { id?: string } | undefined)?.id ?? "",
    );
    expect(conversationId).not.toBe("");

    const response = await req(
      port,
      "POST",
      `/api/conversations/${conversationId}/messages`,
      {
        text: "hello again",
      },
    );

    expect(response.status).toBe(200);
    expect(response.data).toMatchObject({
      text: "Reimu default fallback post.",
      agentName: "Reimu",
    });
  });
});
