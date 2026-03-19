// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";
import {
  applyForceFreshOnboardingReset,
  clearForceFreshOnboarding,
  enableForceFreshOnboarding,
  installForceFreshOnboardingClientPatch,
  isForceFreshOnboardingEnabled,
} from "../../src/onboarding-reset";

describe("force fresh onboarding reset", () => {
  it("clears persisted onboarding state and strips the reset query param", () => {
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      removeItem: vi.fn((key: string) => {
        values.delete(key);
      }),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
    };
    const history = { replaceState: vi.fn() };
    const values = new Map<string, string>([
      ["eliza:connection-mode", '{"runMode":"cloud"}'],
      ["eliza:onboarding:step", "senses"],
      ["eliza:onboarding-step", "connection"],
      ["eliza:onboarding-complete", "true"],
    ]);
    const url = new URL("https://app.milady.ai/?reset=1&foo=bar");

    const changed = applyForceFreshOnboardingReset({ history, storage, url });

    expect(changed).toBe(true);
    expect(values.has("eliza:connection-mode")).toBe(false);
    expect(values.has("eliza:onboarding:step")).toBe(false);
    expect(values.has("eliza:onboarding-step")).toBe(false);
    expect(values.has("eliza:onboarding-complete")).toBe(false);
    expect(values.get("milady:onboarding:force-fresh")).toBe("1");
    expect(history.replaceState).toHaveBeenCalledWith(
      null,
      "",
      "https://app.milady.ai/?foo=bar",
    );
  });

  it("suppresses config resume until onboarding submits successfully", async () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      removeItem: vi.fn((key: string) => {
        values.delete(key);
      }),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
    };
    const client = {
      getConfig: vi.fn(async () => ({ cloud: { enabled: true } })),
      getOnboardingStatus: vi.fn(async () => ({ complete: true })),
      submitOnboarding: vi.fn(async () => undefined),
    };

    enableForceFreshOnboarding(storage);
    const restore = installForceFreshOnboardingClientPatch(client, storage);

    expect(isForceFreshOnboardingEnabled(storage)).toBe(true);
    await expect(client.getConfig()).resolves.toEqual({});
    await expect(client.getOnboardingStatus()).resolves.toEqual({
      complete: false,
    });

    await client.submitOnboarding({ connection: { kind: "cloud-managed" } });

    expect(isForceFreshOnboardingEnabled(storage)).toBe(false);
    await expect(client.getConfig()).resolves.toEqual({
      cloud: { enabled: true },
    });
    await expect(client.getOnboardingStatus()).resolves.toEqual({
      complete: true,
    });

    restore();
    clearForceFreshOnboarding(storage);
  });
});
