import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentProvider, useAgents } from "../lib/AgentProvider";
import { CLOUD_AUTH_CHANGED_EVENT, clearToken, setToken } from "../lib/auth";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

beforeEach(() => {
  mockFetch.mockReset();
  localStorage.clear();
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.useRealTimers();
});

function TestConsumer() {
  const { agents, loading, isRefreshing, error, clearError, refresh } =
    useAgents();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="refreshing">{String(isRefreshing)}</span>
      <span data-testid="error">{error ?? ""}</span>
      <span data-testid="count">{agents.length}</span>
      <button type="button" data-testid="refresh" onClick={() => refresh()} />
      <button
        type="button"
        data-testid="clear-error"
        onClick={() => clearError()}
      />
      {agents.map((a) => (
        <span key={a.id} data-testid={`agent-${a.id}`}>
          {a.name}|{a.source}|{a.status}
        </span>
      ))}
    </div>
  );
}

describe("AgentProvider", () => {
  it("starts in loading state when authenticated and cloud fetch is pending", () => {
    setToken("test-key");
    // Mock fetch to hang so loading stays true
    mockFetch.mockReturnValue(new Promise(() => {}));
    const { getByTestId } = render(
      <AgentProvider>
        <TestConsumer />
      </AgentProvider>,
    );
    expect(getByTestId("loading").textContent).toBe("true");
  });

  it("shows no agents when not authenticated", async () => {
    mockFetch.mockRejectedValue(new Error("connection refused"));
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AgentProvider>
          <TestConsumer />
        </AgentProvider>,
      );
      await vi.advanceTimersByTimeAsync(50);
    });
    expect(result?.getByTestId("count").textContent).toBe("0");
    expect(result?.getByTestId("loading").textContent).toBe("false");
  });

  it("fetches cloud agents when authenticated", async () => {
    setToken("test-key");
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/v1/milady/agents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: [
                {
                  id: "a1",
                  agentName: "Cloud Agent 1",
                  status: "running",
                  model: "gpt-4",
                },
                {
                  id: "a2",
                  agentName: "Cloud Agent 2",
                  status: "suspended",
                  model: "claude",
                },
              ],
            }),
        });
      }
      return Promise.reject(new Error("connection refused"));
    });

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AgentProvider>
          <TestConsumer />
        </AgentProvider>,
      );
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result?.getByTestId("count").textContent).toBe("2");
    expect(result?.getByTestId("agent-cloud-a1").textContent).toContain(
      "Cloud Agent 1|cloud|running",
    );
    expect(result?.getByTestId("agent-cloud-a2").textContent).toContain(
      "Cloud Agent 2|cloud|paused",
    );
  });

  it("silently skips cloud agents when cloud API fails", async () => {
    setToken("test-key");
    mockFetch.mockRejectedValue(new Error("network error"));

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AgentProvider>
          <TestConsumer />
        </AgentProvider>,
      );
      await vi.advanceTimersByTimeAsync(100);
    });
    // Cloud-only mode: no agents if cloud API fails
    expect(result?.getByTestId("count").textContent).toBe("0");
  });

  it("maps cloud status strings correctly", async () => {
    setToken("test-key");
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/v1/milady/agents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: [
                { id: "r", agentName: "R", status: "active" },
                { id: "p", agentName: "P", status: "suspended" },
                { id: "s", agentName: "S", status: "terminated" },
                { id: "v", agentName: "V", status: "creating" },
                { id: "u", agentName: "U", status: "weird-state" },
                { id: "h", agentName: "H", status: "healthy" },
                { id: "d", agentName: "D", status: "deleted" },
                { id: "st", agentName: "ST", status: "starting" },
              ],
            }),
        });
      }
      return Promise.reject(new Error("offline"));
    });

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AgentProvider>
          <TestConsumer />
        </AgentProvider>,
      );
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result?.getByTestId("agent-cloud-r").textContent).toContain(
      "|running",
    );
    expect(result?.getByTestId("agent-cloud-p").textContent).toContain(
      "|paused",
    );
    expect(result?.getByTestId("agent-cloud-s").textContent).toContain(
      "|stopped",
    );
    expect(result?.getByTestId("agent-cloud-v").textContent).toContain(
      "|provisioning",
    );
    expect(result?.getByTestId("agent-cloud-u").textContent).toContain(
      "|unknown",
    );
    expect(result?.getByTestId("agent-cloud-h").textContent).toContain(
      "|running",
    );
    expect(result?.getByTestId("agent-cloud-d").textContent).toContain(
      "|stopped",
    );
    expect(result?.getByTestId("agent-cloud-st").textContent).toContain(
      "|provisioning",
    );
  });

  it("uses agent id as name fallback when name is empty", async () => {
    setToken("test-key");
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/v1/milady/agents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: [{ id: "no-name-id", agentName: "", status: "running" }],
            }),
        });
      }
      return Promise.reject(new Error("offline"));
    });

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AgentProvider>
          <TestConsumer />
        </AgentProvider>,
      );
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result?.getByTestId("agent-cloud-no-name-id").textContent).toContain(
      "no-name-id|cloud|",
    );
  });

  it("throws when useAgents is used outside of provider", () => {
    function Orphan() {
      useAgents();
      return null;
    }
    expect(() => render(<Orphan />)).toThrow(
      "useAgents must be used within AgentProvider",
    );
  });

  it("discovers cloud agents when token is set mid-session (after login)", async () => {
    mockFetch.mockRejectedValue(new Error("connection refused"));
    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AgentProvider>
          <TestConsumer />
        </AgentProvider>,
      );
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result?.getByTestId("count").textContent).toBe("0");

    setToken("new-api-key");
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/v1/milady/agents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: [
                {
                  id: "mid-1",
                  agentName: "Post-Login Agent",
                  status: "running",
                },
              ],
            }),
        });
      }
      return Promise.reject(new Error("offline"));
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(31000);
    });
    expect(result?.getByTestId("count").textContent).toBe("1");
    expect(result?.getByTestId("agent-cloud-mid-1").textContent).toContain(
      "Post-Login Agent|cloud|running",
    );
  });

  it("unwraps { success, data } envelope from cloud API", async () => {
    setToken("test-key");
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/v1/milady/agents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: [
                { id: "env-1", agentName: "Envelope Agent", status: "running" },
              ],
            }),
        });
      }
      return Promise.reject(new Error("offline"));
    });

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AgentProvider>
          <TestConsumer />
        </AgentProvider>,
      );
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result?.getByTestId("count").textContent).toBe("1");
    expect(result?.getByTestId("agent-cloud-env-1").textContent).toContain(
      "Envelope Agent|cloud|running",
    );
  });

  it("uses agentName field over name field", async () => {
    setToken("test-key");
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/v1/milady/agents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: [
                {
                  id: "an-1",
                  agentName: "Real Name",
                  name: "Old Name",
                  status: "running",
                },
              ],
            }),
        });
      }
      return Promise.reject(new Error("offline"));
    });

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AgentProvider>
          <TestConsumer />
        </AgentProvider>,
      );
      await vi.advanceTimersByTimeAsync(100);
    });
    expect(result?.getByTestId("agent-cloud-an-1").textContent).toContain(
      "Real Name|cloud|",
    );
  });

  it("stale unauthenticated fetch does not overwrite post-login agents", async () => {
    // Start without token — a slow fetch begins returning empty agents
    let slowResolve: (() => void) | null = null;
    const slowPromise = new Promise<void>((resolve) => {
      slowResolve = resolve;
    });

    mockFetch.mockImplementation(() => {
      // First fetch (unauthenticated) will be slow
      return slowPromise.then(() =>
        Promise.reject(new Error("connection refused")),
      );
    });

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AgentProvider>
          <TestConsumer />
        </AgentProvider>,
      );
      // Initial fetch is in flight but not resolved
      await vi.advanceTimersByTimeAsync(10);
    });

    // User logs in before the slow fetch completes
    act(() => {
      setToken("new-api-key");
    });

    // Switch to fast response for authenticated fetch
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/v1/milady/agents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: [
                {
                  id: "post-login",
                  agentName: "Authenticated Agent",
                  status: "running",
                },
              ],
            }),
        });
      }
      return Promise.reject(new Error("offline"));
    });

    // Auth change triggers immediate fetch
    await act(async () => {
      window.dispatchEvent(new Event(CLOUD_AUTH_CHANGED_EVENT));
      await vi.advanceTimersByTimeAsync(50);
    });

    // Agents from authenticated fetch should be present
    expect(result?.getByTestId("count").textContent).toBe("1");
    expect(result?.getByTestId("agent-cloud-post-login").textContent).toContain(
      "Authenticated Agent|cloud|running",
    );

    // Now the slow unauthenticated fetch completes
    await act(async () => {
      slowResolve?.();
      await vi.advanceTimersByTimeAsync(50);
    });

    // Agents should still be the authenticated ones (stale fetch discarded)
    expect(result?.getByTestId("count").textContent).toBe("1");
    expect(result?.getByTestId("agent-cloud-post-login").textContent).toContain(
      "Authenticated Agent|cloud|running",
    );
  });

  it("stale authenticated fetch does not resurrect agents after sign-out", async () => {
    setToken("test-key");

    let slowResolve: (() => void) | null = null;
    const slowPromise = new Promise<void>((resolve) => {
      slowResolve = resolve;
    });

    // Authenticated fetch will be slow
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/v1/milady/agents")) {
        return slowPromise.then(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                success: true,
                data: [
                  {
                    id: "old-agent",
                    agentName: "Old Authenticated Agent",
                    status: "running",
                  },
                ],
              }),
          }),
        );
      }
      return Promise.reject(new Error("offline"));
    });

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AgentProvider>
          <TestConsumer />
        </AgentProvider>,
      );
      // Initial fetch is in flight but not resolved
      await vi.advanceTimersByTimeAsync(10);
    });

    // User signs out before the slow fetch completes
    act(() => {
      clearToken();
    });

    // Switch to fast response for unauthenticated fetch (no agents)
    mockFetch.mockImplementation(() => {
      return Promise.reject(new Error("connection refused"));
    });

    // Auth change triggers immediate fetch
    await act(async () => {
      window.dispatchEvent(new Event(CLOUD_AUTH_CHANGED_EVENT));
      await vi.advanceTimersByTimeAsync(50);
    });

    // No agents should be present after sign-out
    expect(result?.getByTestId("count").textContent).toBe("0");

    // Now the slow authenticated fetch completes
    await act(async () => {
      slowResolve?.();
      await vi.advanceTimersByTimeAsync(50);
    });

    // Agents should still be empty (stale fetch discarded, agents not resurrected)
    expect(result?.getByTestId("count").textContent).toBe("0");
  });

  it("refreshes agents immediately on auth change event", async () => {
    mockFetch.mockRejectedValue(new Error("connection refused"));

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AgentProvider>
          <TestConsumer />
        </AgentProvider>,
      );
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(result?.getByTestId("count").textContent).toBe("0");

    // User logs in
    setToken("auth-key");
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/v1/milady/agents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: [
                {
                  id: "event-agent",
                  agentName: "Event Agent",
                  status: "running",
                },
              ],
            }),
        });
      }
      return Promise.reject(new Error("offline"));
    });

    // Dispatch auth change event — should trigger immediate refresh, not wait 30s
    await act(async () => {
      window.dispatchEvent(new Event(CLOUD_AUTH_CHANGED_EVENT));
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result?.getByTestId("count").textContent).toBe("1");
    expect(
      result?.getByTestId("agent-cloud-event-agent").textContent,
    ).toContain("Event Agent|cloud|running");
  });

  it("sets isRefreshing during fetch and clears it after", async () => {
    setToken("test-key");
    let resolveAgents: (() => void) | null = null;
    const agentsPromise = new Promise<void>((resolve) => {
      resolveAgents = resolve;
    });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/v1/milady/agents")) {
        return agentsPromise.then(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                success: true,
                data: [{ id: "r1", agentName: "Agent", status: "running" }],
              }),
          }),
        );
      }
      return Promise.reject(new Error("offline"));
    });

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AgentProvider>
          <TestConsumer />
        </AgentProvider>,
      );
      await vi.advanceTimersByTimeAsync(10);
    });

    // While fetch is in progress, isRefreshing should be true
    expect(result?.getByTestId("refreshing").textContent).toBe("true");

    // Resolve the fetch
    await act(async () => {
      resolveAgents?.();
      await vi.advanceTimersByTimeAsync(50);
    });

    // After fetch completes, isRefreshing should be false
    expect(result?.getByTestId("refreshing").textContent).toBe("false");
    expect(result?.getByTestId("loading").textContent).toBe("false");
  });

  it("does not set loading to true on interval refetches", async () => {
    setToken("test-key");
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/v1/milady/agents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: [{ id: "a1", agentName: "Agent 1", status: "running" }],
            }),
        });
      }
      return Promise.reject(new Error("offline"));
    });

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AgentProvider>
          <TestConsumer />
        </AgentProvider>,
      );
      await vi.advanceTimersByTimeAsync(100);
    });

    // Initial load complete
    expect(result?.getByTestId("loading").textContent).toBe("false");
    expect(result?.getByTestId("count").textContent).toBe("1");

    // Make fetch slow for the interval refetch
    let resolveInterval: (() => void) | null = null;
    const intervalPromise = new Promise<void>((resolve) => {
      resolveInterval = resolve;
    });

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/v1/milady/agents")) {
        return intervalPromise.then(() =>
          Promise.resolve({
            ok: true,
            status: 200,
            json: () =>
              Promise.resolve({
                success: true,
                data: [{ id: "a1", agentName: "Agent 1", status: "running" }],
              }),
          }),
        );
      }
      return Promise.reject(new Error("offline"));
    });

    // Trigger interval refetch
    await act(async () => {
      await vi.advanceTimersByTimeAsync(30000);
      await vi.advanceTimersByTimeAsync(10);
    });

    // During interval refetch, loading should stay false (only isRefreshing is true)
    expect(result?.getByTestId("loading").textContent).toBe("false");
    expect(result?.getByTestId("refreshing").textContent).toBe("true");

    // Resolve the interval fetch
    await act(async () => {
      resolveInterval?.();
      await vi.advanceTimersByTimeAsync(50);
    });

    expect(result?.getByTestId("refreshing").textContent).toBe("false");
  });

  it("captures cloud API errors and exposes them via error state", async () => {
    setToken("test-key");
    mockFetch.mockRejectedValue(new Error("Network timeout"));

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AgentProvider>
          <TestConsumer />
        </AgentProvider>,
      );
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result?.getByTestId("error").textContent).toContain("Cloud API");
    expect(result?.getByTestId("error").textContent).toContain(
      "Network timeout",
    );
  });

  it("clears error when clearError is called", async () => {
    setToken("test-key");
    mockFetch.mockRejectedValue(new Error("Network timeout"));

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AgentProvider>
          <TestConsumer />
        </AgentProvider>,
      );
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result?.getByTestId("error").textContent).toContain("Cloud API");

    // Clear the error
    await act(async () => {
      result?.getByTestId("clear-error").click();
    });

    expect(result?.getByTestId("error").textContent).toBe("");
  });

  it("clears error on successful fetch", async () => {
    setToken("test-key");
    mockFetch.mockRejectedValue(new Error("Network timeout"));

    let result: ReturnType<typeof render>;
    await act(async () => {
      result = render(
        <AgentProvider>
          <TestConsumer />
        </AgentProvider>,
      );
      await vi.advanceTimersByTimeAsync(100);
    });

    expect(result?.getByTestId("error").textContent).toContain("Cloud API");

    // Make next fetch succeed
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/v1/milady/agents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              success: true,
              data: [{ id: "a1", agentName: "Agent", status: "running" }],
            }),
        });
      }
      return Promise.reject(new Error("offline"));
    });

    // Trigger manual refresh
    await act(async () => {
      result?.getByTestId("refresh").click();
      await vi.advanceTimersByTimeAsync(100);
    });

    // Error should be cleared after successful fetch
    expect(result?.getByTestId("error").textContent).toBe("");
    expect(result?.getByTestId("count").textContent).toBe("1");
  });
});
