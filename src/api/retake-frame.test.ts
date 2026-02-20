import { describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockIncomingMessage,
} from "../test-support/test-helpers";
import { readRequestBodyBuffer } from "./http-helpers";

/**
 * Inline handler extracted from server.ts — tests the retake frame push logic
 * without importing the full server module.
 */
async function handleRetakeFrame(
  req: import("node:http").IncomingMessage,
  res: import("node:http").ServerResponse,
  state: {
    runtime?: { getService: (name: string) => unknown } | null;
  },
  json: (res: import("node:http").ServerResponse, data: unknown) => void,
  error: (
    res: import("node:http").ServerResponse,
    message: string,
    status: number,
  ) => void,
): Promise<void> {
  const retakeSvc = state.runtime?.getService("retake") as
    | { pushFrame?: (buf: Buffer) => boolean }
    | null
    | undefined;
  if (!retakeSvc?.pushFrame) {
    error(res, "Retake service not available", 503);
    return;
  }
  try {
    const buf = await readRequestBodyBuffer(req, {
      maxBytes: 2 * 1024 * 1024,
    });
    if (!buf || buf.length === 0) {
      error(res, "Empty frame", 400);
      return;
    }
    const ok = retakeSvc.pushFrame(buf);
    json(res, { ok });
  } catch (err) {
    error(res, err instanceof Error ? err.message : "Frame push failed", 500);
  }
}

describe("POST /api/retake/frame", () => {
  it("returns 503 when retake service is unavailable", async () => {
    const { res } = createMockHttpResponse();
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/retake/frame",
    });

    let capturedStatus = 0;
    let capturedPayload: unknown = null;

    await handleRetakeFrame(
      req,
      res,
      { runtime: null },
      (_res, data) => {
        capturedPayload = data;
      },
      (_res, message, status) => {
        capturedStatus = status;
        capturedPayload = { error: message };
      },
    );

    expect(capturedStatus).toBe(503);
    expect(capturedPayload).toEqual({ error: "Retake service not available" });
  });

  it("returns 503 when runtime has no retake service", async () => {
    const { res } = createMockHttpResponse();
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/retake/frame",
    });

    let capturedStatus = 0;

    await handleRetakeFrame(
      req,
      res,
      { runtime: { getService: () => null } },
      vi.fn(),
      (_res, _message, status) => {
        capturedStatus = status;
      },
    );

    expect(capturedStatus).toBe(503);
  });

  it("returns 400 when body is empty", async () => {
    const { res } = createMockHttpResponse();
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/retake/frame",
    });

    let capturedStatus = 0;
    let capturedPayload: unknown = null;

    const pushFrame = vi.fn(() => true);

    await handleRetakeFrame(
      req,
      res,
      { runtime: { getService: () => ({ pushFrame }) } },
      vi.fn(),
      (_res, message, status) => {
        capturedStatus = status;
        capturedPayload = { error: message };
      },
    );

    expect(capturedStatus).toBe(400);
    expect(capturedPayload).toEqual({ error: "Empty frame" });
    expect(pushFrame).not.toHaveBeenCalled();
  });

  it("returns 200 on successful frame push", async () => {
    const { res } = createMockHttpResponse();
    const frameData = Buffer.from("fake-jpeg-data");
    const req = createMockIncomingMessage({
      method: "POST",
      url: "/api/retake/frame",
      body: frameData,
    });

    let capturedPayload: unknown = null;

    const pushFrame = vi.fn(() => true);

    await handleRetakeFrame(
      req,
      res,
      { runtime: { getService: () => ({ pushFrame }) } },
      (_res, data) => {
        capturedPayload = data;
      },
      vi.fn(),
    );

    expect(pushFrame).toHaveBeenCalledWith(frameData);
    expect(capturedPayload).toEqual({ ok: true });
  });
});
