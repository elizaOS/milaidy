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
    exclude: baseTest.exclude ?? [],
  },
});
