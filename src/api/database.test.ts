import type { AgentRuntime } from "@elizaos/core";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  createMockHttpResponse,
  createMockJsonRequest,
} from "../test-support/test-helpers.js";

vi.mock("../config/config.js", () => ({
  loadMilaidyConfig: vi.fn().mockReturnValue({}),
  saveMilaidyConfig: vi.fn(),
}));

import { handleDatabaseRoute } from "./database.js";

describe("handleDatabaseRoute query validation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects mutation keywords in read-only mode", async () => {
    const req = createMockJsonRequest(
      { sql: "DELETE FROM users" },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus, getJson } = createMockHttpResponse();

    await handleDatabaseRoute(
      req,
      res,
      { adapter: {} } as unknown as AgentRuntime,
      "/api/database/query",
    );

    expect(getStatus()).toBe(400);
    expect(String((getJson() as { error?: string })?.error ?? "")).toContain(
      "mutation keyword",
    );
  });

  it("allows SELECT in read-only mode", async () => {
    const req = createMockJsonRequest(
      { sql: "SELECT * FROM users" },
      { method: "POST", url: "/api/database/query" },
    );
    const { res, getStatus } = createMockHttpResponse();

    const runtime = {
      adapter: {
        db: {
          execute: vi.fn().mockResolvedValue({ rows: [], fields: [] }),
        },
      },
    } as unknown as AgentRuntime;

    await handleDatabaseRoute(req, res, runtime, "/api/database/query");

    expect(getStatus()).toBe(200);
    expect(runtime.adapter.db.execute).toHaveBeenCalled();
  });
});
