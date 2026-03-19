import { act, cleanup, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("AgentProvider self-host discovery", () => {
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

  it("uses same-host discovery for self-hosted dashboards without touching the public index", async () => {
    vi.doMock("../lib/runtime-config", async () => {
      const actual = await vi.importActual<
        typeof import("../lib/runtime-config")
      >("../lib/runtime-config");
      return {
        ...actual,
        getSameHostSandboxDiscoveryUrl: () =>
          "https://selfhost.example:3456/agents",
      };
    });

    const { AgentProvider, useAgents } = await import("../lib/AgentProvider");

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

    mockFetch.mockImplementation((url: string) => {
      if (url.includes("https://selfhost.example:3456/agents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve([
              {
                id: "33333333-3333-3333-3333-333333333333",
                agent_name: "Self Host Agent",
                web_ui_port: 3000,
              },
            ]),
        });
      }
      if (url.includes("https://selfhost.example:3000/api/health")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ ready: true, status: "ok", uptime: 10 }),
        });
      }
      if (url.includes("https://selfhost.example:3000/api/status")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({
              state: "running",
              agentName: "Self Host Agent",
              model: "gpt-4.1",
              uptime: 10,
              memories: 7,
            }),
        });
      }
      if (url.includes("sandboxes.waifu.fun/agents")) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve([]),
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

    expect(result?.getByTestId("loading").textContent).toBe("false");
    expect(result?.getByTestId("count").textContent).toBe("1");
    expect(
      result?.getByTestId(
        "agent-milady-33333333-3333-3333-3333-333333333333",
      ).textContent,
    ).toContain("Self Host Agent|remote|running");
    expect(
      mockFetch.mock.calls.some((call) =>
        String(call[0]).includes("https://selfhost.example:3456/agents"),
      ),
    ).toBe(true);
    expect(
      mockFetch.mock.calls.some((call) =>
        String(call[0]).includes("sandboxes.waifu.fun/agents"),
      ),
    ).toBe(false);
  });
});
