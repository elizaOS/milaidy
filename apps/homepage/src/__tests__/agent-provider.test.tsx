import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentProvider, useAgents } from "../lib/AgentProvider";
import { setToken } from "../lib/auth";

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
  const { agents, loading } = useAgents();
  return (
    <div>
      <span data-testid="loading">{String(loading)}</span>
      <span data-testid="count">{agents.length}</span>
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
});
