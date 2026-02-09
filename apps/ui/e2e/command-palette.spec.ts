import { expect, test } from "@playwright/test";
import { mockApi } from "./helpers";

/** Open the command palette via the header button. */
async function openPalette(page: import("@playwright/test").Page): Promise<void> {
  await page.locator(".lifecycle-btn", { hasText: "Cmd+K" }).click();
  await expect(page.getByPlaceholder("Type a command...")).toBeVisible();
}

test.describe("Command palette", () => {
  test("opens via header button and executes navigation command", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/chat");
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();

    await openPalette(page);
    await page.getByRole("button", { name: "Open Plugins" }).click();

    await expect(page).toHaveURL(/\/plugins/);
    await expect(page.locator("h2").first()).toHaveText("Plugins");
  });

  test("supports keyboard execution from query (Enter)", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/chat");
    await expect(page.getByPlaceholder("Type a message...")).toBeVisible();

    await openPalette(page);
    await page.getByPlaceholder("Type a command...").fill("open logs");
    await page.keyboard.press("Enter");

    await expect(page).toHaveURL(/\/logs/);
    await expect(page.getByRole("heading", { name: "Logs" })).toBeVisible();
  });
});
