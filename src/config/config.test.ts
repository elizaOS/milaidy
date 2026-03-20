import { describe, expect, it } from "vitest";
import {
  isCloudActiveFromProviders,
  type LegacyCloudConfig,
  migrateCloudEnabledToProviders,
} from "./config";

// ── isCloudActiveFromProviders ─────────────────────────────────────────────

describe("isCloudActiveFromProviders", () => {
  it("returns true when elizacloud is the only provider", () => {
    expect(isCloudActiveFromProviders(["elizacloud"])).toBe(true);
  });

  it("returns true when elizacloud is among multiple providers", () => {
    expect(
      isCloudActiveFromProviders(["openai", "elizacloud", "anthropic"]),
    ).toBe(true);
  });

  it("returns false for an empty providers array", () => {
    expect(isCloudActiveFromProviders([])).toBe(false);
  });

  it("returns false when providers list has no elizacloud entry", () => {
    expect(isCloudActiveFromProviders(["openai", "anthropic"])).toBe(false);
  });

  it("returns false for undefined providers", () => {
    expect(isCloudActiveFromProviders(undefined)).toBe(false);
  });

  it("returns false for null providers", () => {
    expect(isCloudActiveFromProviders(null)).toBe(false);
  });

  it("is case-sensitive — elizaCloud (capital C) does not match", () => {
    expect(isCloudActiveFromProviders(["elizaCloud"])).toBe(false);
  });
});

// ── migrateCloudEnabledToProviders ─────────────────────────────────────────

describe("migrateCloudEnabledToProviders", () => {
  it("adds elizacloud to providers when cloud.enabled is true", () => {
    const config: LegacyCloudConfig = { cloud: { enabled: true } };
    const result = migrateCloudEnabledToProviders(config);
    expect(result.providers).toContain("elizacloud");
  });

  it("does not modify config when cloud.enabled is false", () => {
    const config: LegacyCloudConfig = { cloud: { enabled: false } };
    const result = migrateCloudEnabledToProviders(config);
    expect(result.providers).toBeUndefined();
  });

  it("does not modify config when cloud is absent", () => {
    const config: LegacyCloudConfig = {};
    const result = migrateCloudEnabledToProviders(config);
    expect(result.providers).toBeUndefined();
  });

  it("preserves existing providers when migrating", () => {
    const config: LegacyCloudConfig = {
      cloud: { enabled: true },
      providers: ["openai"],
    };
    const result = migrateCloudEnabledToProviders(config);
    expect(result.providers).toContain("openai");
    expect(result.providers).toContain("elizacloud");
  });

  it("does not duplicate elizacloud if already present", () => {
    const config: LegacyCloudConfig = {
      cloud: { enabled: true },
      providers: ["elizacloud"],
    };
    const result = migrateCloudEnabledToProviders(config);
    expect(result.providers?.filter((p) => p === "elizacloud").length).toBe(1);
  });

  it("does not mutate the original config object", () => {
    const original: LegacyCloudConfig = { cloud: { enabled: true } };
    const result = migrateCloudEnabledToProviders(original);
    expect(original.providers).toBeUndefined();
    expect(result.providers).toContain("elizacloud");
  });
});
