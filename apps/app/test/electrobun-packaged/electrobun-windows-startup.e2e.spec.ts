import { type ChildProcess, execFile, spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { expect, test } from "@playwright/test";

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

async function waitForRendererBootstrap(
  api: MockApiServer,
  child: ChildProcess,
  timeoutMs: number,
  processLogs: { stdout: string[]; stderr: string[] } | null,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null) {
      const stdoutText = processLogs?.stdout.join("") ?? "";
      const stderrText = processLogs?.stderr.join("") ?? "";
      throw new Error(
        `Packaged Windows app exited before renderer bootstrap.\n` +
          `Exit code: ${child.exitCode}\n` +
          `Mock requests:\n${api.requests.join("\n")}\n\n` +
          `App stdout:\n${stdoutText}\n\nApp stderr:\n${stderrText}`,
      );
    }

    if (api.requests.some((request) => request.includes("/api/status"))) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  const stdoutText = processLogs?.stdout.join("") ?? "";
  const stderrText = processLogs?.stderr.join("") ?? "";
  throw new Error(
    `Timed out waiting for packaged Windows renderer to reach the external API.\n` +
      `Mock requests:\n${api.requests.join("\n")}\n\n` +
      `App stdout:\n${stdoutText}\n\nApp stderr:\n${stderrText}`,
  );
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

test("packaged Windows app bootstraps the renderer against the external API override", async () => {
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

  let api: MockApiServer | null = null;
  let appProcess: ChildProcess | null = null;
  let processLogs: { stdout: string[]; stderr: string[] } | null = null;

  try {
    api = await startMockApiServer({ onboardingComplete: true, port: 0 });

    appProcess = spawn(executablePath, [], {
      cwd: path.dirname(executablePath),
      env: {
        ...process.env,
        MILADY_DESKTOP_TEST_API_BASE: api.baseUrl,
        // Redirect the Roaming AppData so it doesn't pollute the dev machine's real AppData
        APPDATA: userDataDir,
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    processLogs = collectProcessLogs(appProcess);

    await waitForRendererBootstrap(
      api,
      appProcess,
      process.env.CI ? 180_000 : 90_000,
      processLogs,
    );

    await expect
      .poll(
        () =>
          api?.requests.filter((request) => request.includes("/api/status"))
            .length ?? 0,
        {
          timeout: 30_000,
          message: "Expected the packaged renderer to poll /api/status",
        },
      )
      .toBeGreaterThan(0);

    await expect
      .poll(
        () =>
          appProcess && appProcess.exitCode === null ? "running" : "exited",
        {
          timeout: 5_000,
          message:
            "Expected the packaged Windows app to stay alive after bootstrap",
        },
      )
      .toBe("running");

    expect(
      api.requests.some((request) => request.includes("/api/status")),
    ).toBe(true);
    expect(api.requests.length).toBeGreaterThan(0);

    const stdoutText = processLogs?.stdout.join("") ?? "";
    const stderrText = processLogs?.stderr.join("") ?? "";
    expect(
      `${stdoutText}\n${stderrText}`,
      `Packaged Windows app logs should not contain fatal startup errors.\n` +
        `Mock requests:\n${api.requests.join("\n")}\n\n` +
        `App stdout:\n${stdoutText}\n\nApp stderr:\n${stderrText}`,
    ).not.toMatch(
      /Fatal error during startup|startup failure|Cannot find module/i,
    );
  } finally {
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
