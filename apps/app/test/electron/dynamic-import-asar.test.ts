/**
 * @vitest-environment node
 *
 * Regression test for the dynamicImport helper in agent.ts.
 *
 * The ASAR fix (PR #492) introduced a branching import strategy:
 *   - Paths containing ".asar" → require() (Electron patches require for ASAR)
 *   - All other paths → ESM import() via new Function trick, with require() fallback
 *
 * This test validates the branching logic and fallback behavior without
 * needing a real Electron / ASAR environment.
 */

import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// ---------------------------------------------------------------------------
// We can't import dynamicImport directly because agent.ts pulls in Electron.
// Instead we extract and re-implement the logic to test the branching.
// ---------------------------------------------------------------------------

function createDynamicImport(deps: {
  requireFn: (id: string) => Record<string, unknown>;
  importFn: (specifier: string) => Promise<Record<string, unknown>>;
}) {
  return async (specifier: string): Promise<Record<string, unknown>> => {
    const fsPath = specifier.startsWith("file://")
      ? fileURLToPath(specifier)
      : specifier;

    const isAsar = fsPath.includes(".asar");

    if (isAsar) {
      return deps.requireFn(fsPath);
    }

    try {
      return await deps.importFn(specifier);
    } catch {
      return deps.requireFn(fsPath);
    }
  };
}

describe("dynamicImport ASAR branching", () => {
  let requireFn: Mock;
  let importFn: Mock;
  let dynamicImport: (specifier: string) => Promise<Record<string, unknown>>;

  const fakeModule = { startEliza: vi.fn(), __esModule: true };

  beforeEach(() => {
    requireFn = vi.fn().mockReturnValue(fakeModule);
    importFn = vi.fn().mockResolvedValue(fakeModule);
    dynamicImport = createDynamicImport({ requireFn, importFn });
  });

  it("uses require() for ASAR paths (file:// URL)", async () => {
    const asarPath =
      "file:///Applications/Milady.app/Contents/Resources/app.asar.unpacked/milady-dist/eliza.js";

    const result = await dynamicImport(asarPath);

    expect(result).toBe(fakeModule);
    expect(requireFn).toHaveBeenCalledTimes(1);
    expect(importFn).not.toHaveBeenCalled();

    // Verify the file:// URL was converted to a filesystem path for require()
    const calledWith = requireFn.mock.calls[0][0] as string;
    expect(calledWith).not.toContain("file://");
    expect(calledWith).toContain("app.asar.unpacked");
  });

  it("uses require() for ASAR paths (bare filesystem path)", async () => {
    const asarPath =
      "/Applications/Milady.app/Contents/Resources/app.asar.unpacked/milady-dist/server.js";

    const result = await dynamicImport(asarPath);

    expect(result).toBe(fakeModule);
    expect(requireFn).toHaveBeenCalledWith(asarPath);
    expect(importFn).not.toHaveBeenCalled();
  });

  it("uses import() for non-ASAR paths (development)", async () => {
    const devPath = pathToFileURL(
      path.resolve("/Users/dev/milady/dist/eliza.js"),
    ).href;

    const result = await dynamicImport(devPath);

    expect(result).toBe(fakeModule);
    expect(importFn).toHaveBeenCalledWith(devPath);
    expect(requireFn).not.toHaveBeenCalled();
  });

  it("falls back to require() when import() fails on non-ASAR path", async () => {
    importFn.mockRejectedValueOnce(new Error("ERR_REQUIRE_ESM"));
    const devPath = pathToFileURL(
      path.resolve("/Users/dev/milady/dist/eliza.js"),
    ).href;

    const result = await dynamicImport(devPath);

    expect(result).toBe(fakeModule);
    expect(importFn).toHaveBeenCalledTimes(1);
    expect(requireFn).toHaveBeenCalledTimes(1);
  });

  it("detects .asar in the middle of a path", async () => {
    const nestedAsar =
      "file:///opt/Milady/resources/app.asar/node_modules/some-module/index.js";

    await dynamicImport(nestedAsar);

    // Should have used require() because path contains .asar
    expect(requireFn).toHaveBeenCalledTimes(1);
    expect(importFn).not.toHaveBeenCalled();
  });

  it("converts file:// URLs to filesystem paths for require()", async () => {
    const fileUrl =
      "file:///Applications/Milady.app/Contents/Resources/app.asar.unpacked/milady-dist/eliza.js";

    await dynamicImport(fileUrl);

    const calledWith = requireFn.mock.calls[0][0] as string;
    expect(calledWith).toBe(
      "/Applications/Milady.app/Contents/Resources/app.asar.unpacked/milady-dist/eliza.js",
    );
  });

  it("propagates require() errors for ASAR paths", async () => {
    requireFn.mockImplementation(() => {
      throw new Error("Cannot find module");
    });

    const asarPath =
      "/Applications/Milady.app/Contents/Resources/app.asar/milady-dist/eliza.js";

    await expect(dynamicImport(asarPath)).rejects.toThrow("Cannot find module");
  });

  it("propagates require() errors when both import and require fail", async () => {
    importFn.mockRejectedValueOnce(new Error("import failed"));
    requireFn.mockImplementation(() => {
      throw new Error("require also failed");
    });

    const devPath = "/Users/dev/milady/dist/eliza.js";

    await expect(dynamicImport(devPath)).rejects.toThrow("require also failed");
  });
});
