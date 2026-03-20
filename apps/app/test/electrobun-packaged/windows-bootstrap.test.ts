import { describe, expect, it } from "vitest";

import { hasPackagedRendererBootstrapRequests } from "./windows-bootstrap";

describe("hasPackagedRendererBootstrapRequests", () => {
  it("accepts the legacy /api/status startup marker", () => {
    expect(
      hasPackagedRendererBootstrapRequests([
        "GET /api/triggers",
        "GET /api/status",
      ]),
    ).toBe(true);
  });

  it("accepts the current renderer bootstrap sequence via drop status", () => {
    expect(
      hasPackagedRendererBootstrapRequests([
        "GET /api/triggers",
        "GET /api/triggers/health",
        "GET /api/drop/status",
        "GET /api/config",
      ]),
    ).toBe(true);
  });

  it("accepts the current renderer bootstrap sequence via stream settings", () => {
    expect(
      hasPackagedRendererBootstrapRequests([
        "GET /api/config",
        "POST /api/stream/settings",
      ]),
    ).toBe(true);
  });

  it("rejects main-process heartbeat traffic on its own", () => {
    expect(
      hasPackagedRendererBootstrapRequests([
        "GET /api/triggers",
        "GET /api/triggers/health",
      ]),
    ).toBe(false);
  });

  it("rejects config-only traffic without a renderer-owned follow-up", () => {
    expect(hasPackagedRendererBootstrapRequests(["GET /api/config"])).toBe(
      false,
    );
  });
});
