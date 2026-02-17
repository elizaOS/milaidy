import {
  type ChildProcessWithoutNullStreams,
  execFile,
  spawn,
} from "node:child_process";
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

import {
  type MockApiServer,
  startMockApiServer,
} from "../electron-ui/mock-api";

const execFileAsync = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../..");
const electronDistDir = path.join(repoRoot, "apps", "app", "electron", "dist");
const appBundleName = "Milady.app";
const appExecutableName = "Milady";

function isIgnorableConsoleError(message: string): boolean {
  const patterns = [
    "Electron Security Warning",
    "DevTools failed to load source map",
    "Failed to load resource: net::ERR_FILE_NOT_FOUND",
    "Failed to load resource: net::ERR_CONNECTION_REFUSED",
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

async function resolveDmgPath(): Promise<string> {
  const explicit = process.env.MILADY_TEST_DMG_PATH?.trim();
  if (explicit) {
    await fs.access(explicit);
    return fs.realpath(explicit);
  }

  const entries = await fs.readdir(electronDistDir, { withFileTypes: true });
  const dmgs = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".dmg"))
    .map((entry) => path.join(electronDistDir, entry.name));

  if (dmgs.length === 0) {
    throw new Error(
      `No DMG artifacts found in ${electronDistDir}. Build DMG first.`,
    );
  }

  const stats = await Promise.all(
    dmgs.map(async (dmgPath) => ({ dmgPath, stat: await fs.stat(dmgPath) })),
  );
  stats.sort((a, b) => b.stat.mtimeMs - a.stat.mtimeMs);
  return fs.realpath(stats[0].dmgPath);
}

function extractMountPointFromDiskLine(line: string): string | null {
  if (!line.startsWith("/dev/disk")) return null;
  const parts = line.split("\t");
  const mountPoint = parts[parts.length - 1]?.trim() ?? "";
  return mountPoint.startsWith("/") ? mountPoint : null;
}

async function findExistingMountPoint(dmgPath: string): Promise<string | null> {
  const { stdout } = await execFileAsync("hdiutil", ["info"]);
  const blocks = stdout.split(
    "================================================",
  );
  for (const block of blocks) {
    if (!block.includes(`image-path      : ${dmgPath}`)) continue;
    const lines = block.split("\n").map((line) => line.trimEnd());
    for (const line of lines) {
      const mountPoint = extractMountPointFromDiskLine(line);
      if (mountPoint) return mountPoint;
    }
  }
  return null;
}

async function attachOrReuseDmg(
  dmgPath: string,
): Promise<{ mountPoint: string; detachWhenDone: boolean }> {
  const existing = await findExistingMountPoint(dmgPath);
  if (existing) {
    return { mountPoint: existing, detachWhenDone: false };
  }

  const { stdout, stderr } = await execFileAsync("hdiutil", [
    "attach",
    dmgPath,
    "-nobrowse",
    "-readonly",
  ]);
  const output = `${stdout}\n${stderr}`;
  const lines = output.split("\n").map((line) => line.trimEnd());
  for (const line of lines) {
    const mountPoint = extractMountPointFromDiskLine(line);
    if (mountPoint) {
      return { mountPoint, detachWhenDone: true };
    }
  }

  throw new Error(
    `Unable to determine DMG mount point from hdiutil output:\n${output}`,
  );
}

async function unmountDmg(mountPoint: string): Promise<void> {
  try {
    await execFileAsync("hdiutil", ["detach", mountPoint]);
  } catch {
    await execFileAsync("hdiutil", ["detach", mountPoint, "-force"]).catch(
      () => undefined,
    );
  }
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

function collectProcessLogs(child: ChildProcessWithoutNullStreams): {
  stdout: string[];
  stderr: string[];
} {
  const stdout: string[] = [];
  const stderr: string[] = [];
  const append = (target: string[], chunk: Buffer): void => {
    const text = chunk.toString("utf8");
    if (!text) return;
    target.push(text);
    // Keep diagnostics bounded.
    if (target.length > 2000) target.splice(0, target.length - 2000);
  };
  child.stdout.on("data", (chunk: Buffer) => append(stdout, chunk));
  child.stderr.on("data", (chunk: Buffer) => append(stderr, chunk));
  return { stdout, stderr };
}

async function killProcess(
  child: ChildProcessWithoutNullStreams,
): Promise<void> {
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

test("packaged DMG app starts and reaches chat/agent-ready state", async () => {
  test.skip(process.platform !== "darwin", "DMG startup test is macOS-only.");

  const dmgPath = await resolveDmgPath();
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "milady-packaged-userdata-"),
  );
  const appInstallDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "milady-packaged-app-"),
  );
  const debugPort = await getFreeTcpPort();

  let api: MockApiServer | null = null;
  let browser: Browser | null = null;
  let appProcess: ChildProcessWithoutNullStreams | null = null;
  let mounted: { mountPoint: string; detachWhenDone: boolean } | null = null;
  let processLogs: { stdout: string[]; stderr: string[] } | null = null;

  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];
  const requestFailures: string[] = [];

  try {
    mounted = await attachOrReuseDmg(dmgPath);
    const sourceBundlePath = path.join(mounted.mountPoint, appBundleName);
    await fs.access(sourceBundlePath);

    // Simulate actual user install from DMG: copy app bundle out of the image.
    const installedBundlePath = path.join(appInstallDir, appBundleName);
    await execFileAsync("cp", ["-R", sourceBundlePath, installedBundlePath]);

    // Harmonize signatures for local test launches outside LaunchServices.
    await execFileAsync("codesign", [
      "--force",
      "--deep",
      "--sign",
      "-",
      installedBundlePath,
    ]);

    const appExecutablePath = path.join(
      installedBundlePath,
      "Contents",
      "MacOS",
      appExecutableName,
    );
    await fs.access(appExecutablePath);

    api = await startMockApiServer({ onboardingComplete: true, port: 0 });

    appProcess = spawn(
      appExecutablePath,
      [`--remote-debugging-port=${debugPort}`],
      {
        env: {
          ...process.env,
          MILADY_ELECTRON_SKIP_EMBEDDED_AGENT: "1",
          MILADY_ELECTRON_TEST_API_BASE: api.baseUrl,
          MILADY_ELECTRON_DISABLE_AUTO_UPDATER: "1",
          MILADY_ELECTRON_DISABLE_DEVTOOLS: "1",
          MILADY_ELECTRON_USER_DATA_DIR: userDataDir,
        },
        stdio: ["ignore", "pipe", "pipe"],
      },
    );
    processLogs = collectProcessLogs(appProcess);

    await waitForCdp(debugPort, 60_000);
    browser = await chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
    const page = await waitForAppPage(browser, 60_000);

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

    await expect(page.getByPlaceholder("Type a message...")).toBeVisible({
      timeout: 120_000,
    });
    await expect(
      page.getByRole("button", { name: "Chat", exact: true }),
    ).toBeVisible();
    await expect(page.getByTestId("status-pill")).toContainText(
      /(running|paused)/i,
    );
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
    if (mounted?.detachWhenDone) {
      await unmountDmg(mounted.mountPoint);
    }
    await fs.rm(appInstallDir, { recursive: true, force: true });
    await fs.rm(userDataDir, { recursive: true, force: true });
  }
});
