import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test/electron-ui",
  testMatch: ["**/*.e2e.spec.ts"],
  timeout: 180_000,
  expect: {
    timeout: 20_000,
  },
  workers: 1,
  fullyParallel: false,
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
});
