/**
 * Tests for stream-persistence.ts
 *
 * Covers:
 *   - safeDestId() — filename sanitization
 *   - parseDestinationQuery() — URL query extraction
 *   - validateStreamSettings() — schema validation / rejection
 *   - readStreamSettings() / writeStreamSettings() — file I/O
 *   - readOverlayLayout() / writeOverlayLayout() — overlay persistence
 *   - seedOverlayDefaults() — first-start seeding
 *   - getHeadlessCaptureConfig() — merged config builder
 */

import fs from "node:fs";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import {
  getHeadlessCaptureConfig,
  parseDestinationQuery,
  readOverlayLayout,
  readStreamSettings,
  safeDestId,
  seedOverlayDefaults,
  validateStreamSettings,
  writeOverlayLayout,
  writeStreamSettings,
} from "./stream-persistence";

// ---------------------------------------------------------------------------
// Test directory setup — use a temp dir to avoid polluting the real data dir
// ---------------------------------------------------------------------------

const TEST_DIR = path.join(process.cwd(), "data", "stream");

beforeEach(() => {
  fs.mkdirSync(TEST_DIR, { recursive: true });
});

afterEach(() => {
  // Clean up test files
  try {
    const files = fs.readdirSync(TEST_DIR);
    for (const f of files) {
      fs.unlinkSync(path.join(TEST_DIR, f));
    }
  } catch {
    // Ignore cleanup errors
  }
});

// ===========================================================================
// safeDestId()
// ===========================================================================

describe("safeDestId()", () => {
  it("passes through alphanumeric IDs unchanged", () => {
    expect(safeDestId("retake-tv")).toBe("retake-tv");
    expect(safeDestId("custom_rtmp_123")).toBe("custom_rtmp_123");
  });

  it("strips path traversal characters", () => {
    expect(safeDestId("../../../etc/passwd")).toBe("etcpasswd");
    expect(safeDestId("foo/bar")).toBe("foobar");
  });

  it("strips special characters", () => {
    expect(safeDestId("dest@#$%^&*()")).toBe("dest");
    expect(safeDestId("hello world!")).toBe("helloworld");
  });

  it("handles empty string", () => {
    expect(safeDestId("")).toBe("");
  });
});

// ===========================================================================
// parseDestinationQuery()
// ===========================================================================

describe("parseDestinationQuery()", () => {
  it("extracts destination from query string", () => {
    expect(
      parseDestinationQuery("/api/stream/overlay-layout?destination=retake"),
    ).toBe("retake");
  });

  it("returns undefined when no destination param", () => {
    expect(parseDestinationQuery("/api/stream/overlay-layout")).toBeUndefined();
  });

  it("returns undefined for empty destination", () => {
    expect(
      parseDestinationQuery("/api/stream/overlay-layout?destination="),
    ).toBeUndefined();
  });

  it("returns undefined for undefined URL", () => {
    expect(parseDestinationQuery(undefined)).toBeUndefined();
  });

  it("returns undefined for malformed URL", () => {
    expect(parseDestinationQuery("not a url at all :::")).toBeUndefined();
  });
});

// ===========================================================================
// validateStreamSettings()
// ===========================================================================

describe("validateStreamSettings()", () => {
  it("accepts valid settings with all fields", () => {
    const result = validateStreamSettings({
      theme: "milady",
      avatarIndex: 3,
      voice: { enabled: true, autoSpeak: true, provider: "elevenlabs" },
    });
    expect(result.error).toBeUndefined();
    expect(result.settings).toEqual({
      theme: "milady",
      avatarIndex: 3,
      voice: { enabled: true, autoSpeak: true, provider: "elevenlabs" },
    });
  });

  it("accepts empty object (all fields optional)", () => {
    const result = validateStreamSettings({});
    expect(result.error).toBeUndefined();
    expect(result.settings).toEqual({});
  });

  it("accepts partial settings (theme only)", () => {
    const result = validateStreamSettings({ theme: "dark" });
    expect(result.error).toBeUndefined();
    expect(result.settings).toEqual({ theme: "dark" });
  });

  it("rejects null input", () => {
    const result = validateStreamSettings(null);
    expect(result.error).toBe("Settings must be a non-array object");
  });

  it("rejects array input", () => {
    const result = validateStreamSettings([1, 2, 3]);
    expect(result.error).toBe("Settings must be a non-array object");
  });

  it("rejects string input", () => {
    const result = validateStreamSettings("not an object");
    expect(result.error).toBe("Settings must be a non-array object");
  });

  it("rejects unknown top-level keys", () => {
    const result = validateStreamSettings({
      theme: "ok",
      __proto__: { polluted: true },
      evilKey: "data",
    });
    expect(result.error).toMatch(/Unknown settings key/);
  });

  it("rejects non-string theme", () => {
    const result = validateStreamSettings({ theme: 123 });
    expect(result.error).toMatch(/theme must be a string/);
  });

  it("rejects theme longer than 64 chars", () => {
    const result = validateStreamSettings({ theme: "x".repeat(65) });
    expect(result.error).toMatch(/theme must be a string/);
  });

  it("rejects negative avatarIndex", () => {
    const result = validateStreamSettings({ avatarIndex: -1 });
    expect(result.error).toMatch(/avatarIndex must be an integer/);
  });

  it("rejects fractional avatarIndex", () => {
    const result = validateStreamSettings({ avatarIndex: 3.5 });
    expect(result.error).toMatch(/avatarIndex must be an integer/);
  });

  it("rejects avatarIndex > 999", () => {
    const result = validateStreamSettings({ avatarIndex: 1000 });
    expect(result.error).toMatch(/avatarIndex must be an integer/);
  });

  it("rejects voice as a non-object", () => {
    const result = validateStreamSettings({ voice: "not an object" });
    expect(result.error).toMatch(/voice must be an object/);
  });

  it("rejects voice.enabled as non-boolean", () => {
    const result = validateStreamSettings({
      voice: { enabled: "yes" },
    });
    expect(result.error).toMatch(/voice.enabled must be a boolean/);
  });

  it("rejects voice.autoSpeak as non-boolean", () => {
    const result = validateStreamSettings({
      voice: { enabled: true, autoSpeak: 1 },
    });
    expect(result.error).toMatch(/voice.autoSpeak must be a boolean/);
  });

  it("rejects voice.provider longer than 64 chars", () => {
    const result = validateStreamSettings({
      voice: { enabled: true, provider: "x".repeat(65) },
    });
    expect(result.error).toMatch(/voice.provider must be a string/);
  });

  it("rejects oversized payload (size check runs before field validation)", () => {
    // Build an object with a very long theme — the size check at 4096 bytes
    // runs before the 64-char theme validation, so this hits the size limit.
    const huge = { theme: "x".repeat(5000) };
    const result = validateStreamSettings(huge);
    expect(result.error).toMatch(/exceeds.*byte limit/);
  });
});

// ===========================================================================
// readStreamSettings() / writeStreamSettings()
// ===========================================================================

describe("readStreamSettings() / writeStreamSettings()", () => {
  it("returns empty object when no settings file exists", () => {
    // Remove settings file if it exists
    const settingsFile = path.join(TEST_DIR, "stream-settings.json");
    try {
      fs.unlinkSync(settingsFile);
    } catch {
      // File might not exist
    }
    const settings = readStreamSettings();
    expect(settings).toEqual({});
  });

  it("round-trips settings through write and read", () => {
    const data = { theme: "milady", avatarIndex: 5 };
    writeStreamSettings(data);
    const read = readStreamSettings();
    expect(read).toEqual(data);
  });

  it("returns empty object on corrupted JSON", () => {
    const settingsFile = path.join(TEST_DIR, "stream-settings.json");
    fs.writeFileSync(settingsFile, "not valid json{{{", "utf-8");
    const settings = readStreamSettings();
    expect(settings).toEqual({});
  });
});

// ===========================================================================
// readOverlayLayout() / writeOverlayLayout()
// ===========================================================================

describe("readOverlayLayout() / writeOverlayLayout()", () => {
  const testLayout = { version: 1, widgets: [{ type: "branding" }] };

  it("returns null when no layout file exists", () => {
    const layout = readOverlayLayout(null, undefined);
    expect(layout).toBeNull();
  });

  it("round-trips global layout through write and read", () => {
    writeOverlayLayout(testLayout, null);
    const read = readOverlayLayout(null, undefined);
    expect(read).toEqual(testLayout);
  });

  it("round-trips destination-specific layout", () => {
    writeOverlayLayout(testLayout, "retake");
    const read = readOverlayLayout("retake", undefined);
    expect(read).toEqual(testLayout);
  });

  it("falls back to global layout when destination-specific is missing", () => {
    writeOverlayLayout(testLayout, null);
    const read = readOverlayLayout("nonexistent", undefined);
    expect(read).toEqual(testLayout);
  });

  it("falls back to plugin default when no files exist", () => {
    const dest = {
      id: "test",
      name: "Test",
      defaultOverlayLayout: { version: 1, widgets: [] },
      getCredentials: async () => ({ rtmpUrl: "", rtmpKey: "" }),
    };
    const read = readOverlayLayout("test", dest);
    expect(read).toEqual({ version: 1, widgets: [] });
  });

  it("prefers destination-specific over global", () => {
    const globalLayout = { version: 1, widgets: [{ type: "global" }] };
    const destLayout = { version: 1, widgets: [{ type: "dest" }] };
    writeOverlayLayout(globalLayout, null);
    writeOverlayLayout(destLayout, "retake");
    const read = readOverlayLayout("retake", undefined);
    expect(read).toEqual(destLayout);
  });
});

// ===========================================================================
// seedOverlayDefaults()
// ===========================================================================

describe("seedOverlayDefaults()", () => {
  it("seeds layout file when none exists", () => {
    const dest = {
      id: "retake",
      name: "Retake",
      defaultOverlayLayout: { version: 1, widgets: [{ type: "hud" }] },
      getCredentials: async () => ({ rtmpUrl: "", rtmpKey: "" }),
    };
    seedOverlayDefaults(dest);
    const read = readOverlayLayout("retake", undefined);
    expect(read).toEqual({ version: 1, widgets: [{ type: "hud" }] });
  });

  it("does not overwrite existing layout", () => {
    const existing = { version: 1, widgets: [{ type: "custom" }] };
    writeOverlayLayout(existing, "retake");

    const dest = {
      id: "retake",
      name: "Retake",
      defaultOverlayLayout: { version: 1, widgets: [{ type: "hud" }] },
      getCredentials: async () => ({ rtmpUrl: "", rtmpKey: "" }),
    };
    seedOverlayDefaults(dest);

    const read = readOverlayLayout("retake", undefined);
    expect(read).toEqual(existing);
  });

  it("no-ops when destination has no default layout", () => {
    const dest = {
      id: "retake",
      name: "Retake",
      getCredentials: async () => ({ rtmpUrl: "", rtmpKey: "" }),
    };
    seedOverlayDefaults(dest);
    const read = readOverlayLayout("retake", undefined);
    expect(read).toBeNull();
  });
});

// ===========================================================================
// getHeadlessCaptureConfig()
// ===========================================================================

describe("getHeadlessCaptureConfig()", () => {
  it("returns theme and avatarIndex from settings file", () => {
    writeStreamSettings({ theme: "dark", avatarIndex: 7 });
    const config = getHeadlessCaptureConfig(null);
    expect(config.theme).toBe("dark");
    expect(config.avatarIndex).toBe(7);
  });

  it("falls back to env vars when no settings file", () => {
    const settingsFile = path.join(TEST_DIR, "stream-settings.json");
    try {
      fs.unlinkSync(settingsFile);
    } catch {
      // Not present
    }
    process.env.STREAM_THEME = "env-theme";
    process.env.STREAM_AVATAR_INDEX = "42";
    try {
      const config = getHeadlessCaptureConfig(null);
      expect(config.theme).toBe("env-theme");
      expect(config.avatarIndex).toBe(42);
    } finally {
      delete process.env.STREAM_THEME;
      delete process.env.STREAM_AVATAR_INDEX;
    }
  });

  it("includes overlay layout JSON when file exists", () => {
    writeOverlayLayout({ version: 1, widgets: [] }, null);
    const config = getHeadlessCaptureConfig(null);
    expect(config.overlayLayout).toBeDefined();
    const parsed = JSON.parse(config.overlayLayout as string);
    expect(parsed.version).toBe(1);
  });

  it("passes through destinationId", () => {
    const config = getHeadlessCaptureConfig("retake");
    expect(config.destinationId).toBe("retake");
  });
});
