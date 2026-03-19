import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AgentCard } from "../components/dashboard/AgentCard";
import { AgentDetail } from "../components/dashboard/AgentDetail";
import { ConnectionModal } from "../components/dashboard/ConnectionModal";
import { LogsPanel } from "../components/dashboard/LogsPanel";
import { MetricsPanel } from "../components/dashboard/MetricsPanel";
import { Sidebar } from "../components/dashboard/Sidebar";
import type { AgentStatus } from "../lib/cloud-api";

vi.mock("../lib/AgentProvider", () => ({
  useAgents: () => ({
    agents: [
      {
        id: "local-default",
        name: "Test Agent",
        source: "local" as const,
        status: "running" as const,
        model: "gpt-4",
        sourceUrl: "http://localhost:2138",
        client: {
          exportAgent: vi.fn(),
          importAgent: vi.fn(),
        },
      },
    ],
    loading: false,
    cloudClient: null,
    refresh: vi.fn(),
    addRemoteUrl: vi.fn(),
    removeRemote: vi.fn(),
  }),
}));

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

/* ------------------------------------------------------------------ */
/*  Sidebar                                                           */
/* ------------------------------------------------------------------ */
describe("Sidebar", () => {
  it("renders section buttons", () => {
    const onChange = vi.fn();
    render(<Sidebar active="agents" onChange={onChange} />);

    for (const label of ["Agents", "Metrics", "Logs"]) {
      const buttons = screen.getAllByText(
        (_content, el) =>
          !!(el?.textContent?.includes(label) && el?.tagName === "BUTTON"),
      );
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("calls onChange with section id when clicked", () => {
    const onChange = vi.fn();
    render(<Sidebar active="agents" onChange={onChange} />);

    const metricsButtons = screen.getAllByText(
      (_content, el) =>
        !!(el?.textContent?.includes("Metrics") && el?.tagName === "BUTTON"),
    );
    fireEvent.click(metricsButtons[0]);
    expect(onChange).toHaveBeenCalledWith("metrics");

    const logsButtons = screen.getAllByText(
      (_content, el) =>
        !!(el?.textContent?.includes("Logs") && el?.tagName === "BUTTON"),
    );
    fireEvent.click(logsButtons[0]);
    expect(onChange).toHaveBeenCalledWith("logs");
  });
});

/* ------------------------------------------------------------------ */
/*  ConnectionModal                                                   */
/* ------------------------------------------------------------------ */
describe("ConnectionModal", () => {
  it("renders name and url inputs", () => {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(<ConnectionModal onSubmit={onSubmit} onClose={onClose} />);

    expect(screen.getByPlaceholderText("My Remote Agent")).toBeTruthy();
    expect(
      screen.getByPlaceholderText("https://my-agent.example.com"),
    ).toBeTruthy();
  });

  it("Connect button is disabled when name is empty", () => {
    const onSubmit = vi.fn();
    render(<ConnectionModal onSubmit={onSubmit} onClose={() => {}} />);

    const connectBtn = screen.getByText("Connect");
    expect(connectBtn).toBeDisabled();
  });

  it("Connect button is disabled when url is empty", () => {
    const onSubmit = vi.fn();
    render(<ConnectionModal onSubmit={onSubmit} onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("My Remote Agent"), {
      target: { value: "Test" },
    });

    const connectBtn = screen.getByText("Connect");
    expect(connectBtn).toBeDisabled();
  });

  it("calls onSubmit when Connect is clicked with valid inputs", () => {
    const onSubmit = vi.fn();
    render(<ConnectionModal onSubmit={onSubmit} onClose={() => {}} />);

    fireEvent.change(screen.getByPlaceholderText("My Remote Agent"), {
      target: { value: "Test Agent" },
    });
    fireEvent.change(
      screen.getByPlaceholderText("https://my-agent.example.com"),
      {
        target: { value: "http://10.0.0.5:2138" },
      },
    );

    const connectBtn = screen.getByText("Connect");
    expect(connectBtn).not.toBeDisabled();
    fireEvent.click(connectBtn);

    expect(onSubmit).toHaveBeenCalledWith({
      name: "Test Agent",
      url: "http://10.0.0.5:2138",
      type: "remote",
    });
  });
});

/* ------------------------------------------------------------------ */
/*  AgentCard                                                         */
/* ------------------------------------------------------------------ */
describe("AgentCard", () => {
  const baseProps = {
    source: "local" as const,
    onPlay: vi.fn(),
    onResume: vi.fn(),
    onPause: vi.fn(),
    onStop: vi.fn(),
    onSelect: vi.fn(),
    selected: false,
  };

  function makeAgent(overrides: Partial<AgentStatus> = {}): AgentStatus {
    return {
      agentName: "TestAgent",
      model: "gpt-4",
      state: "running",
      uptime: 3600,
      ...overrides,
    };
  }

  it("renders agent name, model, and state", () => {
    const { container } = render(
      <AgentCard {...baseProps} agent={makeAgent()} />,
    );
    expect(container.textContent).toContain("TestAgent");
    expect(container.textContent).toContain("gpt-4");
  });

  it("shows Start button when stopped", () => {
    render(
      <AgentCard {...baseProps} agent={makeAgent({ state: "stopped" })} />,
    );
    expect(screen.getByText("Start")).toBeTruthy();
    expect(screen.queryByText("Resume")).toBeNull();
    expect(screen.queryByText("Pause")).toBeNull();
  });

  it("shows Resume button when paused", () => {
    render(<AgentCard {...baseProps} agent={makeAgent({ state: "paused" })} />);
    expect(screen.getByText("Resume")).toBeTruthy();
    expect(screen.queryByText("Start")).toBeNull();
  });

  it("shows Pause button when running", () => {
    render(
      <AgentCard {...baseProps} agent={makeAgent({ state: "running" })} />,
    );
    expect(screen.getByText("Pause")).toBeTruthy();
    expect(screen.queryByText("Start")).toBeNull();
    expect(screen.queryByText("Resume")).toBeNull();
  });

  it("calls onStop when Stop is clicked", () => {
    const onStop = vi.fn();
    render(
      <AgentCard
        {...baseProps}
        onStop={onStop}
        agent={makeAgent({ state: "running" })}
      />,
    );
    fireEvent.click(screen.getByText("Stop"));
    expect(onStop).toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------ */
/*  MetricsPanel                                                      */
/* ------------------------------------------------------------------ */
describe("MetricsPanel", () => {
  it("renders CPU, Memory, and Disk metric bars", () => {
    const { container } = render(<MetricsPanel />);
    expect(container.textContent).toContain("CPU");
    expect(container.textContent).toContain("Memory");
    expect(container.textContent).toContain("Disk");
  });
});

/* ------------------------------------------------------------------ */
/*  LogsPanel                                                         */
/* ------------------------------------------------------------------ */
describe("LogsPanel", () => {
  it("renders log entries with timestamps and severity levels", () => {
    const { container } = render(<LogsPanel />);
    const text = container.textContent ?? "";
    const hasLevel =
      text.includes("info") || text.includes("warn") || text.includes("error");
    expect(hasLevel).toBe(true);
    expect(text).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});

/* ------------------------------------------------------------------ */
/*  ExportPanel                                                       */
/* ------------------------------------------------------------------ */
describe("ExportPanel", () => {
  it("renders password input and export/import buttons", async () => {
    const { ExportPanel } = await import("../components/dashboard/ExportPanel");
    const { container } = render(<ExportPanel connectionId="local-default" />);
    const text = container.textContent ?? "";
    expect(text).toContain("Password");
    expect(screen.getByText("Export Agent")).toBeTruthy();
    expect(screen.getByText("Import Agent")).toBeTruthy();
  });

  it("Export button is disabled when password < 4 chars", async () => {
    const { ExportPanel } = await import("../components/dashboard/ExportPanel");
    render(<ExportPanel connectionId="local-default" />);
    const exportBtn = screen.getByText("Export Agent");
    expect(exportBtn).toBeDisabled();

    const pwInput = screen.getByLabelText("Password (min 4 chars)");
    fireEvent.change(pwInput, { target: { value: "abc" } });
    expect(screen.getByText("Export Agent")).toBeDisabled();

    fireEvent.change(pwInput, { target: { value: "abcd" } });
    expect(screen.getByText("Export Agent")).not.toBeDisabled();
  });
});

/* ------------------------------------------------------------------ */
/*  AgentDetail                                                        */
/* ------------------------------------------------------------------ */
describe("AgentDetail", () => {
  const agent: AgentStatus = {
    agentName: "Detail Agent",
    model: "claude-3",
    state: "running",
    uptime: 7200,
  };

  const managedAgent = {
    id: "local-default",
    name: "Detail Agent",
    source: "local" as const,
    status: "running" as const,
    model: "claude-3",
    uptime: 7200,
  };

  it("renders Overview tab by default", () => {
    const { container } = render(
      <AgentDetail
        agent={agent}
        managedAgent={managedAgent}
        connectionId="local-default"
      />,
    );
    expect(container.textContent).toContain("Status");
    expect(container.textContent).toContain("Model");
  });

  it("shows agent name in header", () => {
    const { container } = render(
      <AgentDetail
        agent={agent}
        managedAgent={managedAgent}
        connectionId="local-default"
      />,
    );
    expect(container.textContent).toContain("Detail Agent");
  });

  it("renders all tab buttons", () => {
    render(
      <AgentDetail
        agent={agent}
        managedAgent={managedAgent}
        connectionId="local-default"
      />,
    );
    expect(screen.getByText("Overview")).toBeTruthy();
    expect(screen.getByText("Metrics")).toBeTruthy();
    expect(screen.getByText("Logs")).toBeTruthy();
    expect(screen.getByText("Snapshots")).toBeTruthy();
  });

  it("switches to Logs tab", () => {
    const { container } = render(
      <AgentDetail
        agent={agent}
        managedAgent={managedAgent}
        connectionId="local-default"
      />,
    );
    fireEvent.click(screen.getByText("Logs"));
    const text = container.textContent ?? "";
    const hasLevel =
      text.includes("info") || text.includes("warn") || text.includes("error");
    expect(hasLevel).toBe(true);
  });

  it("switches to Snapshots tab", () => {
    render(
      <AgentDetail
        agent={agent}
        managedAgent={managedAgent}
        connectionId="local-default"
      />,
    );
    fireEvent.click(screen.getByText("Snapshots"));
    expect(screen.getByText("Export Agent")).toBeTruthy();
  });
});

/* ------------------------------------------------------------------ */
/*  AgentCard — regression tests                                       */
/* ------------------------------------------------------------------ */
describe("AgentCard regression", () => {
  const baseProps = {
    source: "local" as const,
    onPlay: vi.fn(),
    onResume: vi.fn(),
    onPause: vi.fn(),
    onStop: vi.fn(),
    onSelect: vi.fn(),
    selected: false,
  };

  function makeAgent(overrides: Partial<AgentStatus> = {}): AgentStatus {
    return {
      agentName: "TestAgent",
      model: "gpt-4",
      state: "running",
      uptime: 3600,
      ...overrides,
    };
  }

  it("does not show Stop button when already stopped", () => {
    render(
      <AgentCard {...baseProps} agent={makeAgent({ state: "stopped" })} />,
    );
    expect(screen.queryByText("Stop")).toBeNull();
  });

  it("shows both Pause and Stop for running agent", () => {
    render(
      <AgentCard {...baseProps} agent={makeAgent({ state: "running" })} />,
    );
    expect(screen.getByText("Pause")).toBeTruthy();
    expect(screen.getByText("Stop")).toBeTruthy();
  });

  it("shows Stop button for paused agent", () => {
    render(<AgentCard {...baseProps} agent={makeAgent({ state: "paused" })} />);
    expect(screen.getByText("Stop")).toBeTruthy();
  });

  it("displays uptime formatted correctly (hours and minutes)", () => {
    const { container } = render(
      <AgentCard {...baseProps} agent={makeAgent({ uptime: 3660 })} />,
    );
    expect(container.textContent).toContain("1h 1m");
  });

  it("displays uptime as minutes only when less than an hour", () => {
    const { container } = render(
      <AgentCard {...baseProps} agent={makeAgent({ uptime: 300 })} />,
    );
    expect(container.textContent).toContain("5m");
  });

  it("displays dash when uptime is 0 or undefined", () => {
    const { container } = render(
      <AgentCard {...baseProps} agent={makeAgent({ uptime: 0 })} />,
    );
    expect(container.textContent).toContain("\u2014");
  });

  it("displays memory count when provided", () => {
    const { container } = render(
      <AgentCard {...baseProps} agent={makeAgent({ memories: 42 })} />,
    );
    expect(container.textContent).toContain("42");
  });

  it("shows source label", () => {
    const { container } = render(
      <AgentCard {...baseProps} source="cloud" agent={makeAgent()} />,
    );
    expect(container.textContent).toContain("Cloud");
  });

  it("calls onSelect when card is clicked", () => {
    const onSelect = vi.fn();
    const { container } = render(
      <AgentCard {...baseProps} onSelect={onSelect} agent={makeAgent()} />,
    );
    fireEvent.click(container.firstChild as HTMLElement);
    expect(onSelect).toHaveBeenCalled();
  });

  it("calls onPlay when Start button is clicked on stopped agent", () => {
    const onPlay = vi.fn();
    render(
      <AgentCard
        {...baseProps}
        onPlay={onPlay}
        agent={makeAgent({ state: "stopped" })}
      />,
    );
    fireEvent.click(screen.getByText("Start"));
    expect(onPlay).toHaveBeenCalled();
  });

  it("calls onPause when Pause button is clicked on running agent", () => {
    const onPause = vi.fn();
    render(
      <AgentCard
        {...baseProps}
        onPause={onPause}
        agent={makeAgent({ state: "running" })}
      />,
    );
    fireEvent.click(screen.getByText("Pause"));
    expect(onPause).toHaveBeenCalled();
  });

  it("calls onResume when Resume button is clicked on paused agent", () => {
    const onResume = vi.fn();
    render(
      <AgentCard
        {...baseProps}
        onResume={onResume}
        agent={makeAgent({ state: "paused" })}
      />,
    );
    fireEvent.click(screen.getByText("Resume"));
    expect(onResume).toHaveBeenCalled();
  });

  it("applies selected styling when selected is true", () => {
    const { container } = render(
      <AgentCard {...baseProps} selected={true} agent={makeAgent()} />,
    );
    const card = container.firstChild as HTMLElement;
    expect(card.className).toContain("ring-2");
  });
});

/* ------------------------------------------------------------------ */
/*  AuthGate                                                           */
/* ------------------------------------------------------------------ */
describe("AuthGate", () => {
  it("renders children when authenticated", async () => {
    localStorage.setItem("milady-cloud-token", "test-key");
    let result: ReturnType<typeof render>;
    await act(async () => {
      const { AuthGate } = await import("../components/dashboard/AuthGate");
      result = render(
        <AuthGate>
          <div>Dashboard Content</div>
        </AuthGate>,
      );
    });
    expect(result?.getByText("Dashboard Content")).toBeTruthy();
  });

  it("renders children when not authenticated", async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      const { AuthGate } = await import("../components/dashboard/AuthGate");
      result = render(
        <AuthGate>
          <div>Dashboard Content</div>
        </AuthGate>,
      );
    });
    expect(result?.getByText("Dashboard Content")).toBeTruthy();
  });

  it("does not block the dashboard anymore", async () => {
    let result: ReturnType<typeof render>;
    await act(async () => {
      const { AuthGate } = await import("../components/dashboard/AuthGate");
      result = render(
        <AuthGate>
          <div>child</div>
        </AuthGate>,
      );
    });
    expect(result?.queryByText("Sign in with Eliza Cloud")).toBeNull();
    expect(result?.getByText("child")).toBeTruthy();
  });
});
