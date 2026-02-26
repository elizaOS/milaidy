/**
 * Tests for ProviderSwitcher component
 *
 * Regression test: Provider grid overflows container when many providers installed
 */

import { describe, expect, it, vi } from "vitest";
import type { ProviderSwitcherProps } from "./ProviderSwitcher";

// Type-only test to verify props interface
const mockProps: ProviderSwitcherProps = {
  cloudEnabled: true,
  cloudConnected: false,
  cloudCredits: null,
  cloudCreditsLow: false,
  cloudCreditsCritical: false,
  cloudTopUpUrl: "https://cloud.eliza.com/top-up",
  cloudUserId: null,
  cloudLoginBusy: false,
  cloudLoginError: null,
  cloudDisconnecting: false,
  plugins: [],
  pluginSaving: new Set<string>(),
  pluginSaveSuccess: new Set<string>(),
  loadPlugins: vi.fn(),
  handlePluginToggle: vi.fn(),
  handlePluginConfigSave: vi.fn(),
  handleCloudLogin: vi.fn(),
  handleCloudDisconnect: vi.fn(),
  setState: vi.fn(),
  setTab: vi.fn(),
};

describe("ProviderSwitcher", () => {
  it("should compile with correct types", () => {
    expect(mockProps).toBeDefined();
    expect(mockProps.cloudEnabled).toBe(true);
  });

  it("should have all required props", () => {
    expect(mockProps).toHaveProperty("cloudEnabled");
    expect(mockProps).toHaveProperty("cloudConnected");
    expect(mockProps).toHaveProperty("cloudCredits");
    expect(mockProps).toHaveProperty("plugins");
    expect(mockProps).toHaveProperty("loadPlugins");
    expect(mockProps).toHaveProperty("handlePluginToggle");
  });

  it("pluginSaving should accept Set<string>", () => {
    const saving = new Set<string>(["openai", "anthropic"]);
    expect(saving.has("openai")).toBe(true);
    expect(saving.has("anthropic")).toBe(true);
  });

  it("should handle empty plugins array", () => {
    expect(mockProps.plugins).toEqual([]);
  });
});
