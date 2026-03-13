import { type ChildProcess, execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  type Browser,
  chromium,
  expect,
  type Page,
  test,
} from "@playwright/test";

import { type MockApiServer, startMockApiServer } from "./mock-api";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const electrobunArtifactsDir = path.join(
  repoRoot,
  "apps",
  "app",
  "electrobun",
  "artifacts",
);
const electrobunBuildDir = path.join(
  repoRoot,
  "apps",
  "app",
  "electrobun",
  "build",
);

function isIgnorableConsoleError(message: string): boolean {
  const patterns = [
    "Electron Security Warning",
    "DevTools failed to load source map",
    "Failed to load resource: net::ERR_FILE_NOT_FOUND",
    "Failed to load resource: net::ERR_CONNECTION_REFUSED",
    "Download the React DevTools", // Often noisy in prod builds if left in
  ];
  return patterns.some((pattern) => message.includes(pattern));
}

function isIgnorableRequestFailure(
  requestUrl: string,
  errorText: string | undefined,
): boolean {
  const failure = errorText ?? "";
  if (
    failure.includes("ERR_CONNECTION_REFUSED") &&
    /https?:\/\/localhost:2138\/api\/auth\/status/.test(requestUrl)
  ) {
    return true;
  }
  return false;
}

// Find a launcher.exe in a given directory
async function findLauncherExe(dir: string): Promise<string | null> {
  async function search(currentDir: string): Promise<string | null> {
    const entries = await fs
      .readdir(currentDir, { withFileTypes: true })
      .catch(() => []);
    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);
      if (entry.isDirectory()) {
        const found = await search(fullPath);
        if (found) return found;
      } else if (
        entry.isFile() &&
        entry.name.toLowerCase() === "launcher.exe"
      ) {
        return fullPath;
      }
    }
    return null;
  }
  return search(dir);
}

// Resolve the launcher.exe to use, extracting a tarball if necessary.
async function resolveWindowsLauncher(tempExtractDir: string): Promise<string> {
  const explicit = process.env.MILADY_TEST_WINDOWS_LAUNCHER_PATH?.trim();
  if (explicit) {
    await fs.access(explicit);
    const resolved = await fs.realpath(explicit);
    console.log(`Using explicit Windows launcher: ${resolved}`);
    return resolved;
  }

  // CI Windows builds already have launcher.exe under the live build output.
  // Prefer that over re-extracting the packaged tarball, which is slow enough
  // to consume the entire Playwright test timeout on hosted runners.
  let launcher = await findLauncherExe(electrobunBuildDir);
  if (launcher) {
    return fs.realpath(launcher);
  }

  // First try to find an already extracted launcher in the artifacts dir
  launcher = await findLauncherExe(electrobunArtifactsDir);
  if (launcher) {
    return fs.realpath(launcher);
  }

  // Otherwise find a .tar.zst in the artifacts dir
  const entries = await fs
    .readdir(electrobunArtifactsDir, { withFileTypes: true })
    .catch(() => []);
  const tarballs = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".tar.zst"))
    .map((entry) => path.join(electrobunArtifactsDir, entry.name));

  if (tarballs.length === 0) {
    throw new Error(
      `No Windows artifacts found in ${electrobunArtifactsDir}. Build Electrobun for Windows first.`,
    );
  }

  // Sort by newest
  const stats = await Promise.all(
    tarballs.map(async (p) => ({ p, stat: await fs.stat(p) })),
  );
  stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  const tarballPath = await fs.realpath(stats[0].p);

  // Make sure we have system tar.exe
  await fs.mkdir(tempExtractDir, { recursive: true });
  console.log(`Extracting ${tarballPath} to ${tempExtractDir}...`);
  await execFileAsync("tar", [
    "--force-local",
    "-xf",
    tarballPath,
    "-C",
    tempExtractDir,
  ]);

  launcher = await findLauncherExe(tempExtractDir);
  if (!launcher) {
    throw new Error(
      `Failed to find launcher.exe in extracted archive ${tarballPath}`,
    );
  }

  return fs.realpath(launcher);
}

async function getFreeTcpPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() =>
          reject(new Error("Unable to resolve free TCP port.")),
        );
        return;
      }
      const { port } = address;
      server.close((closeErr) => {
        if (closeErr) reject(closeErr);
        else resolve(port);
      });
    });
  });
}

async function waitForCdp(debugPort: number, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      // Chromium CDP endpoint exposed by the packaged Windows renderer.
      const response = await fetch(
        `http://127.0.0.1:${debugPort}/json/version`,
      );
      if (response.ok) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Timed out waiting for CDP endpoint at :${debugPort}`);
}

async function waitForAppPage(
  browser: Browser,
  timeoutMs: number,
): Promise<Page> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      for (const page of context.pages()) {
        const url = page.url();
        if (!url.startsWith("devtools://")) return page;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error("Timed out waiting for packaged app renderer page.");
}

function collectProcessLogs(child: ChildProcess): {
  stdout: string[];
  stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const append = (target: string[], chunk: Buffer): void => {
    const text = chunk.toString("utf8");
    if (!text) return;
    target.push(text);
    if (target.length > 2000) target.splice(0, target.length - 2000);
  };
  child.stdout?.on("data", (chunk: Buffer) => append(stdout, chunk));
  child.stderr?.on("data", (chunk: Buffer) => append(stderr, chunk));
  return { stdout, stderr };
}

async function killProcess(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) return;
  child.kill("SIGTERM");
  await new Promise<void>((resolve) => {
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      resolve();
    }, 5000);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

test("packaged Windows app starts and reaches chat/agent-ready state", async () => {
  test.skip(
    process.platform !== "win32",
    "Windows startup test is win32-only.",
  );

  const tempExtractDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "milady-win-e2e-"),
  );
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "milady-win-userdata-"),
  );

  const executablePath = await resolveWindowsLauncher(tempExtractDir);
  const debugPort = await getFreeTcpPort();

  let api: MockApiServer | null = null;
  let browser: Browser | null = null;
  let appProcess: ChildProcess | null = null;
  let processLogs: { stdout: string[]; stderr: string[] } | null = null;

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];

  try {
    api = await startMockApiServer({ onboardingComplete: true, port: 0 });

    appProcess = spawn(
      executablePath,
      // Windows release builds use an embedded CEF/Chromium renderer, so pass
      // the debug port directly to the packaged app and attach over CDP.
      // Keep the WebView2 env var as a compatibility fallback in case the
      // renderer mode changes in the future.
      [`--remote-debugging-port=${debugPort}`],
      {
        cwd: path.dirname(executablePath),
        env: {
          ...process.env,
          MILADY_DESKTOP_SKIP_EMBEDDED_AGENT: "1",
          MILADY_DESKTOP_TEST_API_BASE: api.baseUrl,
          MILADY_DESKTOP_DISABLE_AUTO_UPDATER: "1",
          MILADY_DESKTOP_DISABLE_DEVTOOLS: "1",
          // Compatibility fallback for native Windows webviews.
          WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${debugPort}`,
          // Redirect the Roaming AppData so it doesn't pollute the dev machine's real AppData
          APPDATA: userDataDir,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    processLogs = collectProcessLogs(appProcess);

    const cdpTimeoutMs = process.env.CI ? 240_000 : 120_000;
    try {
      await waitForCdp(debugPort, cdpTimeoutMs);
    } catch (e) {
      const stdoutText = processLogs?.stdout.join("") ?? "";
      const stderrText = processLogs?.stderr.join("") ?? "";
      console.error(
        `CDP endpoint never came up.\nApp stdout:\n${stdoutText}\n\nApp stderr:\n${stderrText}`,
      );
      throw e;
    }
    try {
      browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`, {
        timeout: 120_000,
      });
    } catch (e) {
      const stdoutText = processLogs?.stdout.join("") ?? "";
      const stderrText = processLogs?.stderr.join("") ?? "";
      console.error(
        `CDP connect failed!\nApp stdout:\n${stdoutText}\n\nApp stderr:\n${stderrText}`,
      );
      throw e;
    }
    const page = await waitForAppPage(browser, 120_000);

    page.on("console", (msg) => {
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
      if (isIgnorableRequestFailure(request.url(), failure?.errorText)) return;
      requestFailures.push(
        `${request.method()} ${request.url()} :: ${failure?.errorText ?? "failed"}`,
      );
    });

    // Ensure desktop layout so the nav tabs are visible
    await page.setViewportSize({ width: 1280, height: 720 });

    await expect(page.getByPlaceholder("Type a message...")).toBeVisible({
      timeout: 120_000,
    });
    // Status pill verifies app reached ready state
    await expect(page.getByTestId("status-pill")).toBeVisible({
      timeout: 30_000,
    });
    expect(
      api.requests.some((request) => request.includes("/api/status")),
    ).toBe(true);

    const stdoutText = processLogs?.stdout.join("") ?? "";
    const stderrText = processLogs?.stderr.join("") ?? "";
    expect(
      pageErrors,
      `Page errors:\n${pageErrors.join("\n")}\n\nMock requests:\n${api.requests.join("\n")}\n\nApp stderr:\n${stderrText}`,
    ).toEqual([]);
    expect(
      requestFailures,
      `Failed requests:\n${requestFailures.join("\n")}\n\nMock requests:\n${api.requests.join("\n")}\n\nApp stderr:\n${stderrText}`,
    ).toEqual([]);
    expect(
      consoleErrors,
      `Console errors:\n${consoleErrors.join("\n")}\n\nMock requests:\n${api.requests.join("\n")}\n\nApp stdout:\n${stdoutText}\n\nApp stderr:\n${stderrText}`,
    ).toEqual([]);
  } finally {
    await browser?.close().catch(() => undefined);
    await api?.close().catch(() => undefined);
    if (appProcess) await killProcess(appProcess);
    await fs
      .rm(tempExtractDir, { recursive: true, force: true })
      .catch(() => undefined);
    await fs
      .rm(userDataDir, { recursive: true, force: true })
      .catch(() => undefined);
  }
});
