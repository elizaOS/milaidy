import { expect, test } from "@playwright/test";
import { mockApi } from "./helpers";

test.describe("Skills marketplace", () => {
  test("searches and installs a marketplace skill", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/skills");

    // Switch to the Browse & Install tab
    await page.getByRole("button", { name: "Browse & Install" }).click();

    const searchInput = page.getByPlaceholder("Search skills by keyword...");
    await searchInput.fill("installer");
    await searchInput.press("Enter");

    const card = page.locator("[data-skill-marketplace-id='skill-installer']");
    await expect(card).toBeVisible();
    await card.getByRole("button", { name: "Install" }).click();

    await expect(page.getByText(/Installed skill: skill-installer/i)).toBeVisible();
    await expect(card.getByRole("button", { name: "Uninstall" })).toBeVisible();

    // Switch back to My Skills to see the installed skill
    await page.getByRole("button", { name: "My Skills" }).click();
    await expect(page.locator(".plugin-item[data-skill-id='skill-installer']")).toBeVisible();
  });

  test("installs skill via github URL", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/skills");

    // Switch to the Browse & Install tab
    await page.getByRole("button", { name: "Browse & Install" }).click();

    const urlInput = page.getByPlaceholder("Install via GitHub URL (repo or /tree/... path)");
    await urlInput.fill("https://github.com/openai/skills/tree/main/skills/.curated/agents-ui");
    await page.getByRole("button", { name: "Install URL" }).click();

    await expect(page.getByText(/Skill installed from GitHub URL/i)).toBeVisible();

    // Switch back to My Skills to see the installed skill
    await page.getByRole("button", { name: "My Skills" }).click();
    await expect(page.locator(".plugin-item[data-skill-id='agents-ui']")).toBeVisible();
  });

  test("toggles loaded skill enablement", async ({ page }) => {
    await mockApi(page, { onboardingComplete: true, agentState: "running" });
    await page.goto("/skills");

    const toggle = page.locator("[data-skill-toggle='image-gen']");
    await expect(toggle).not.toBeChecked();
    await toggle.click();
    await expect(toggle).toBeChecked();
    await expect(page.getByText(/Image Generation enabled/i)).toBeVisible();
  });

  test("shows search guidance when SKILLSMP key is missing", async ({ page }) => {
    await mockApi(page, {
      onboardingComplete: true,
      agentState: "running",
      skillsMarketplaceSearchError: "SKILLSMP_API_KEY is not set. Add it to enable Skills marketplace search.",
    });
    await page.goto("/skills");

    // Switch to the Browse & Install tab
    await page.getByRole("button", { name: "Browse & Install" }).click();

    await page.getByPlaceholder("Search skills by keyword...").fill("agent");
    await page.getByRole("button", { name: "Search" }).click();

    await expect(page.getByText(/SKILLSMP_API_KEY is not set/i).last()).toBeVisible();
    await expect(page.getByText(/install directly via GitHub URL/i)).toBeVisible();
  });
});
