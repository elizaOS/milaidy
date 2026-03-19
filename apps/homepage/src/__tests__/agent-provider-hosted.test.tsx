import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("AgentProvider hosted fallback", () => {
  beforeEach(() => {
    mockFetch.mockReset();
    localStorage.clear();
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.resetModules();
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.useRealTimers();
  });

  async function loadHostedProvider() {
    vi.doMock("../lib/runtime-config", async () => {
      const actual = await vi.importActual<
        typeof import("../lib/runtime-config")
      >("../lib/runtime-config");
      return {
        ...actual,
        getSameHostSandboxDiscoveryUrl: () => null,
      };
    });

    return import("../lib/AgentProvider");
  }

  it("does not query public sandbox discovery on hosted auth failure", async () => {
    const { AgentProvider, useAgents } = await loadHostedProvider();
    const { setToken } = await import("../lib/auth");

    function TestConsumer() {
      const { agents, loading } = useAgents();
      return (
        <div>
          <span data-testid="loading">{String(loading)}</span>
          <span data-testid="count">{agents.length}</span>
        </div>
      );
    }

    setToken("stale-key");
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/api/v1/milady/agents")) {
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({ error: "Invalid or expired API key" }),
          text: () => Promise.resolve("Invalid or expired API key"),
        });
      }
      if (url.includes("sandboxes.waifu.fun/agents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              {
                id: "public-1",
                agent_name: "everyone-agent",
                web_ui_port: 3000,
              },
            ]),
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

    expect(result?.getByTestId("count").textContent).toBe("0");
    expect(result?.getByTestId("loading").textContent).toBe("false");
    expect(
      mockFetch.mock.calls.some((call) =>
        String(call[0]).includes("sandboxes.waifu.fun/agents"),
      ),
    ).toBe(false);
  });

  it("derives hosted cloud web UI URLs from stable UUIDs when webUiUrl is missing", async () => {
    const { AgentProvider, useAgents } = await loadHostedProvider();
    const { setToken } = await import("../lib/auth");

    function TestConsumer() {
      const { agents } = useAgents();
      return (
        <div>
          {agents.map((a) => (
            <span key={a.id} data-testid={`agent-${a.id}`}>
              {a.name}|{a.source}|{a.status}|{a.webUiUrl ?? ""}
            </span>
          ))}
        </div>
      );
    }

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
                  id: "44444444-4444-4444-4444-444444444444",
                  agentName: "Derived UI Agent",
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

    expect(
      result?.getByTestId(
        "agent-cloud-44444444-4444-4444-4444-444444444444",
      ).textContent,
    ).toContain(
      "Derived UI Agent|cloud|running|https://44444444-4444-4444-4444-444444444444.milady.ai",
    );
  });
});
