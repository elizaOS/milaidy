import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pluginEntrypoints = [
  "plugins/desktop/src/index.ts",
  "plugins/gateway/src/index.ts",
  "plugins/camera/src/index.ts",
  "plugins/canvas/src/index.ts",
  "plugins/location/src/index.ts",
  "plugins/swabble/src/index.ts",
  "plugins/talkmode/src/index.ts",
  "plugins/screencapture/src/index.ts",
];
const here = path.dirname(fileURLToPath(import.meta.url));

describe("electron plugin entrypoints (e2e)", () => {
  it("avoid renderer-side electron module imports that break startup MIME loading", () => {
    for (const relativePath of pluginEntrypoints) {
      const fullPath = path.resolve(here, "..", "..", relativePath);
      const source = readFileSync(fullPath, "utf8");

      expect(source).not.toContain("@vite-ignore");
      expect(source).not.toContain("../electron/src/index");
      expect(source).toContain("electron: loadWeb");
    }
  });
});
