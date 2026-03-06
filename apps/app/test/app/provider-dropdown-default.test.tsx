import React from "react";
import {
  act,
  create,
  type ReactTestInstance,
  type ReactTestRenderer,
} from "react-test-renderer";
import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGetConfig = vi.fn();
const mockGetOnboardingOptions = vi.fn();
const mockGetSubscriptionStatus = vi.fn();

vi.mock("../../src/api-client", () => ({
  client: {
    getConfig: (...args: unknown[]) => mockGetConfig(...args),
    getOnboardingOptions: (...args: unknown[]) =>
      mockGetOnboardingOptions(...args),
    getSubscriptionStatus: (...args: unknown[]) =>
      mockGetSubscriptionStatus(...args),
  },
}));

vi.mock("../../src/components/SubscriptionStatus", () => ({
  SubscriptionStatus: () => null,
}));
vi.mock("../../src/components/ApiKeyConfig", () => ({
  ApiKeyConfig: () => null,
}));
vi.mock("../../src/components/config-renderer", () => ({
  ConfigRenderer: () => null,
  defaultRegistry: {},
}));

import { ProviderSwitcher } from "../../src/components/ProviderSwitcher";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function defaultProps() {
  return {
    cloudEnabled: false,
    cloudConnected: false,
    cloudCredits: null,
    cloudCreditsLow: false,
    cloudCreditsCritical: false,
    cloudTopUpUrl: "",
    cloudUserId: null,
    cloudLoginBusy: false,
    cloudLoginError: null,
    cloudDisconnecting: false,
    plugins: [
      {
        id: "plugin-anthropic",
        name: "Anthropic",
        category: "ai-provider",
        enabled: true,
        configured: true,
        parameters: [],
      },
    ],
    pluginSaving: new Set<string>(),
    pluginSaveSuccess: new Set<string>(),
    loadPlugins: vi.fn(async () => {}),
    handlePluginToggle: vi.fn(async () => {}),
    handlePluginConfigSave: vi.fn(),
    handleCloudLogin: vi.fn(async () => {}),
    handleCloudDisconnect: vi.fn(async () => {}),
    setState: vi.fn(),
    setTab: vi.fn(),
  };
}

function getSelectValue(tree: ReactTestRenderer): string | undefined {
  // biome-ignore lint/suspicious/noExplicitAny: test introspection
  const root = (tree as any).root;
  const selects = root.findAll(
    (node: ReactTestInstance) =>
      node.type === "select" && node.props.value !== undefined,
  );
  return selects.length > 0 ? selects[0].props.value : undefined;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProviderSwitcher provider dropdown default", () => {
  it("does not auto-select __cloud__ when config returns non-cloud inference", async () => {
    // Config returns cloud.enabled=false — not a cloud user
    mockGetConfig.mockResolvedValue({
      models: { small: "some-local-model", large: "some-local-model" },
      cloud: { enabled: false },
      agents: {},
      env: { vars: {} },
    });
    mockGetOnboardingOptions.mockResolvedValue({
      models: [],
      piAiModels: [],
      piAiDefaultModel: "",
    });
    mockGetSubscriptionStatus.mockResolvedValue({ providers: [] });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(React.createElement(ProviderSwitcher, defaultProps()));
    });

    // Let the async config load settle
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const selectValue = getSelectValue(tree);
    // With the fix, the dropdown should resolve to the enabled plugin
    // (plugin-anthropic), NOT "__cloud__"
    expect(selectValue).toBe("plugin-anthropic");
  });

  it("selects __cloud__ when config returns cloud inference enabled", async () => {
    mockGetConfig.mockResolvedValue({
      models: {},
      cloud: {
        enabled: true,
        inferenceMode: "cloud",
        services: { inference: true },
      },
      agents: {},
      env: { vars: {} },
    });
    mockGetOnboardingOptions.mockResolvedValue({
      models: [],
      piAiModels: [],
      piAiDefaultModel: "",
    });
    mockGetSubscriptionStatus.mockResolvedValue({ providers: [] });

    let tree!: ReactTestRenderer;
    await act(async () => {
      tree = create(
        React.createElement(ProviderSwitcher, {
          ...defaultProps(),
          cloudEnabled: true,
        }),
      );
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    const selectValue = getSelectValue(tree);
    expect(selectValue).toBe("__cloud__");
  });
});
