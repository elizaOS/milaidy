import { defineConfig } from "vitest/config";
import baseConfig from "./vitest.config.ts";

const baseTest =
  (baseConfig as { test?: { include?: string[]; exclude?: string[] } }).test ??
  {};
const baseInclude = baseTest.include ?? [
  "src/**/*.test.ts",
  "test/format-error.test.ts",
];
const rootUnitInclude = baseInclude.filter(
  (pattern) => !pattern.startsWith("apps/app/"),
);

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseTest,
    include: rootUnitInclude,
    exclude: baseTest.exclude ?? [],
  },
});
