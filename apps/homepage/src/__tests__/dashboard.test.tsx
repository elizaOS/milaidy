import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "../components/dashboard/Sidebar";
import { ConnectionModal } from "../components/dashboard/ConnectionModal";
import { AgentCard } from "../components/dashboard/AgentCard";
import { MetricsPanel } from "../components/dashboard/MetricsPanel";
import { LogsPanel } from "../components/dashboard/LogsPanel";
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

afterEach(cleanup);

/* ------------------------------------------------------------------ */
/*  Sidebar                                                           */
/* ------------------------------------------------------------------ */
describe("Sidebar", () => {
  it("renders all 5 section buttons", () => {
    const onChange = vi.fn();
    render(<Sidebar active="agents" onChange={onChange} />);

    for (const label of ["Agents", "Metrics", "Logs", "Export", "Billing"]) {
      const buttons = screen.getAllByText((_content, el) =>
        el?.textContent?.includes(label) && el?.tagName === "BUTTON"
          ? true
          : false,
      );
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    }
  });

  it("calls onChange with section id when clicked", () => {
    const onChange = vi.fn();
    render(<Sidebar active="agents" onChange={onChange} />);

    // Click the first "Metrics" button (desktop sidebar)
    const metricsButtons = screen.getAllByText((_content, el) =>
      el?.textContent?.includes("Metrics") && el?.tagName === "BUTTON"
        ? true
        : false,
    );
    fireEvent.click(metricsButtons[0]);
    expect(onChange).toHaveBeenCalledWith("metrics");

    const logsButtons = screen.getAllByText((_content, el) =>
      el?.textContent?.includes("Logs") && el?.tagName === "BUTTON"
        ? true
        : false,
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
    expect(screen.getByPlaceholderText("http://10.0.0.5:2138")).toBeTruthy();
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

    // Fill name but leave url empty (url starts empty now)
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
    fireEvent.change(screen.getByPlaceholderText("http://10.0.0.5:2138"), {
      target: { value: "http://10.0.0.5:2138" },
    });

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
    connectionName: "Local",
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
    expect(container.textContent).toContain("running");
  });

  it("shows Play button when stopped", () => {
    render(
      <AgentCard {...baseProps} agent={makeAgent({ state: "stopped" })} />,
    );
    expect(screen.getByText("Play")).toBeTruthy();
    expect(screen.queryByText("Resume")).toBeNull();
    expect(screen.queryByText("Pause")).toBeNull();
  });

  it("shows Resume button when paused", () => {
    render(
      <AgentCard {...baseProps} agent={makeAgent({ state: "paused" })} />,
    );
    expect(screen.getByText("Resume")).toBeTruthy();
    expect(screen.queryByText("Play")).toBeNull();
  });

  it("shows Pause button when running", () => {
    render(
      <AgentCard {...baseProps} agent={makeAgent({ state: "running" })} />,
    );
    expect(screen.getByText("Pause")).toBeTruthy();
    expect(screen.queryByText("Play")).toBeNull();
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
    // Mock data generates 30 entries, so we should see level text
    const text = container.textContent ?? "";
    const hasLevel =
      text.includes("info") || text.includes("warn") || text.includes("error");
    expect(hasLevel).toBe(true);
    // Timestamps rendered via toLocaleTimeString — check for colon-separated time
    expect(text).toMatch(/\d{1,2}:\d{2}:\d{2}/);
  });
});

/* ------------------------------------------------------------------ */
/*  ExportPanel (rendered with mocked useAgents)                      */
/* ------------------------------------------------------------------ */
describe("ExportPanel", () => {
  it("renders password input and export/import buttons", async () => {
    const { ExportPanel } = await import(
      "../components/dashboard/ExportPanel"
    );
    const { container } = render(<ExportPanel connectionId="local-default" />);
    const text = container.textContent ?? "";
    expect(text).toContain("Password");
    expect(screen.getByText("Export Agent")).toBeTruthy();
    expect(screen.getByText("Import Agent")).toBeTruthy();
  });

  it("Export button is disabled when password < 4 chars", async () => {
    const { ExportPanel } = await import(
      "../components/dashboard/ExportPanel"
    );
    render(<ExportPanel connectionId="local-default" />);
    const exportBtn = screen.getByText("Export Agent");
    expect(exportBtn).toBeDisabled();

    // Type 3 chars — still disabled
    const pwInput = screen.getByLabelText("Password (min 4 chars)");
    fireEvent.change(pwInput, { target: { value: "abc" } });
    expect(screen.getByText("Export Agent")).toBeDisabled();

    // Type 4 chars — enabled
    fireEvent.change(pwInput, { target: { value: "abcd" } });
    expect(screen.getByText("Export Agent")).not.toBeDisabled();
  });
});
