import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockJsonRequest,
} from "../test-support/test-helpers";

const loadConfigMock = vi.fn();
const saveConfigMock = vi.fn();

// Mock both the "eliza" and "eliza" branded function names so the test works
// regardless of which branding the resolved @elizaos/autonomous source uses.
vi.mock("@elizaos/autonomous/config/config", () => ({
  loadElizaConfig: () => loadConfigMock(),
  saveElizaConfig: (cfg: unknown) => saveConfigMock(cfg),
}));

import { handleDatabaseRoute } from "@elizaos/autonomous/api/database";

describe("database API security hardening", () => {
  const _prevElizaBind = process.env.ELIZA_API_BIND;
  const prevElizaBind = process.env.ELIZA_API_BIND;

  beforeEach(() => {
    // Set both env var names so the test works regardless of which branding
    // the resolved @elizaos/autonomous source reads.
    process.env.ELIZA_API_BIND = "0.0.0.0";
    loadConfigMock.mockReturnValue({
      database: { provider: "postgres", postgres: { host: "8.8.8.8" } },
    });
    saveConfigMock.mockReset();
  });

  afterEach(() => {
    if (prevElizaBind === undefined) {
      delete process.env.ELIZA_API_BIND;
    } else {
      process.env.ELIZA_API_BIND = prevElizaBind;
    }
    if (prevElizaBind === undefined) {
      delete process.env.ELIZA_API_BIND;
    } else {
      process.env.ELIZA_API_BIND = prevElizaBind;
    }
    vi.clearAllMocks();
  });

  it("validates postgres host even when provider is omitted", async () => {
    const req = createMockJsonRequest(
      {
        postgres: { host: "169.254.169.254" },
      },
      { method: "PUT", url: "/api/database/config" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleDatabaseRoute(
      req,
      res,
      null,
      "/api/database/config",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(getJson()).toEqual({
      error:
        'Connection to "169.254.169.254" is blocked: link-local and metadata addresses are not allowed.',
    });
    expect(saveConfigMock).not.toHaveBeenCalled();
  });

  it("blocks IPv6 link-local hosts across fe80::/10", async () => {
    const req = createMockJsonRequest(
      {
        postgres: { host: "fea0::1" },
      },
      { method: "PUT", url: "/api/database/config" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleDatabaseRoute(
      req,
      res,
      null,
      "/api/database/config",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(String((getJson() as { error?: string }).error ?? "")).toContain(
      'Connection to "fea0::1" is blocked',
    );
    expect(saveConfigMock).not.toHaveBeenCalled();
  });

  it("allows unresolved hostnames when saving config for remote runtime networks", async () => {
    const req = createMockJsonRequest(
      {
        provider: "postgres",
        postgres: {
          connectionString:
            "postgresql://postgres:password@db.invalid:5432/postgres",
        },
      },
      { method: "PUT", url: "/api/database/config" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleDatabaseRoute(
      req,
      res,
      null,
      "/api/database/config",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(saveConfigMock).toHaveBeenCalledTimes(1);
    expect(getJson()).toMatchObject({ saved: true });
  });

  it("rejects unresolved hostnames during direct connection tests", async () => {
    const req = createMockJsonRequest(
      {
        host: "db.invalid",
      },
      { method: "POST", url: "/api/database/test" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleDatabaseRoute(
      req,
      res,
      null,
      "/api/database/test",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(String((getJson() as { error?: string })?.error ?? "")).toContain(
      "failed DNS resolution during validation",
    );
    expect(saveConfigMock).not.toHaveBeenCalled();
  });

  it("pins connectionString host override params to the validated address", async () => {
    const req = createMockJsonRequest(
      {
        provider: "postgres",
        postgres: {
          connectionString:
            "postgresql://postgres:password@1.1.1.1:5432/postgres?host=8.8.8.8,8.8.4.4&hostaddr=8.8.4.4",
        },
      },
      { method: "PUT", url: "/api/database/config" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleDatabaseRoute(
      req,
      res,
      null,
      "/api/database/config",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toMatchObject({ saved: true });
    expect(saveConfigMock).toHaveBeenCalledTimes(1);

    const savedConfig = saveConfigMock.mock.calls[0]?.[0] as {
      database?: {
        postgres?: {
          connectionString?: string;
        };
      };
    };
    const savedConnectionString =
      savedConfig.database?.postgres?.connectionString ?? "";
    const parsed = new URL(savedConnectionString);

    expect(parsed.hostname).toBe("8.8.8.8");
    expect(parsed.searchParams.get("host")).toBe("8.8.8.8");
    expect(parsed.searchParams.get("hostaddr")).toBe("8.8.8.8");
  });

  it.each([
    "localhost:2138",
    "[::1]:2138",
    "http://localhost:2138",
    "127.0.0.1:2138",
  ])("allows private postgres hosts when API_BIND is loopback with host+port (%s)", async (bindHost) => {
    process.env.ELIZA_API_BIND = bindHost;
    const req = createMockJsonRequest(
      {
        provider: "postgres",
        postgres: { host: "10.20.30.40" },
      },
      { method: "PUT", url: "/api/database/config" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleDatabaseRoute(
      req,
      res,
      null,
      "/api/database/config",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(200);
    expect(getJson()).toMatchObject({ saved: true });
    expect(saveConfigMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    "127.evil.com",
    "127.0.0.1.evil.com:2138",
    "127.evil.com:2138",
    "http://127.0.0.1.evil.com:2138",
    "http://127.0.0.1@evil.com:2138",
  ])("does not treat hostname spoof values as loopback binds (%s)", async (bindHost) => {
    process.env.ELIZA_API_BIND = bindHost;
    const req = createMockJsonRequest(
      {
        provider: "postgres",
        postgres: { host: "10.20.30.40" },
      },
      { method: "PUT", url: "/api/database/config" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse();

    const handled = await handleDatabaseRoute(
      req,
      res,
      null,
      "/api/database/config",
    );

    expect(handled).toBe(true);
    expect(getStatus()).toBe(400);
    expect(String((getJson() as { error?: string }).error ?? "")).toContain(
      'Connection to "10.20.30.40" is blocked',
    );
    expect(saveConfigMock).not.toHaveBeenCalled();
  });
});
