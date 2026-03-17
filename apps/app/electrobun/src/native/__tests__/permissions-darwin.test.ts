import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("bun:ffi", () => ({
  dlopen: vi.fn(() => ({
    symbols: {
      requestAccessibilityPermission: vi.fn(() => false),
      checkAccessibilityPermission: vi.fn(() => false),
      requestScreenRecordingPermission: vi.fn(() => false),
      checkScreenRecordingPermission: vi.fn(() => false),
      checkMicrophonePermission: vi.fn(() => 0),
      checkCameraPermission: vi.fn(() => 0),
      requestCameraPermission: vi.fn(),
      requestMicrophonePermission: vi.fn(),
    },
  })),
  FFIType: {
    bool: "bool",
    i32: "i32",
    void: "void",
  },
}));

import {
  extractBundleIdentifierFromInfoPlist,
  mapAvAuthorizationStatus,
  resolveRuntimeBundleIdentifier,
  resolveSessionPermissionStatus,
  shouldOpenSettingsAfterMediaRequest,
} from "../permissions-darwin";

describe("permissions-darwin helpers", () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { force: true, recursive: true });
      tempDir = null;
    }
  });

  it("preserves denied and restricted AVFoundation statuses", () => {
    expect(mapAvAuthorizationStatus(1)).toBe("denied");
    expect(mapAvAuthorizationStatus(3)).toBe("restricted");
    expect(mapAvAuthorizationStatus(0)).toBe("not-determined");
    expect(mapAvAuthorizationStatus(2)).toBe("granted");
  });

  it("treats prompted accessibility and screen-recording permissions as denied until granted", () => {
    expect(
      resolveSessionPermissionStatus({
        granted: false,
        promptedThisSession: false,
        tccStatus: null,
      }),
    ).toBe("not-determined");

    expect(
      resolveSessionPermissionStatus({
        granted: false,
        promptedThisSession: true,
        tccStatus: null,
      }),
    ).toBe("denied");
  });

  it("falls back to System Settings when a camera or microphone request does not grant access", () => {
    expect(shouldOpenSettingsAfterMediaRequest("granted")).toBe(false);
    expect(shouldOpenSettingsAfterMediaRequest("not-determined")).toBe(true);
    expect(shouldOpenSettingsAfterMediaRequest("denied")).toBe(true);
    expect(shouldOpenSettingsAfterMediaRequest("restricted")).toBe(true);
  });

  it("extracts the runtime bundle identifier from Info.plist", () => {
    const plist = `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.miladyai.milady.dev</string>
</dict>
</plist>`;

    expect(extractBundleIdentifierFromInfoPlist(plist)).toBe(
      "com.miladyai.milady.dev",
    );
  });

  it("resolves the signed app identity from the runtime bundle instead of assuming the default", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-permissions-"));
    const appBundlePath = path.join(tempDir, "Milady-dev.app");
    const macOsDir = path.join(appBundlePath, "Contents", "MacOS");
    fs.mkdirSync(macOsDir, { recursive: true });
    fs.writeFileSync(
      path.join(appBundlePath, "Contents", "Info.plist"),
      `<?xml version="1.0" encoding="UTF-8"?>
<plist version="1.0">
<dict>
  <key>CFBundleIdentifier</key>
  <string>com.example.milady.local</string>
</dict>
</plist>`,
    );

    expect(resolveRuntimeBundleIdentifier(path.join(macOsDir, "bun"))).toBe(
      "com.example.milady.local",
    );
  });
});
