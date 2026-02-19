import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";

const baseTest =
  (baseConfig as { test?: { include?: string[]; exclude?: string[] } }).test ??
  {};

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseTest,
    include: [
      ...(baseTest.include ?? [
        "src/**/*.test.ts",
        "test/format-error.test.ts",
      ]),
      "apps/app/test/app/autonomous-panel.test.ts",
      "apps/app/test/app/chat-send-lock.test.ts",
      "apps/app/test/app/chat-stream-api-client.test.ts",
      "apps/app/test/avatar/voice-chat-streaming-text.test.ts",
    ],
    exclude: [
      ...(baseTest.exclude ?? []),
      // These app UI tests require React/browser deps that are not guaranteed
      // in the root unit-test environment. They run in app-specific pipelines.
      "apps/app/src/components/Header.test.tsx",
      "apps/app/test/app/autonomous-panel.test.ts",
      "apps/app/test/app/chat-view.test.tsx",
      "apps/app/test/avatar/voice-chat-streaming-text.test.ts",
    ],
  },
});
