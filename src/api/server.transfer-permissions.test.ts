import http from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startApiServer } from "./server";

function req(
  port: number,
  method: string,
  path: string,
  body?: Record<string, unknown>,
  headers?: Record<string, string>,
): Promise<{ status: number; data: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    const b = body ? JSON.stringify(body) : undefined;
    const r = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path,
        method,
        headers: {
          "Content-Type": "application/json",
          ...(b ? { "Content-Length": Buffer.byteLength(b) } : {}),
          ...(headers ?? {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => {
          const raw = Buffer.concat(chunks).toString("utf-8");
          let data: Record<string, unknown> = {};
          try {
            data = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            data = { _raw: raw };
          }
          resolve({ status: res.statusCode ?? 0, data });
        });
      },
    );
    r.on("error", reject);
    if (b) r.write(b);
    r.end();
  });
}

describe("wallet transfer permissions", () => {
  let port: number;
  let close: () => Promise<void>;
  const savedEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const key of [
      "EVM_PRIVATE_KEY",
      "NODEREAL_BSC_RPC_URL",
      "QUICKNODE_BSC_RPC_URL",
    ]) {
      savedEnv[key] = process.env[key];
    }

    process.env.EVM_PRIVATE_KEY =
      "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
    delete process.env.NODEREAL_BSC_RPC_URL;
    delete process.env.QUICKNODE_BSC_RPC_URL;

    const server = await startApiServer({ port: 0 });
    port = server.port;
    close = server.close;

    const modeResponse = await req(port, "PUT", "/api/permissions/trade-mode", {
      mode: "manual-local-key",
    });
    expect(modeResponse.status).toBe(200);
  }, 30_000);

  afterAll(async () => {
    await close();
    for (const [key, value] of Object.entries(savedEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("treats agent-originated transfer execution as user-sign in manual-local-key mode", async () => {
    const { status, data } = await req(
      port,
      "POST",
      "/api/wallet/transfer/execute",
      {
        toAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        amount: "0.001",
        assetSymbol: "BNB",
        confirm: true,
      },
      { "X-Eliza-Agent-Action": "1" },
    );

    expect([200, 503]).toContain(status);
    if (status === 200) {
      expect(data.executed).toBe(false);
      expect(data.mode).toBe("user-sign");
      expect(data.requiresUserSignature).toBe(true);
    }
  });
});
