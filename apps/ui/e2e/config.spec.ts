import { test, expect } from "@playwright/test";
import { mockApi } from "./helpers";

test.describe("Config page", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.locator("a").filter({ hasText: "Config" }).click();
    await page.waitForTimeout(300);
  });

  test("displays settings heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
  });

  test("shows Danger Zone section", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Danger Zone" })).toBeVisible();
  });

  test("Reset Everything button is visible", async ({ page }) => {
    await expect(page.locator("button").filter({ hasText: "Reset Everything" })).toBeVisible();
  });
});

test.describe("Config page — Chrome Extension", () => {
  test("shows Chrome Extension section with Check Connection button", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.locator("a").filter({ hasText: "Config" }).click();
    await page.waitForTimeout(300);

    // Section heading
    await expect(page.locator("text=Chrome Extension").first()).toBeVisible();
    // Check Connection button
    await expect(page.locator("button").filter({ hasText: "Check Connection" })).toBeVisible();
  });

  test("shows installation instructions", async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.locator("a").filter({ hasText: "Config" }).click();
    await page.waitForTimeout(300);

    await expect(page.locator("text=Install Chrome Extension")).toBeVisible();
    await expect(page.locator("text=chrome://extensions")).toBeVisible();
    await expect(page.locator("text=Developer mode")).toBeVisible();
    await expect(page.locator("text=Load unpacked")).toBeVisible();
  });

  test("Check Connection shows relay NOT reachable", async ({ page }) => {
    await mockApi(page, { extensionRelayReachable: false });
    await page.goto("/");
    await page.locator("a").filter({ hasText: "Config" }).click();
    await page.waitForTimeout(300);

    // Click check connection
    await page.locator("button").filter({ hasText: "Check Connection" }).click();
    await page.waitForTimeout(500);

    // Should show Not Reachable status
    await expect(page.locator("text=Not Reachable")).toBeVisible();
    await expect(page.locator("text=ws://127.0.0.1:18792/extension")).toBeVisible();
  });

  test("Check Connection shows relay connected", async ({ page }) => {
    await mockApi(page, { extensionRelayReachable: true });
    await page.goto("/");
    await page.locator("a").filter({ hasText: "Config" }).click();
    await page.waitForTimeout(300);

    // Click check connection
    await page.locator("button").filter({ hasText: "Check Connection" }).click();
    await page.waitForTimeout(500);

    // Should show Connected status
    await expect(page.locator("text=Connected").first()).toBeVisible();
    await expect(page.locator("text=ws://127.0.0.1:18792/extension")).toBeVisible();
  });

  test("shows extension path when available", async ({ page }) => {
    await mockApi(page, { extensionRelayReachable: true });
    await page.goto("/");
    await page.locator("a").filter({ hasText: "Config" }).click();
    await page.waitForTimeout(500);

    // The extension path should appear in the rendered output
    await expect(page.getByText("Extension path:")).toBeVisible();
  });

  test("auto-checks extension status when navigating to config", async ({ page }) => {
    await mockApi(page, { extensionRelayReachable: true });
    await page.goto("/");
    await page.locator("a").filter({ hasText: "Config" }).click();
    // The config page auto-checks on navigation
    await page.waitForTimeout(500);

    // Should already show connected (auto-check on tab open)
    await expect(page.locator("text=Connected").first()).toBeVisible();
  });
});
