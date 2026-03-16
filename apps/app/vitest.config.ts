import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    // Use POSIX-style relative globs so test discovery works on Windows too.
    include: ["test/**/*.test.ts", "test/**/*.test.tsx"],
    setupFiles: [path.join(here, "test/setup.ts")],
    environment: "node",
    alias: {
      "@elizaos/skills": path.join(here, "test/__mocks__/elizaos-skills.ts"),
      "@elizaos/plugin-pdf": path.join(
        here,
        "..",
        "..",
        "test",
        "stubs",
        "empty-module.mjs",
      ),
      "@miladyai/capacitor-gateway": path.join(
        here,
        "plugins/gateway/src/index.ts",
      ),
      "@miladyai/capacitor-swabble": path.join(
        here,
        "plugins/swabble/src/index.ts",
      ),
      "@miladyai/capacitor-talkmode": path.join(
        here,
        "plugins/talkmode/src/index.ts",
      ),
      "@miladyai/capacitor-camera": path.join(
        here,
        "plugins/camera/src/index.ts",
      ),
      "@miladyai/capacitor-location": path.join(
        here,
        "plugins/location/src/index.ts",
      ),
      "@miladyai/capacitor-screencapture": path.join(
        here,
        "plugins/screencapture/src/index.ts",
      ),
      "@miladyai/capacitor-canvas": path.join(
        here,
        "plugins/canvas/src/index.ts",
      ),
      "@miladyai/capacitor-desktop": path.join(
        here,
        "plugins/desktop/src/index.ts",
      ),
      "@miladyai/capacitor-agent": path.join(
        here,
        "plugins/agent/src/index.ts",
      ),
    },
    testTimeout: 30000,
    globals: true,
  },
});
