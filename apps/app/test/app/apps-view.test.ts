import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TestRenderer, { act } from "react-test-renderer";
import type {
  AppLaunchResult,
  AppViewerAuthMessage,
  RegistryAppInfo,
} from "../../src/api-client";

interface AppsContextStub {
  setState: (
    key: string,
    value: string | boolean | AppViewerAuthMessage | null,
  ) => void;
  setActionNotice: (
    text: string,
    tone?: "info" | "success" | "error",
    ttlMs?: number,
  ) => void;
}

const { mockClientFns, mockUseApp } = vi.hoisted(() => ({
  mockClientFns: {
    listApps: vi.fn(),
    launchApp: vi.fn(),
  },
  mockUseApp: vi.fn(),
}));

vi.mock("../../src/api-client", () => ({
  client: mockClientFns,
}));
vi.mock("../../src/AppContext", () => ({
  useApp: () => mockUseApp(),
}));

import { AppsView } from "../../src/components/AppsView";

function createApp(
  name: string,
  displayName: string,
  description: string,
): RegistryAppInfo {
  return {
    name,
    displayName,
    description,
    category: "game",
    launchType: "connect",
    launchUrl: `https://example.com/${displayName.toLowerCase()}`,
    icon: null,
    capabilities: ["observe"],
    stars: 1,
    repository: "https://github.com/example/repo",
    latestVersion: "1.0.0",
    supports: { v0: false, v1: false, v2: true },
    npm: { package: name, v0Version: null, v1Version: null, v2Version: "1.0.0" },
  };
}

function createLaunchResult(overrides?: Partial<AppLaunchResult>): AppLaunchResult {
  return {
    pluginInstalled: true,
    needsRestart: false,
    displayName: "Test App",
    launchType: "connect",
    launchUrl: "https://example.com/launch",
    viewer: {
      url: "https://example.com/viewer",
      postMessageAuth: false,
      sandbox: "allow-scripts",
    },
    ...overrides,
  };
}

function text(node: TestRenderer.ReactTestInstance): string {
  return node.children
    .map((child) => (typeof child === "string" ? child : ""))
    .join("")
    .trim();
}

function findButtonByText(
  root: TestRenderer.ReactTestInstance,
  label: string,
): TestRenderer.ReactTestInstance {
  const matches = root.findAll(
    (node) => node.type === "button" && text(node) === label,
  );
  if (!matches[0]) {
    throw new Error(`Button "${label}" not found`);
  }
  return matches[0];
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("AppsView", () => {
  beforeEach(() => {
    mockClientFns.listApps.mockReset();
    mockClientFns.launchApp.mockReset();
    mockUseApp.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("loads apps and launches iframe viewer flow", async () => {
    const setState = vi.fn<AppsContextStub["setState"]>();
    const setActionNotice = vi.fn<AppsContextStub["setActionNotice"]>();
    mockUseApp.mockReturnValue({ setState, setActionNotice });
    const app = createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena");
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({
        displayName: app.displayName,
        viewer: {
          url: "http://localhost:5175",
          sandbox: "allow-scripts allow-same-origin",
          postMessageAuth: true,
          authMessage: { type: "HYPERSCAPE_AUTH", authToken: "token-1" },
        },
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    const launchButton = findButtonByText(tree!.root, "Launch");
    await act(async () => {
      await launchButton.props.onClick();
    });

    expect(mockClientFns.launchApp).toHaveBeenCalledWith(app.name);
    expect(setState).toHaveBeenCalledWith("activeGameApp", app.name);
    expect(setState).toHaveBeenCalledWith("activeGameDisplayName", app.displayName);
    expect(setState).toHaveBeenCalledWith("activeGameViewerUrl", "http://localhost:5175");
    expect(setState).toHaveBeenCalledWith("activeGamePostMessageAuth", true);
    expect(setState).toHaveBeenCalledWith("tab", "game");
    expect(
      setActionNotice.mock.calls.some((call) =>
        String(call[0]).includes("requires iframe auth"),
      ),
    ).toBe(false);
  });

  it("shows auth warning when postMessage auth payload is missing", async () => {
    const setState = vi.fn<AppsContextStub["setState"]>();
    const setActionNotice = vi.fn<AppsContextStub["setActionNotice"]>();
    mockUseApp.mockReturnValue({ setState, setActionNotice });
    const app = createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena");
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({
        displayName: app.displayName,
        viewer: {
          url: "http://localhost:5175",
          sandbox: "allow-scripts allow-same-origin",
          postMessageAuth: true,
        },
      }),
    );

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree!.root, "Launch").props.onClick();
    });

    expect(setActionNotice).toHaveBeenCalledWith(
      expect.stringContaining("requires iframe auth"),
      "error",
      4800,
    );
    expect(setState).toHaveBeenCalledWith("tab", "game");
  });

  it("opens non-viewer launches in a new tab and resets active game state", async () => {
    const setState = vi.fn<AppsContextStub["setState"]>();
    const setActionNotice = vi.fn<AppsContextStub["setActionNotice"]>();
    mockUseApp.mockReturnValue({ setState, setActionNotice });
    const app = createApp("@elizaos/app-babylon", "Babylon", "Wallet app");
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp.mockResolvedValue(
      createLaunchResult({
        displayName: app.displayName,
        launchUrl: "https://example.com/babylon",
        viewer: null,
      }),
    );

    const popupSpy = vi
      .spyOn(window, "open")
      .mockReturnValue({} as Window);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree!.root, "Launch").props.onClick();
    });

    expect(popupSpy).toHaveBeenCalledWith(
      "https://example.com/babylon",
      "_blank",
      "noopener,noreferrer",
    );
    expect(setState).toHaveBeenCalledWith("activeGameApp", "");
    expect(setState).toHaveBeenCalledWith("activeGameViewerUrl", "");
    expect(setActionNotice).toHaveBeenCalledWith(
      "Babylon opened in a new tab.",
      "success",
      2600,
    );
  });

  it("reports popup-blocked errors and launch failures", async () => {
    const setState = vi.fn<AppsContextStub["setState"]>();
    const setActionNotice = vi.fn<AppsContextStub["setActionNotice"]>();
    mockUseApp.mockReturnValue({ setState, setActionNotice });
    const app = createApp("@elizaos/app-babylon", "Babylon", "Wallet app");
    mockClientFns.listApps.mockResolvedValue([app]);
    mockClientFns.launchApp
      .mockResolvedValueOnce(
        createLaunchResult({
          displayName: app.displayName,
          launchUrl: "https://example.com/babylon",
          viewer: null,
        }),
      )
      .mockRejectedValueOnce(new Error("network down"));

    vi.spyOn(window, "open").mockReturnValue(null);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    await act(async () => {
      await findButtonByText(tree!.root, "Launch").props.onClick();
    });
    expect(setActionNotice).toHaveBeenCalledWith(
      "Popup blocked while opening Babylon. Allow popups and try again.",
      "error",
      4200,
    );

    await act(async () => {
      await findButtonByText(tree!.root, "Launch").props.onClick();
    });
    expect(setActionNotice).toHaveBeenCalledWith(
      "Failed to launch Babylon: network down",
      "error",
      4000,
    );
  });

  it("refreshes list and applies search filtering", async () => {
    const setState = vi.fn<AppsContextStub["setState"]>();
    const setActionNotice = vi.fn<AppsContextStub["setActionNotice"]>();
    mockUseApp.mockReturnValue({ setState, setActionNotice });
    const appOne = createApp("@elizaos/app-hyperscape", "Hyperscape", "Arena");
    const appTwo = createApp("@elizaos/app-babylon", "Babylon", "Wallet");
    mockClientFns.listApps.mockResolvedValue([appOne, appTwo]);

    let tree: TestRenderer.ReactTestRenderer;
    await act(async () => {
      tree = TestRenderer.create(React.createElement(AppsView));
    });
    await flush();

    const root = tree!.root;
    expect(root.findAll((node) => text(node) === "Hyperscape").length).toBe(1);
    expect(root.findAll((node) => text(node) === "Babylon").length).toBe(1);

    const searchInput = root.findByType("input");
    await act(async () => {
      searchInput.props.onChange({ target: { value: "hyper" } });
    });
    expect(root.findAll((node) => text(node) === "Hyperscape").length).toBe(1);
    expect(root.findAll((node) => text(node) === "Babylon").length).toBe(0);

    await act(async () => {
      await findButtonByText(root, "Refresh").props.onClick();
    });
    expect(mockClientFns.listApps).toHaveBeenCalledTimes(2);
  });
});
