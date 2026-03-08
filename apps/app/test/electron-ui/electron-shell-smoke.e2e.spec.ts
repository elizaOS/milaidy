import fs from "node:fs/promises";
import http from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { expect, test, type Page } from "playwright/test";

import { type MockApiServer, startMockApiServer } from "./mock-api";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const distDir = path.join(repoRoot, "apps", "app", "dist");
const distIndex = path.join(distDir, "index.html");

interface StaticAppServer {
  baseUrl: string;
  close: () => Promise<void>;
}

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".wasm": "application/wasm",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

async function ensureRendererBuild(): Promise<void> {
  await fs.access(distIndex);
}

async function startStaticAppServer(): Promise<StaticAppServer> {
  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(requestUrl.pathname);
    const candidatePath =
      pathname === "/"
        ? distIndex
        : path.join(distDir, pathname.replace(/^\/+/, ""));
    const normalizedPath = path.normalize(candidatePath);
    const safePath = normalizedPath.startsWith(distDir)
      ? normalizedPath
      : distIndex;

    let filePath = safePath;
    try {
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        filePath = distIndex;
      }
    } catch {
      filePath = distIndex;
    }

    try {
      const body = await fs.readFile(filePath);
      const extension = path.extname(filePath).toLowerCase();
      res.statusCode = 200;
      res.setHeader(
        "Content-Type",
        MIME_TYPES[extension] ?? "application/octet-stream",
      );
      res.end(body);
    } catch {
      res.statusCode = 404;
      res.end("not found");
    }
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address() as AddressInfo;
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

async function openShell(page: Page, apiBaseUrl: string, appBaseUrl: string) {
  await page.addInitScript((baseUrl) => {
    (
      window as Window & {
        __MILADY_API_BASE__?: string;
      }
    ).__MILADY_API_BASE__ = baseUrl;
    window.localStorage.setItem("milady:ui-shell-mode", "native");
  }, apiBaseUrl);

  await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("shell-header")).toBeVisible();
  await expect(page.locator("[data-testid='chat-composer-input']").first()).toBeVisible();
}

test.describe("electron shell smoke", () => {
  let api: MockApiServer;
  let staticApp: StaticAppServer;

  test.beforeAll(async () => {
    await ensureRendererBuild();
    api = await startMockApiServer({ onboardingComplete: true, port: 0 });
    staticApp = await startStaticAppServer();
  });

  test.afterAll(async () => {
    await staticApp?.close();
    await api?.close();
  });

  test("mobile nav opens and closes", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openShell(page, api.baseUrl, staticApp.baseUrl);

    await page.getByTestId("nav-mobile-open").click();
    await expect(page.getByTestId("nav-mobile-panel")).toBeVisible();

    await page.getByTestId("nav-mobile-close").click();
    await expect(page.getByTestId("nav-mobile-panel")).toBeHidden();
  });

  test("command palette navigates to logs", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await openShell(page, api.baseUrl, staticApp.baseUrl);

    await page.keyboard.press("Control+K");
    await expect(page.getByTestId("palette-root")).toBeVisible();

    await page.getByTestId("palette-input").fill("logs");
    await page.keyboard.press("Enter");

    await expect(page.getByTestId("palette-root")).toBeHidden();
    await expect(page.getByTestId("log-entry").first()).toBeVisible();
  });

  test("chat send and stop flow stays interactive", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 });
    await openShell(page, api.baseUrl, staticApp.baseUrl);

    const composer = page.locator("[data-testid='chat-composer-input']").first();
    const sendButton = page.locator("[data-testid='chat-send-button']").first();
    const stopButton = page.locator("[data-testid='chat-stop-button']").first();

    await composer.fill("Smoke test message");
    await sendButton.click();

    await expect(stopButton).toBeVisible();
    await stopButton.click();

    await expect(stopButton).toBeHidden();
    await expect(sendButton).toBeVisible();
    await expect(page.getByText("Smoke test message")).toBeVisible();
  });
});
