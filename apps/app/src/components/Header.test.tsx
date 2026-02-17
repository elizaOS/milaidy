import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";
import * as AppContext from "../AppContext";
import { Header } from "./Header";

// Mock the AppContext
vi.mock("../AppContext", () => ({
  useApp: vi.fn(),
}));

describe("Header", () => {
  it("renders wallet overlay with correct hover classes", async () => {
    // Mock the useApp hook return value
    const mockUseApp = {
      agentStatus: { state: "running", agentName: "Milady" },
      cloudEnabled: false,
      cloudConnected: false,
      cloudCredits: null,
      cloudCreditsCritical: false,
      cloudCreditsLow: false,
      cloudTopUpUrl: "",
      walletAddresses: {
        evmAddress: "0x1234567890123456789012345678901234567890",
        solanaAddress: "So11111111111111111111111111111111111111112",
      },
      lifecycleBusy: false,
      lifecycleAction: null,
      handlePauseResume: vi.fn(),
      handleRestart: vi.fn(),
      copyToClipboard: vi.fn(),
      setTab: vi.fn(),
      dropStatus: null,
      loadDropStatus: vi.fn(),
      registryStatus: null,
    };

    // @ts-expect-error - test uses a narrowed subset of the full app context type.
    vi.spyOn(AppContext, "useApp").mockReturnValue(mockUseApp);

    // We need to render the component.
    // Note: Since we are in a non-browser environment (happy-dom/jsdom might not be set up fully for standard React testing library in this repo's specific config),
    // we will check if we can use react-test-renderer or if we should rely on a basic snapshot/class check.
    // However, the user's package.json includes "react-test-renderer".
    // Let's try react-test-renderer first as it avoids DOM emulation issues if not configured.

    // Actually, let's stick to the plan of using what's available.
    // The previous check showed "react-test-renderer": "^19.0.0".

    let testRenderer: ReactTestRenderer | null = null;
    await act(async () => {
      testRenderer = create(<Header />);
    });
    if (!testRenderer) {
      throw new Error("Failed to render Header");
    }
    const root = testRenderer.root;
    const hasClass = (node: ReactTestInstance, className: string): boolean =>
      typeof node.props.className === "string" &&
      node.props.className.includes(className);

    // Find the wallet wrapper
    // It has className "wallet-wrapper relative inline-flex shrink-0 group"
    const walletWrapper = root.findAll((node: ReactTestInstance) =>
      hasClass(node, "wallet-wrapper"),
    );

    expect(walletWrapper.length).toBe(1);
    expect(walletWrapper[0].props.className).toContain("group");

    // Find the wallet tooltip
    // It should have className containing "group-hover:block"
    const walletTooltip = root.findAll((node: ReactTestInstance) =>
      hasClass(node, "wallet-tooltip"),
    );

    expect(walletTooltip.length).toBe(1);
    expect(walletTooltip[0].props.className).toContain("group-hover:block");
  });
});
