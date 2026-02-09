import { test, expect, type Locator } from "@playwright/test";
import { mockApi } from "./helpers";

/** Click the visual toggle switch that wraps a hidden checkbox. */
async function clickToggle(toggle: Locator): Promise<void> {
  await toggle.evaluate((el) => (el as HTMLInputElement).click());
}

test.describe("Plugins page", () => {
  test.beforeEach(async ({ page }) => {
    await mockApi(page);
    await page.goto("/");
    await page.locator("a").filter({ hasText: "Plugins" }).click();
    await expect(page.locator("h2").first()).toHaveText("Plugins");
  });

  // --- Display ---

  test("displays the plugins heading and subtitle", async ({ page }) => {
    await expect(page.locator(".subtitle").first()).toContainText("plugins discovered");
  });

  test("lists all plugins from mock data", async ({ page }) => {
    const items = page.locator("[data-plugin-id]");
    await expect(items).toHaveCount(11);
  });

  test("shows plugin names and descriptions", async ({ page }) => {
    await expect(page.locator(".pc-name").first()).toBeTruthy();
    await expect(page.locator(".pc-desc").first()).toBeTruthy();
  });

  test("shows enabled/disabled toggle for each plugin", async ({ page }) => {
    const toggles = page.locator("[data-plugin-toggle]");
    await expect(toggles).toHaveCount(11);
  });

  test("enabled plugins have checked toggles", async ({ page }) => {
    const anthropicToggle = page.locator("[data-plugin-toggle='anthropic']");
    await expect(anthropicToggle).toBeChecked();
  });

  test("disabled plugins have unchecked toggles", async ({ page }) => {
    const groqToggle = page.locator("[data-plugin-toggle='groq']");
    await expect(groqToggle).not.toBeChecked();
  });

  test("blocks enabling plugin when required settings are missing and shows reason", async ({ page }) => {
    const groqToggle = page.locator("[data-plugin-toggle='groq']");
    await expect(groqToggle).not.toBeChecked();

    let requested = false;
    page.on("request", (req) => {
      if (req.method() === "PUT" && req.url().includes("/api/plugins/groq")) {
        requested = true;
      }
    });

    await clickToggle(groqToggle);
    await page.waitForTimeout(250);

    expect(requested).toBe(false);
    await expect(groqToggle).not.toBeChecked();
    await expect(page.getByText(/Cannot enable Groq/i)).toBeVisible();
  });

  // --- Toggle ON: disabled -> enabled ---

  test("toggling a disabled plugin ON sends PUT with enabled:true", async ({ page }) => {
    const ollamaToggle = page.locator("[data-plugin-toggle='ollama']");
    await expect(ollamaToggle).not.toBeChecked();

    const requestPromise = page.waitForRequest((req) =>
      req.url().includes("/api/plugins/ollama") && req.method() === "PUT",
    );

    await clickToggle(ollamaToggle);

    const request = await requestPromise;
    const body = request.postDataJSON() as { enabled: boolean };
    expect(body.enabled).toBe(true);
  });

  test("toggling a disabled plugin ON updates the checkbox state", async ({ page }) => {
    const ollamaToggle = page.locator("[data-plugin-toggle='ollama']");
    await expect(ollamaToggle).not.toBeChecked();

    await clickToggle(ollamaToggle);
    await expect(ollamaToggle).toBeChecked();
  });

  // --- Toggle OFF: enabled -> disabled ---

  test("toggling an enabled plugin OFF sends PUT with enabled:false", async ({ page }) => {
    const anthropicToggle = page.locator("[data-plugin-toggle='anthropic']");
    await expect(anthropicToggle).toBeChecked();

    const requestPromise = page.waitForRequest((req) =>
      req.url().includes("/api/plugins/anthropic") && req.method() === "PUT",
    );

    await clickToggle(anthropicToggle);

    const request = await requestPromise;
    const body = request.postDataJSON() as { enabled: boolean };
    expect(body.enabled).toBe(false);
  });

  test("toggling an enabled plugin OFF updates the checkbox state", async ({ page }) => {
    const anthropicToggle = page.locator("[data-plugin-toggle='anthropic']");
    await expect(anthropicToggle).toBeChecked();

    await clickToggle(anthropicToggle);
    await expect(anthropicToggle).not.toBeChecked();
  });

  // --- Toggle round-trip: OFF -> ON -> OFF ---

  test("plugin toggle round-trip: disable then re-enable", async ({ page }) => {
    const browserToggle = page.locator("[data-plugin-toggle='browser']");
    await expect(browserToggle).toBeChecked();

    await clickToggle(browserToggle);
    await expect(browserToggle).not.toBeChecked();

    await clickToggle(browserToggle);
    await expect(browserToggle).toBeChecked();
  });

  // --- Multiple plugin toggles ---

  test("can toggle multiple plugins independently", async ({ page }) => {
    const ollama = page.locator("[data-plugin-toggle='ollama']");
    const cron = page.locator("[data-plugin-toggle='cron']");

    await expect(ollama).not.toBeChecked();
    await expect(cron).not.toBeChecked();

    await clickToggle(ollama);
    await clickToggle(cron);

    await expect(ollama).toBeChecked();
    await expect(cron).toBeChecked();
  });

  // --- Category filtering ---

  test("shows category filter buttons", async ({ page }) => {
    const filterBtns = page.locator(".pc-filters .pc-filter-btn");
    const count = await filterBtns.count();
    expect(count).toBeGreaterThanOrEqual(4); // at least all + 3 categories
  });

  test("'All' filter is active by default", async ({ page }) => {
    const allBtn = page.locator(".pc-filter-btn.active");
    await expect(allBtn).toContainText("All");
  });

  test("switching back to 'All' shows all plugins again", async ({ page }) => {
    // Click any non-all filter first
    const filters = page.locator(".pc-filters .pc-filter-btn");
    await filters.nth(1).click();
    // Then click All
    await filters.nth(0).click();
    await expect(page.locator("[data-plugin-id]")).toHaveCount(11);
  });

  // --- Toggle within filtered view ---

  test("can toggle a plugin within a filtered category view", async ({ page }) => {
    // Click All filter first to ensure we see all plugins
    const filters = page.locator(".pc-filters .pc-filter-btn");
    await filters.first().click();

    // Find the ollama toggle (known to be unchecked, no validation errors)
    const ollamaToggle = page.locator("[data-plugin-toggle='ollama']");
    await expect(ollamaToggle).not.toBeChecked();

    const requestPromise = page.waitForRequest((req) =>
      req.url().includes("/api/plugins/ollama") && req.method() === "PUT",
    );

    await clickToggle(ollamaToggle);
    await requestPromise;
    await expect(ollamaToggle).toBeChecked();
  });
});
