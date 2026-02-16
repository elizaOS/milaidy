import http from "node:http";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { startApiServer } from "../src/api/server.js";
import { ModelType } from "@elizaos/core";

type RuntimeWithModel = {
  useModel: (model: ModelType, options: { prompt: string }) => Promise<string>;
  getService: ReturnType<typeof vi.fn>;
  character: { name: string };
};

async function req(
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
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => chunks.push(chunk));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            data = { raw };
          }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );

    request.on("error", reject);
    if (payload) {
      request.write(payload);
    }
    request.end();
  });
}

describe("/api/custom-actions/generate", () => {
  const responseFromModel = JSON.stringify({
    name: "weather_lookup",
    description: "Lookup weather conditions for the requested city",
    handlerType: "http",
    handler: {
      type: "http",
      method: "GET",
      url: "https://api.example.com/weather",
    },
  });
  const useModel = vi.fn(async () =>
    responseFromModel,
  );

  const runtime: RuntimeWithModel = {
    useModel,
    getService: vi.fn(),
    character: { name: "Milaidy QA" },
  };

  let apiPort = 0;
  let closeServer: () => Promise<void> = async () => {};

  beforeAll(async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const server = await startApiServer({
      port: 0,
      runtime,
    });
    apiPort = server.port;
    closeServer = server.close;
  });

  afterAll(async () => {
    vi.restoreAllMocks();
    await closeServer();
  });

  beforeEach(() => {
    useModel.mockReset();
    useModel.mockResolvedValue(responseFromModel);
  });

  it("returns generated action from runtime model output", async () => {
    const response = await req(apiPort, "POST", "/api/custom-actions/generate", {
      prompt: "Create an action to check current weather",
    });

    expect(response.status).toBe(200);
    expect(response.data.ok).toBe(true);
    expect(response.data.generated).toMatchObject({
      name: "weather_lookup",
      handlerType: "http",
      description: "Lookup weather conditions for the requested city",
    });
    expect(useModel).toHaveBeenCalledTimes(1);
    expect(useModel).toHaveBeenCalledWith(
      ModelType.TEXT_SMALL,
      expect.objectContaining({
        prompt: expect.stringContaining("User request: Create an action to check current weather"),
      }),
    );
  });

  it("returns 400 when prompt is missing", async () => {
    const response = await req(apiPort, "POST", "/api/custom-actions/generate", {});

    expect(response.status).toBe(400);
    expect(response.data.error).toBe("prompt is required");
  });

  it("returns 503 when runtime is unavailable", async () => {
    const server = await startApiServer({ port: 0 });
    const response = await req(server.port, "POST", "/api/custom-actions/generate", {
      prompt: "Build a custom action",
    });

    expect(response.status).toBe(503);
    expect(response.data.error).toBe("Agent runtime not available");

    await server.close();
  });

  it("returns 500 when runtime output cannot be parsed", async () => {
    useModel.mockResolvedValue("This is not valid JSON");

    const response = await req(apiPort, "POST", "/api/custom-actions/generate", {
      prompt: "Build a webhook action",
    });

    expect(response.status).toBe(500);
    expect(response.data.error).toContain("Failed to generate action definition");
  });
});
