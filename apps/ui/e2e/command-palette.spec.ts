import { test, expect } from "@playwright/test";
import { mockApi } from "./helpers";

test.describe("Command palette", () => {
  test("opens via header button and executes navigation command", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    // Open command palette from the Cmd+K button in header
    await page.locator("header button").filter({ hasText: "Cmd+K" }).click();
    await expect(page.getByPlaceholder("Type to search commands...")).toBeVisible();

    // Select "Open Plugins"
    await page.getByRole("button", { name: "Open Plugins" }).click();

    // Should navigate to plugins — verify by the presence of plugin cards
    await expect(page.locator("[data-plugin-id]").first()).toBeVisible();
  });

  test("supports keyboard execution", async ({ page }) => {
    await mockApi(page, { agentState: "running" });
    await page.goto("/chat");

    // Open via Cmd+K button
    await page.locator("header button").filter({ hasText: "Cmd+K" }).click();
    const input = page.getByPlaceholder("Type to search commands...");
    await expect(input).toBeVisible();

    // Type "logs" to filter, then Enter to select
    await input.fill("Logs");
    await input.press("Enter");

    // Should navigate to logs — verify by the presence of the level filter unique to LogsView
    await expect(page.locator("select").filter({ hasText: "All levels" })).toBeVisible();
  });
});
