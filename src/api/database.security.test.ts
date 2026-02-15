import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockJsonRequest,
} from "../test-support/test-helpers.js";

const loadMilaidyConfigMock = vi.fn();
const saveMilaidyConfigMock = vi.fn();

vi.mock("../config/config.js", () => ({
  loadMilaidyConfig: () => loadMilaidyConfigMock(),
  saveMilaidyConfig: (cfg: unknown) => saveMilaidyConfigMock(cfg),
}));

import { handleDatabaseRoute } from "./database.js";

describe("database API security hardening", () => {
  const prevBind = process.env.MILAIDY_API_BIND;

  beforeEach(() => {
    process.env.MILAIDY_API_BIND = "0.0.0.0";
    loadMilaidyConfigMock.mockReturnValue({
      database: { provider: "postgres", postgres: { host: "8.8.8.8" } },
    });
    saveMilaidyConfigMock.mockReset();
  });

  afterEach(() => {
    if (prevBind === undefined) {
      delete process.env.MILAIDY_API_BIND;
    } else {
      process.env.MILAIDY_API_BIND = prevBind;
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
    expect(saveMilaidyConfigMock).not.toHaveBeenCalled();
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
    expect(saveMilaidyConfigMock).not.toHaveBeenCalled();
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
    expect(saveMilaidyConfigMock).toHaveBeenCalledTimes(1);
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
    expect(saveMilaidyConfigMock).not.toHaveBeenCalled();
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
    expect(saveMilaidyConfigMock).toHaveBeenCalledTimes(1);

    const savedConfig = saveMilaidyConfigMock.mock.calls[0]?.[0] as {
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
});
