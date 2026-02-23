import { test, expect } from "@playwright/test";
import { mockApi } from "./helpers";

test.describe("Autonomy indicator", () => {
  test("autonomy indicator is visible in header", async ({ page }) => {
    await mockApi(page);
    await page.goto("/chat");
  });

  test("there is no autonomy toggle checkbox", async ({ page }) => {
    await mockApi(page);
    await page.goto("/chat");
    // The old checkbox should no longer exist
    await expect(page.locator("[data-action='autonomy-toggle']")).toHaveCount(0);
  });
});
