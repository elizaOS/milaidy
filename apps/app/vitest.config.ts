import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    include: [
      path.join(here, "test/**/*.test.ts"),
      path.join(here, "test/**/*.test.tsx"),
    ],
    exclude: [
      path.join(here, "test/electron/**"),
      path.join(here, "test/electron-ui/**"),
    ],
    setupFiles: [path.join(here, "test/setup.ts")],
    environment: "node",
    alias: {
      electron: path.join(here, "test/__mocks__/electron.ts"),
      "@elizaos/skills": path.join(here, "test/__mocks__/elizaos-skills.ts"),
      "@elizaos/plugin-pdf": path.join(
        here,
        "..",
        "..",
        "test",
        "stubs",
        "empty-module.mjs",
      ),
      "@milady/capacitor-gateway": path.join(
        here,
        "plugins/gateway/src/index.ts",
      ),
      "@milady/capacitor-swabble": path.join(
        here,
        "plugins/swabble/src/index.ts",
      ),
      "@milady/capacitor-talkmode": path.join(
        here,
        "plugins/talkmode/src/index.ts",
      ),
      "@milady/capacitor-camera": path.join(
        here,
        "plugins/camera/src/index.ts",
      ),
      "@milady/capacitor-location": path.join(
        here,
        "plugins/location/src/index.ts",
      ),
      "@milady/capacitor-screencapture": path.join(
        here,
        "plugins/screencapture/src/index.ts",
      ),
      "@milady/capacitor-canvas": path.join(
        here,
        "plugins/canvas/src/index.ts",
      ),
      "@milady/capacitor-desktop": path.join(
        here,
        "plugins/desktop/src/index.ts",
      ),
      "@milady/capacitor-agent": path.join(here, "plugins/agent/src/index.ts"),
    },
    testTimeout: 30000,
    globals: true,
  },
});
