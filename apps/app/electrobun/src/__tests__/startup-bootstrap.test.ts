import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const INDEX_PATH = path.resolve(import.meta.dirname, "..", "index.ts");

describe("Electrobun startup bootstrap", () => {
  it("logs a structured startup environment block", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");

    expect(source).toContain("[Env] platform=");
    expect(source).toContain('import.meta.dir.replaceAll("\\\\", "/")');
  });

  it("creates the main window before wiring the application menu", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");
    const createWindowIndex = source.indexOf(
      "const mainWin = attachMainWindow(await createMainWindow());",
    );
    const menuIndex = source.indexOf(
      "setupApplicationMenu();",
      createWindowIndex,
    );

    expect(createWindowIndex).toBeGreaterThan(-1);
    expect(menuIndex).toBeGreaterThan(createWindowIndex);
  });

  it("validates the built preload before creating the BrowserWindow", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");
    const validateIndex = source.indexOf(
      "const preload = readBuiltPreloadScript(import.meta.dir);",
    );
    const browserWindowIndex = source.indexOf("const win = new BrowserWindow(");

    expect(validateIndex).toBeGreaterThan(-1);
    expect(browserWindowIndex).toBeGreaterThan(validateIndex);
  });

  it("resolves the initial renderer API base from desktop runtime mode", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");

    expect(source).toContain("resolveDesktopRuntimeMode");
    expect(source).toContain("resolveInitialApiBase");
  });

  it("guards embedded agent startup behind local runtime mode", () => {
    const source = fs.readFileSync(INDEX_PATH, "utf8");

    expect(source).toContain('if (runtimeResolution.mode !== "local")');
    expect(source).toContain("[Main] Skipping embedded agent startup");
  });
});
