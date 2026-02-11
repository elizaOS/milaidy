import type http from "node:http";
import { describe, expect, it } from "vitest";
import { handleDatabaseRoute } from "./database.js";

type MockResponse = http.ServerResponse & {
  body: string;
  headers: Record<string, string>;
};

function createMockResponse(): MockResponse {
  const headers: Record<string, string> = {};
  const response: Partial<MockResponse> = {
    statusCode: 200,
    body: "",
    headers,
    setHeader(name: string, value: number | string | readonly string[]) {
      headers[name.toLowerCase()] = Array.isArray(value)
        ? value.join(",")
        : String(value);
      return response as MockResponse;
    },
    end(chunk?: unknown) {
      if (typeof chunk === "string") {
        response.body = chunk;
      } else if (Buffer.isBuffer(chunk)) {
        response.body = chunk.toString("utf8");
      } else if (chunk != null) {
        response.body = String(chunk);
      }
      return response as MockResponse;
    },
  };
  return response as MockResponse;
}

describe("handleDatabaseRoute", () => {
  it("returns 400 for malformed table name encoding", async () => {
    const req = { method: "PATCH" } as http.IncomingMessage;
    const res = createMockResponse();

    const handled = await handleDatabaseRoute(
      req,
      res,
      { adapter: {} } as never,
      "/api/database/tables/%E0%A4%A/rows",
    );

    expect(handled).toBe(true);
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({
      error: "Invalid table name: malformed URL encoding",
    });
  });
});
