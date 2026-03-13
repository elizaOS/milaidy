import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");
const DOC_PATH = path.join(ROOT, "docs/apps/desktop/native-modules.md");

describe("native modules desktop docs", () => {
  it("documents the direct Electrobun RPC bridge instead of Electron IPC", () => {
    const doc = fs.readFileSync(DOC_PATH, "utf8");

    expect(doc).toContain("window.__MILADY_ELECTROBUN_RPC__");
    expect(doc).toContain("request.<method>(params)");
    expect(doc).toContain('onMessage("agentStatusUpdate"');

    expect(doc).not.toContain("window.electron");
    expect(doc).not.toContain("ipcRenderer.invoke");
    expect(doc).not.toContain('import { ipcRenderer } from "electron"');
  });

  it("describes native app-window screen capture, not desktopCapturer as the public path", () => {
    const doc = fs.readFileSync(DOC_PATH, "utf8");

    expect(doc).toContain("App-window capture uses native OS tooling");
    expect(doc).toContain("macOS: `screencapture`");
    expect(doc).toContain(
      "Windows: PowerShell `System.Drawing.CopyFromScreen`",
    );
    expect(doc).not.toContain("desktopCapturer API");
  });
});
