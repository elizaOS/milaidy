import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "../src/api/server.js";

function req(
  port: number,
  method: string,
  p: string,
): Promise<{
  status: number;
  headers: http.IncomingHttpHeaders;
}> {
  return new Promise((resolve, reject) => {
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: p,
        method,
      },
      (res) => {
        res.resume(); // Consume response to free memory
        resolve({ status: res.statusCode ?? 0, headers: res.headers });
      },
    );
    r.on("error", reject);
    r.end();
  });
}

describe("API Security Headers", () => {
  let port: number;
  let close: () => Promise<void>;

  beforeAll(async () => {
    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;
  }, 30_000);

  afterAll(async () => {
    await close();
  });

  it("GET /api/status includes security headers", async () => {
    const { headers } = await req(port, "GET", "/api/status");

    expect(headers["content-security-policy"]).toBe("default-src 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
  });

  it("GET /api/config includes security headers", async () => {
    const { headers } = await req(port, "GET", "/api/config");

    expect(headers["content-security-policy"]).toBe("default-src 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
  });

  it("404 response includes security headers", async () => {
    const { headers } = await req(port, "GET", "/api/non-existent");

    expect(headers["content-security-policy"]).toBe("default-src 'none'");
    expect(headers["x-frame-options"]).toBe("DENY");
    expect(headers["x-content-type-options"]).toBe("nosniff");
    expect(headers["referrer-policy"]).toBe("no-referrer");
  });
});
