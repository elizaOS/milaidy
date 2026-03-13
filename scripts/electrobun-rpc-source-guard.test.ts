import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

const ACTIVE_SOURCE_ROOTS = [
  "apps/app/src",
  "packages/app-core/src",
  "apps/app/plugins",
];

const ACTIVE_BRIDGE_FILES = [
  "apps/app/electrobun/src/bridge/electrobun-preload.ts",
  "apps/app/electrobun/src/bridge/electrobun-direct-rpc.ts",
];

const FORBIDDEN_PATTERNS = [
  { label: "window.electron", regex: /\bwindow\.electron\b/ },
  { label: "ipcRenderer", regex: /\bipcRenderer\b/ },
  { label: "desktopCapturer", regex: /\bdesktopCapturer\b/ },
  { label: "electrobun-bridge import", regex: /\belectrobun-bridge\b/ },
];

function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (
        entry.name === "dist" ||
        entry.name === "build" ||
        entry.name === "__tests__" ||
        entry.name === "__mocks__" ||
        entry.name === "test"
      ) {
        continue;
      }
      results.push(...collectSourceFiles(fullPath));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry.name) || /\.d\.ts$/.test(entry.name)) {
      continue;
    }
    if (/\.test\.(ts|tsx)$/.test(entry.name)) {
      continue;
    }
    results.push(fullPath);
  }

  return results;
}

describe("electrobun rpc source guard", () => {
  it("keeps active renderer and plugin source on the direct rpc bridge", () => {
    const files = [
      ...ACTIVE_SOURCE_ROOTS.flatMap((dir) =>
        collectSourceFiles(path.join(ROOT, dir)),
      ),
      ...ACTIVE_BRIDGE_FILES.map((file) => path.join(ROOT, file)),
    ];

    const violations: string[] = [];

    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      for (const pattern of FORBIDDEN_PATTERNS) {
        if (pattern.regex.test(content)) {
          violations.push(`${path.relative(ROOT, file)} -> ${pattern.label}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});
