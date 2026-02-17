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

test("electron auth + onboarding permissions flow works end-to-end", async () => {
  await ensureBuildArtifacts();

  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "milady-electron-e2e-auth-"),
  );
  let api: MockApiServer | null = null;
  let app: ElectronApplication | null = null;

  try {
    api = await startMockApiServer({
      onboardingComplete: false,
      port: 0,
      auth: {
        token: "desktop-auth-token",
        pairingCode: "1234-5678",
        pairingEnabled: true,
      },
      permissions: {
        accessibility: { status: "denied", canRequest: true },
        "screen-recording": { status: "denied", canRequest: true },
        microphone: { status: "denied", canRequest: true },
      },
    });

    const electronRequire = createRequire(
      path.join(electronAppDir, "package.json"),
    );
    const electronExecutable = electronRequire("electron") as string;

    const launchApp = async (token?: string): Promise<Page> => {
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
          MILADY_API_TOKEN: token ?? "",
        },
      });
      return app.firstWindow();
    };

    const unauthPage = await launchApp();
    await expect(
      unauthPage.getByRole("heading", { name: /pairing required/i }),
    ).toBeVisible({
      timeout: 60_000,
    });
    await app.close();
    app = null;

    const page = await launchApp("desktop-auth-token");
    await expect(page.getByText(/welcome to milady/i)).toBeVisible({
      timeout: 60_000,
    });

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

    await expect(page.getByRole("button", { name: /^continue$/i })).toHaveCount(
      0,
    );

    await page
      .getByRole("button", { name: /^grant$/i })
      .nth(0)
      .click();
    await page
      .getByRole("button", { name: /^grant$/i })
      .nth(0)
      .click();
    await page
      .getByRole("button", { name: /^grant$/i })
      .nth(0)
      .click();

    await expect(page.getByRole("button", { name: /^continue$/i })).toBeVisible(
      { timeout: 20_000 },
    );
    await page.getByRole("button", { name: /^continue$/i }).click();

    await expect(page.getByPlaceholder("Type a message...")).toBeVisible({
      timeout: 45_000,
    });
    expect(api.requests).toContain("GET /api/auth/status");
    expect(api.requests).toContain("GET /api/onboarding/status");
  } finally {
    await app?.close();
    await api?.close();
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});
