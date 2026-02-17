import fs from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type ElectronApplication,
  _electron as electron,
  expect,
  type Page,
  test,
} from "@playwright/test";

import { type MockApiServer, startMockApiServer } from "./mock-api";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const electronAppDir = path.join(repoRoot, "apps", "app", "electron");
const webDistIndex = path.join(repoRoot, "apps", "app", "dist", "index.html");
const electronEntryCandidates = [
  path.join(electronAppDir, "out", "src", "index"),
  path.join(electronAppDir, "build", "src", "index"),
];

function isIgnorableConsoleError(message: string): boolean {
  const patterns = [
    "Electron Security Warning",
    "DevTools failed to load source map",
  ];
  return patterns.some((pattern) => message.includes(pattern));
}

async function ensureBuildArtifacts(): Promise<void> {
  await fs.access(webDistIndex);
  let hasElectronEntry = false;
  for (const candidate of electronEntryCandidates) {
    try {
      await fs.access(candidate);
      hasElectronEntry = true;
      break;
    } catch {
      // Try next candidate.
    }
  }
  if (!hasElectronEntry) {
    throw new Error(
      `Electron build artifact not found. Tried:\n${electronEntryCandidates.join("\n")}`,
    );
  }
}

async function clickOnboardingNext(page: Page): Promise<void> {
  await page.getByRole("button", { name: /^next$/i }).click();
}

test("electron app startup: onboarding -> chat -> all pages", async () => {
  await ensureBuildArtifacts();

  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "milady-electron-e2e-"),
  );
  let api: MockApiServer | null = null;
  let app: ElectronApplication | null = null;

  const consoleErrors: string[] = [];
  const consoleLogs: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];

  try {
    api = await startMockApiServer({ onboardingComplete: false, port: 0 });

    const electronRequire = createRequire(
      path.join(electronAppDir, "package.json"),
    );
    const electronExecutable = electronRequire("electron") as string;

    app = await electron.launch({
      executablePath: electronExecutable,
      cwd: electronAppDir,
      args: [electronAppDir],
      env: {
        ...process.env,
        MILADY_ELECTRON_SKIP_EMBEDDED_AGENT: "1",
        MILADY_ELECTRON_TEST_API_BASE: api.baseUrl,
        MILADY_ELECTRON_DISABLE_AUTO_UPDATER: "1",
        MILADY_ELECTRON_DISABLE_DEVTOOLS: "1",
        MILADY_ELECTRON_USER_DATA_DIR: userDataDir,
      },
    });

    const page = await app.firstWindow();
    page.on("console", (msg) => {
      consoleLogs.push(`[${msg.type()}] ${msg.text()}`);
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (isIgnorableConsoleError(text)) return;
      consoleErrors.push(text);
    });
    page.on("pageerror", (error) => {
      pageErrors.push(String(error));
    });
    page.on("requestfailed", (request) => {
      const failure = request.failure();
      requestFailures.push(
        `${request.method()} ${request.url()} :: ${failure?.errorText ?? "failed"}`,
      );
    });

    // Startup can be fast enough to skip the loading text and render onboarding directly.
    await expect
      .poll(
        async () => {
          const loadingVisible = await page
            .getByText(/starting backend|initializing agent/i)
            .isVisible()
            .catch(() => false);
          const onboardingVisible = await page
            .getByText(/welcome to milady/i)
            .isVisible()
            .catch(() => false);
          return loadingVisible || onboardingVisible;
        },
        { timeout: 60_000 },
      )
      .toBe(true);
    await expect
      .poll(
        async () => {
          return page.evaluate(
            () =>
              (window as { __MILADY_API_BASE__?: string })
                .__MILADY_API_BASE__ ?? null,
          );
        },
        { timeout: 30_000 },
      )
      .not.toBeNull();
    try {
      await expect(page.getByText(/welcome to milady/i)).toBeVisible({
        timeout: 60_000,
      });
    } catch (error) {
      const apiBase = await page.evaluate(
        () =>
          (window as { __MILADY_API_BASE__?: string }).__MILADY_API_BASE__ ??
          null,
      );
      const onboardingStatus = await page.evaluate(() => {
        const rootText = document.body?.innerText ?? "";
        return rootText.trim().slice(0, 800);
      });
      throw new Error(
        `Onboarding welcome did not appear. apiBase=${String(apiBase)}.\n` +
          `Body text:\n${onboardingStatus}\n\n` +
          `Mock requests:\n${api.requests.join("\n")}\n\n` +
          `Console logs:\n${consoleLogs.join("\n")}\n\n` +
          `Page errors:\n${pageErrors.join("\n")}\n\n` +
          `Request failures:\n${requestFailures.join("\n")}\n\n` +
          `Original error: ${error instanceof Error ? error.message : String(error)}`,
      );
    }

    await clickOnboardingNext(page); // welcome -> name
    await page.getByRole("button", { name: "Milady", exact: true }).click();
    await clickOnboardingNext(page); // name -> avatar

    await clickOnboardingNext(page); // avatar -> style
    await page.getByRole("button", { name: /chaotic/i }).click();
    await clickOnboardingNext(page); // style -> theme

    await page
      .getByRole("button", { name: /milady/i })
      .first()
      .click();
    await clickOnboardingNext(page); // theme -> runMode

    await page.getByRole("button", { name: /local \(raw\)/i }).click();
    await clickOnboardingNext(page); // runMode -> llm provider

    await page
      .getByRole("button", { name: /ollama/i })
      .first()
      .click();
    await clickOnboardingNext(page); // llm provider -> inventory setup
    await clickOnboardingNext(page); // inventory setup -> connectors
    await clickOnboardingNext(page); // connectors -> permissions
    await page.getByRole("button", { name: /^continue$/i }).click(); // permissions -> finish

    await expect(page.getByPlaceholder("Type a message...")).toBeVisible({
      timeout: 45_000,
    });
    await expect(page).toHaveURL(/\/chat$/);

    const topNav = page.locator("nav");

    await topNav
      .getByRole("button", { name: "Character", exact: true })
      .click();
    await expect(page).toHaveURL(/\/character$/);
    await expect(page.getByText("Identity & Personality")).toBeVisible();

    await topNav.getByRole("button", { name: "Wallets", exact: true }).click();
    await expect(page).toHaveURL(/\/wallets$/);
    await expect(
      page
        .getByRole("button", { name: "Tokens", exact: true })
        .or(page.getByText("Wallet keys not configured", { exact: true })),
    ).toBeVisible();

    await topNav
      .getByRole("button", { name: "Knowledge", exact: true })
      .click();
    await expect(page).toHaveURL(/\/knowledge$/);
    await expect(
      page.getByRole("heading", { name: "Knowledge Base", exact: true }),
    ).toBeVisible();

    await topNav.getByRole("button", { name: "Social", exact: true }).click();
    await expect(page).toHaveURL(/\/connectors$/);
    await expect(page.getByPlaceholder("Search connectors...")).toBeVisible();

    await topNav.getByRole("button", { name: "Apps", exact: true }).click();
    await expect(page).toHaveURL(/\/apps$/);
    await expect(page.getByPlaceholder("Search apps...")).toBeVisible();

    await topNav.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page).toHaveURL(/\/settings$/);
    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();

    await topNav.getByRole("button", { name: "Advanced", exact: true }).click();
    await expect(page).toHaveURL(/\/advanced$/);

    await page.getByRole("button", { name: "Plugins", exact: true }).click();
    await expect(page).toHaveURL(/\/plugins$/);
    await expect(page.getByPlaceholder("Search plugins...")).toBeVisible();

    await page.getByRole("button", { name: "Skills", exact: true }).click();
    await expect(page).toHaveURL(/\/skills$/);
    await expect(page.getByPlaceholder("Filter skills...")).toBeVisible();

    await page.getByRole("button", { name: "Actions", exact: true }).click();
    await expect(page).toHaveURL(/\/actions$/);
    await expect(
      page.getByRole("heading", { name: "Custom Actions", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Triggers", exact: true }).click();
    await expect(page).toHaveURL(/\/triggers$/);
    const triggerHealthHeading = page.getByRole("heading", {
      name: "Trigger Health",
      exact: true,
    });
    if ((await triggerHealthHeading.count()) === 0) {
      const triggerBodyText = await page.evaluate(() => {
        const text = document.body?.innerText ?? "";
        return text.trim().slice(0, 1200);
      });
      throw new Error(
        `Triggers page heading missing.\n` +
          `Body text:\n${triggerBodyText}\n\n` +
          `Console logs:\n${consoleLogs.join("\n")}\n\n` +
          `Page errors:\n${pageErrors.join("\n")}\n\n` +
          `Request failures:\n${requestFailures.join("\n")}\n\n` +
          `Mock requests:\n${api.requests.join("\n")}`,
      );
    }

    await page
      .getByRole("button", { name: "Fine-Tuning", exact: true })
      .click();
    await expect(page).toHaveURL(/\/fine-tuning$/);
    await expect(
      page.getByRole("heading", { name: "Fine-Tuning", exact: true }),
    ).toBeVisible();

    await page
      .getByRole("button", { name: "Trajectories", exact: true })
      .click();
    await expect(page).toHaveURL(/\/trajectories$/);
    await expect(page.getByPlaceholder("Search...")).toBeVisible();

    await page.getByRole("button", { name: "Runtime", exact: true }).click();
    await expect(page).toHaveURL(/\/runtime$/);
    await expect(page.getByText("Runtime Debug")).toBeVisible();

    await page.getByRole("button", { name: "Databases", exact: true }).click();
    await expect(page).toHaveURL(/\/database$/);
    await expect(
      page.getByRole("heading", { name: "Databases", exact: true }),
    ).toBeVisible();

    await page.getByRole("button", { name: "Logs", exact: true }).click();
    await expect(page).toHaveURL(/\/logs$/);
    await expect(
      page.getByRole("heading", { name: "Logs", exact: true }),
    ).toBeVisible();

    expect(
      pageErrors,
      `Page errors:\n${pageErrors.join("\n")}\n\nConsole logs:\n${consoleLogs.join("\n")}\n\nMock requests:\n${api.requests.join("\n")}`,
    ).toEqual([]);
    expect(
      requestFailures,
      `Failed requests:\n${requestFailures.join("\n")}\n\nConsole logs:\n${consoleLogs.join("\n")}\n\nMock requests:\n${api.requests.join("\n")}`,
    ).toEqual([]);
    expect(
      consoleErrors,
      `Console errors:\n${consoleErrors.join("\n")}\n\nConsole logs:\n${consoleLogs.join("\n")}\n\nMock requests:\n${api.requests.join("\n")}`,
    ).toEqual([]);
  } finally {
    await app?.close();
    await api?.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});
