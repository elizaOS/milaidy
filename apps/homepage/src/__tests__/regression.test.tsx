import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clearToken,
  fetchWithAuth,
  getToken,
  isAuthenticated,
  setToken,
} from "../lib/auth";
import {
  addConnection,
  getConnections,
  removeConnection,
} from "../lib/connections";

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.unstubAllGlobals();
});

/* ------------------------------------------------------------------ */
/*  Regression: auth state                                             */
/* ------------------------------------------------------------------ */
describe("Regression: auth state", () => {
  it("clearing token makes isAuthenticated return false", () => {
    setToken("abc");
    expect(isAuthenticated()).toBe(true);
    clearToken();
    expect(isAuthenticated()).toBe(false);
  });

  it("fetchWithAuth works without token (no header set)", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce({ ok: true, status: 200 });
    vi.stubGlobal("fetch", mockFetch);
    const res = await fetchWithAuth("http://example.com");
    expect(res.ok).toBe(true);
    const headers = mockFetch.mock.calls[0][1].headers;
    expect(headers.has("X-Api-Key")).toBe(false);
  });

  it("multiple setToken calls overwrite correctly", () => {
    setToken("first");
    setToken("second");
    setToken("third");
    expect(getToken()).toBe("third");
  });

  it("getToken returns null before any setToken", () => {
    expect(getToken()).toBeNull();
  });

  it("clearToken is idempotent", () => {
    clearToken();
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("setToken with empty string still counts as authenticated", () => {
    setToken("");
    // localStorage.getItem returns "" which is not null
    expect(isAuthenticated()).toBe(true);
  });
});

/* ------------------------------------------------------------------ */
/*  Regression: connections store                                      */
/* ------------------------------------------------------------------ */
describe("Regression: connections store", () => {
  it("handles corrupted localStorage gracefully", () => {
    localStorage.setItem("milady-connections", "not-json");
    expect(getConnections()).toEqual([]);
  });

  it("handles null localStorage value gracefully", () => {
    // getConnections should return empty array when key doesn't exist
    expect(getConnections()).toEqual([]);
  });

  it("addConnection generates unique IDs", () => {
    const c1 = addConnection({ name: "A", url: "http://a", type: "remote" });
    const c2 = addConnection({ name: "B", url: "http://b", type: "remote" });
    expect(c1.id).not.toBe(c2.id);
  });

  it("removeConnection on non-existent id is safe", () => {
    addConnection({ name: "A", url: "http://a", type: "remote" });
    removeConnection("non-existent-id");
    expect(getConnections()).toHaveLength(1);
  });

  it("preserves other connections when removing one", () => {
    const _c1 = addConnection({ name: "A", url: "http://a", type: "remote" });
    const c2 = addConnection({ name: "B", url: "http://b", type: "remote" });
    const _c3 = addConnection({ name: "C", url: "http://c", type: "remote" });
    removeConnection(c2.id);
    const remaining = getConnections();
    expect(remaining).toHaveLength(2);
    expect(remaining.map((c) => c.name)).toEqual(["A", "C"]);
  });

  it("stores connection type correctly", () => {
    addConnection({ name: "Local", url: "http://localhost", type: "local" });
    addConnection({ name: "Remote", url: "http://10.0.0.5", type: "remote" });
    const conns = getConnections();
    expect(conns[0].type).toBe("local");
    expect(conns[1].type).toBe("remote");
  });

  it("stores connection url correctly", () => {
    const url = "http://my-server.com:2138";
    addConnection({ name: "Test", url, type: "remote" });
    expect(getConnections()[0].url).toBe(url);
  });
});

/* ------------------------------------------------------------------ */
/*  Regression: routing                                                */
/* ------------------------------------------------------------------ */
describe("Regression: routing", () => {
  it("homepage at / renders top section", async () => {
    const { AppRoutes } = await import("../router");
    render(
      <MemoryRouter initialEntries={["/"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(document.querySelector("#top")).toBeTruthy();
  });

  it("dashboard at /dashboard has data-testid", async () => {
    localStorage.setItem("milady-cloud-token", "test-key");
    const { AppRoutes } = await import("../router");
    render(
      <MemoryRouter initialEntries={["/dashboard"]}>
        <AppRoutes />
      </MemoryRouter>,
    );
    expect(screen.getByTestId("dashboard")).toBeTruthy();
  });
});
