import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import * as AppContext from "../AppContext";
import { Header } from "./Header";

// Mock the AppContext
vi.mock("../AppContext", () => ({
  useApp: vi.fn(),
}));

vi.mock("../hooks/useBugReport", () => ({
  useBugReport: () => ({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}));

describe("Header", () => {
  it("renders agent name and shell toggle", async () => {
    // Mock the useApp hook return value
    const mockUseApp = {
      t: (k: string) => k,
      agentStatus: { state: "running", agentName: "Milady" },
      miladyCloudEnabled: false,
      miladyCloudConnected: false,
      miladyCloudCredits: null,
      miladyCloudCreditsCritical: false,
      miladyCloudCreditsLow: false,
      miladyCloudTopUpUrl: "",
      lifecycleBusy: false,
      lifecycleAction: null,
      handlePauseResume: vi.fn(),
      handleRestart: vi.fn(),
      handleStart: vi.fn(),
      loadDropStatus: vi.fn(),
      setTab: vi.fn(),
      uiLanguage: "en",
      setUiLanguage: vi.fn(),
      uiShellMode: "native",
      setUiShellMode: vi.fn(),
    };

    // @ts-expect-error - test uses a narrowed subset of the full app context type.
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);

    let testRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      testRenderer = create(<Header />);
    });
    if (!testRenderer) {
      throw new Error("Failed to render Header");
    }
    const root = (testRenderer as ReactTestRenderer).root;

    // Check agent name
    const agentName = root.findByProps({ "data-testid": "agent-name" });
    expect(agentName.children).toContain("Milady");

    // Check shell toggle button
    const shellToggle = root.findByProps({ "data-testid": "ui-shell-toggle" });
    expect(shellToggle).toBeDefined();
  });
});
