import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  createEntitlementsPlist,
  parseCodesignIdentifier,
  shouldApplyLocalAdhocSigning,
  signLocalAppBundle,
} from "../../scripts/local-adhoc-sign-macos";

describe("local-adhoc-sign-macos", () => {
  let tempDir: string | null = null;

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { force: true, recursive: true });
      tempDir = null;
    }
    vi.restoreAllMocks();
  });

  it("renders a deterministic entitlements plist", () => {
    const plist = createEntitlementsPlist({
      "com.apple.security.device.camera": true,
      "com.apple.security.network.client": true,
    });

    expect(plist).toContain("<key>com.apple.security.device.camera</key>");
    expect(plist).toContain("<true/>");
    expect(plist.indexOf("device.camera")).toBeLessThan(
      plist.indexOf("network.client"),
    );
  });

  it("parses codesign identifiers", () => {
    expect(
      parseCodesignIdentifier(
        "Executable=/tmp/Milady\nIdentifier=com.miladyai.milady",
      ),
    ).toBe("com.miladyai.milady");
    expect(parseCodesignIdentifier("Executable=/tmp/Milady")).toBeNull();
  });

  it("only enables local signing for macOS skip-codesign builds", () => {
    const platformSpy = vi.spyOn(process, "platform", "get");
    platformSpy.mockReturnValue("darwin");
    expect(
      shouldApplyLocalAdhocSigning({ ELECTROBUN_SKIP_CODESIGN: "1" }),
    ).toBe(true);
    expect(
      shouldApplyLocalAdhocSigning({ ELECTROBUN_SKIP_CODESIGN: "0" }),
    ).toBe(false);
    platformSpy.mockRestore();
  });

  it("signs launcher, bun, and the app bundle with the Milady identifier", () => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "milady-local-sign-"));
    const appBundlePath = path.join(tempDir, "Milady-dev.app");
    const macOsDir = path.join(appBundlePath, "Contents", "MacOS");
    fs.mkdirSync(macOsDir, { recursive: true });
    fs.writeFileSync(path.join(macOsDir, "launcher"), "");
    fs.writeFileSync(path.join(macOsDir, "bun"), "");

    const execFile = vi.fn((command: string, _args: string[]) => {
      expect(command).toBe("codesign");
      return "";
    });
    const spawnFile = vi.fn((_command: string, _args: string[]) => ({
      error: undefined,
      status: 0,
      stderr: "Identifier=com.miladyai.milady",
      stdout: "",
    }));

    signLocalAppBundle({
      appBundlePath,
      entitlements: { "com.apple.security.device.camera": true },
      expectedIdentifier: "com.miladyai.milady",
      execFile: execFile as never,
      spawnFile: spawnFile as never,
    });

    const targets = execFile.mock.calls
      .filter(([, args]) => args[0] === "--force")
      .map(([, args]) => args.at(-1));
    expect(targets).toEqual([
      path.join(macOsDir, "launcher"),
      path.join(macOsDir, "bun"),
      appBundlePath,
    ]);
  });
});
