import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearToken, CLOUD_AUTH_CHANGED_EVENT, setToken } from "../lib/auth";
import { getCloudTokenStorageKey } from "../lib/runtime-config";
import { useAuth } from "../lib/useAuth";

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

afterEach(() => {
  localStorage.clear();
});

describe("useAuth", () => {
  it("returns unauthenticated state when no token", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
    expect(typeof result.current.signOut).toBe("function");
  });

  it("reflects token after setToken", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(false);

    act(() => {
      setToken("test-api-key");
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe("test-api-key");
  });

  it("updates on clearToken", () => {
    setToken("initial-token");
    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe("initial-token");

    act(() => {
      clearToken();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
  });

  it("signOut function clears token", () => {
    setToken("to-be-cleared");
    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(true);

    act(() => {
      result.current.signOut();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.token).toBeNull();
  });

  it("updates on cross-tab storage events", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(false);

    // Simulate another tab setting the token
    act(() => {
      const tokenKey = getCloudTokenStorageKey();
      localStorage.setItem(tokenKey, "cross-tab-token");
      window.dispatchEvent(
        new StorageEvent("storage", {
          key: tokenKey,
          newValue: "cross-tab-token",
          oldValue: null,
        }),
      );
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe("cross-tab-token");
  });

  it("updates on CLOUD_AUTH_CHANGED_EVENT", () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(false);

    // Manually set localStorage and dispatch the event
    act(() => {
      const tokenKey = getCloudTokenStorageKey();
      localStorage.setItem(tokenKey, "event-token");
      window.dispatchEvent(new Event(CLOUD_AUTH_CHANGED_EVENT));
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.token).toBe("event-token");
  });

  it("returns stable reference when auth state unchanged", () => {
    setToken("stable-token");
    const { result, rerender } = renderHook(() => useAuth());

    const firstIsAuth = result.current.isAuthenticated;
    const firstToken = result.current.token;

    rerender();

    // Values should be the same
    expect(result.current.isAuthenticated).toBe(firstIsAuth);
    expect(result.current.token).toBe(firstToken);
  });

  it("cleans up event listeners on unmount", () => {
    const addSpy = vi.spyOn(window, "addEventListener");
    const removeSpy = vi.spyOn(window, "removeEventListener");

    const { unmount } = renderHook(() => useAuth());

    // Should have added listeners
    expect(addSpy).toHaveBeenCalledWith(
      CLOUD_AUTH_CHANGED_EVENT,
      expect.any(Function),
    );
    expect(addSpy).toHaveBeenCalledWith("storage", expect.any(Function));

    unmount();

    // Should have removed listeners
    expect(removeSpy).toHaveBeenCalledWith(
      CLOUD_AUTH_CHANGED_EVENT,
      expect.any(Function),
    );
    expect(removeSpy).toHaveBeenCalledWith("storage", expect.any(Function));
  });
});
