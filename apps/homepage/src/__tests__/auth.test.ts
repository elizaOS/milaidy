import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { getToken, setToken, clearToken, isAuthenticated } from "../lib/auth";

beforeEach(() => localStorage.clear());
afterEach(() => localStorage.clear());

describe("auth", () => {
  it("stores and retrieves token", () => {
    setToken("test-api-key");
    expect(getToken()).toBe("test-api-key");
  });

  it("clears token", () => {
    setToken("test-api-key");
    clearToken();
    expect(getToken()).toBeNull();
  });

  it("isAuthenticated returns false when no token", () => {
    expect(isAuthenticated()).toBe(false);
  });

  it("isAuthenticated returns true when token exists", () => {
    setToken("test-api-key");
    expect(isAuthenticated()).toBe(true);
  });
});
