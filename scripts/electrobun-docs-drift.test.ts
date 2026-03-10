import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const BUILD_AND_RELEASE_DOC_PATH = path.join(ROOT, "docs/build-and-release.md");
const DESKTOP_DOC_PATH = path.join(ROOT, "docs/apps/desktop.md");
const NATIVE_MODULES_DOC_PATH = path.join(
  ROOT,
  "docs/apps/desktop/native-modules.md",
);

describe("Electrobun docs drift", () => {
  it("documents the current release runners and local desktop build commands", () => {
    const doc = fs.readFileSync(BUILD_AND_RELEASE_DOC_PATH, "utf8");

    expect(doc).toContain("macos-15-intel");
    expect(doc).toContain("bun run build:desktop");
    expect(doc).toContain(
      "ELECTROBUN_SKIP_CODESIGN=1 bun run build:desktop",
    );
    expect(doc).toContain("SKIP_SIGNATURE_CHECK=1 bun run smoke:desktop");
    expect(doc).toContain("validates the `postWrap` release path");
  });

  it("labels the desktop shell as Electrobun in user-facing desktop docs", () => {
    const desktopDoc = fs.readFileSync(DESKTOP_DOC_PATH, "utf8");
    const nativeModulesDoc = fs.readFileSync(NATIVE_MODULES_DOC_PATH, "utf8");

    expect(desktopDoc).toContain("Desktop App (Electrobun)");
    expect(desktopDoc).toContain("apps/app/electrobun/");
    expect(nativeModulesDoc).toContain("current desktop shell is Electrobun");
  });
});
