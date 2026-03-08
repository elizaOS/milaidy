#!/usr/bin/env node

import fs from "node:fs/promises";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath, pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { spawn } from "node:child_process";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "..");

const MIME_TYPES = {
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

function parseArgs(argv) {
  const args = {
    app: "apps/app",
    artifactDir: "artifacts/app-shell-profile",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--app" && argv[index + 1]) {
      args.app = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg === "--artifact-dir" && argv[index + 1]) {
      args.artifactDir = argv[index + 1];
      index += 1;
    }
  }

  return args;
}

function formatBytes(bytes) {
  return `${(bytes / 1024).toFixed(1)} KiB`;
}

function normalizeAssetPath(reference) {
  return reference.replace(/^\.\//, "").replace(/^\//, "");
}

async function runCommand(command, args, options = {}) {
  await new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repoRoot,
      env: { ...process.env, ...(options.env ?? {}) },
      stdio: options.stdio ?? "inherit",
    });
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(
        new Error(
          `${command} ${args.join(" ")} failed with ${
            signal ? `signal ${signal}` : `exit code ${String(code)}`
          }`,
        ),
      );
    });
    child.on("error", reject);
  });
}

async function collectAssets(distDir) {
  const assetsDir = path.join(distDir, "assets");
  const fileNames = await fs.readdir(assetsDir);
  const assets = [];

  for (const fileName of fileNames) {
    const filePath = path.join(assetsDir, fileName);
    const stats = await fs.stat(filePath);
    if (!stats.isFile()) {
      continue;
    }
    const content = await fs.readFile(filePath);
    assets.push({
      file: path.posix.join("assets", fileName),
      rawBytes: stats.size,
      gzipBytes: gzipSync(content).length,
      type: path.extname(fileName).toLowerCase(),
    });
  }

  assets.sort((left, right) => right.gzipBytes - left.gzipBytes);
  return assets;
}

async function parseEntryAssets(distDir) {
  const indexHtml = await fs.readFile(path.join(distDir, "index.html"), "utf8");
  const matches = Array.from(
    indexHtml.matchAll(/(?:src|href)="([^"]+)"/g),
    (match) => normalizeAssetPath(match[1]),
  );
  return new Set(matches.filter((value) => value.startsWith("assets/")));
}

async function startStaticServer(distDir) {
  const indexPath = path.join(distDir, "index.html");
  const server = http.createServer(async (req, res) => {
    const requestUrl = new URL(req.url ?? "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(requestUrl.pathname);
    const requestedPath =
      pathname === "/"
        ? indexPath
        : path.join(distDir, pathname.replace(/^\/+/, ""));
    const normalizedPath = path.normalize(requestedPath);
    const safePath = normalizedPath.startsWith(distDir) ? normalizedPath : indexPath;

    let filePath = safePath;
    try {
      const stats = await fs.stat(filePath);
      if (stats.isDirectory()) {
        filePath = indexPath;
      }
    } catch {
      filePath = indexPath;
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

  await new Promise((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Static server failed to bind to a TCP port");
  }

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: async () => {
      await new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

async function startMockApi(appDir) {
  const mockApiModule = path.join(appDir, "test", "electron-ui", "mock-api.ts");
  const mockApiUrl = pathToFileURL(mockApiModule).href;
  const bootstrap = [
    `import { startMockApiServer } from ${JSON.stringify(mockApiUrl)};`,
    "const server = await startMockApiServer({ onboardingComplete: true, port: 0 });",
    'console.log(JSON.stringify({ type: "ready", baseUrl: server.baseUrl }));',
    "const shutdown = async () => { await server.close(); process.exit(0); };",
    'process.on("SIGINT", shutdown);',
    'process.on("SIGTERM", shutdown);',
    "setInterval(() => {}, 1000);",
  ].join("\n");

  const child = spawn(
    process.execPath,
    ["--import", "tsx", "--eval", bootstrap],
    {
      cwd: repoRoot,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString("utf8");
  });

  const baseUrl = await new Promise((resolve, reject) => {
    const output = readline.createInterface({ input: child.stdout });
    const timeout = setTimeout(() => {
      output.close();
      reject(
        new Error(
          `Timed out waiting for mock API server.\n${stderr.trim()}`,
        ),
      );
    }, 30_000);

    output.on("line", (line) => {
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === "ready" && typeof parsed.baseUrl === "string") {
          clearTimeout(timeout);
          output.close();
          resolve(parsed.baseUrl);
        }
      } catch {
        // Ignore non-JSON bootstrap output.
      }
    });

    child.once("exit", (code) => {
      clearTimeout(timeout);
      reject(
        new Error(
          `Mock API server exited before readiness (code ${String(code)}).\n${stderr.trim()}`,
        ),
      );
    });
    child.once("error", reject);
  });

  return {
    baseUrl,
    close: async () => {
      if (child.killed) {
        return;
      }
      child.kill("SIGTERM");
      await new Promise((resolve) => {
        child.once("exit", () => resolve());
      });
    },
  };
}

async function importPlaywright() {
  const requireFromRepo = createRequire(path.join(repoRoot, "package.json"));
  const playwrightEntry = requireFromRepo.resolve("playwright");
  const playwrightModule = await import(pathToFileURL(playwrightEntry).href);
  return playwrightModule.default ?? playwrightModule;
}

async function launchChromium(playwright, appDir) {
  try {
    return await playwright.chromium.launch({ headless: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!/Executable doesn't exist|browserType\.launch/.test(message)) {
      throw error;
    }
    console.warn("[profile-app-shell] Chromium not installed. Installing Playwright browser...");
    await runCommand("bunx", ["playwright", "install", "chromium"], {
      cwd: appDir,
      stdio: "inherit",
    });
    return playwright.chromium.launch({ headless: true });
  }
}

async function measureShell({ appBaseUrl, apiBaseUrl, artifactDir, playwright }) {
  const browser = await launchChromium(playwright, path.join(repoRoot, "apps/app"));
  const page = await browser.newPage({
    viewport: { width: 1440, height: 960 },
  });
  const consoleErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });

  await page.addInitScript((baseUrl) => {
    const metricsWindow = /** @type {Window & { __MILADY_API_BASE__?: string; __MILADY_LCP__?: number }} */ (
      window
    );
    metricsWindow.__MILADY_API_BASE__ = baseUrl;
    metricsWindow.__MILADY_LCP__ = 0;
    window.localStorage.setItem("milady:ui-shell-mode", "native");

    try {
      const observer = new PerformanceObserver((entries) => {
        for (const entry of entries.getEntries()) {
          metricsWindow.__MILADY_LCP__ = entry.startTime;
        }
      });
      observer.observe({ type: "largest-contentful-paint", buffered: true });
      document.addEventListener(
        "visibilitychange",
        () => {
          observer.disconnect();
        },
        { once: true },
      );
    } catch {
      // PerformanceObserver can be unavailable in some runtimes.
    }
  }, apiBaseUrl);

  await page.goto(appBaseUrl, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => {
    const header = document.querySelector("[data-testid='shell-header']");
    const nav = document.querySelector("[data-testid='nav-root']");
    const composer = document.querySelector("[data-testid='chat-composer-input']");
    if (!(header instanceof HTMLElement)) return false;
    if (!(nav instanceof HTMLElement)) return false;
    if (!(composer instanceof HTMLTextAreaElement)) return false;
    if (composer.disabled) return false;
    return header.offsetParent !== null && nav.offsetParent !== null;
  });

  const ttiMs = await page.evaluate(() => Math.round(performance.now()));
  await page.waitForTimeout(1000);
  const lcpMs = await page.evaluate(() => {
    const metricsWindow = /** @type {Window & { __MILADY_LCP__?: number }} */ (
      window
    );
    return Math.round(metricsWindow.__MILADY_LCP__ ?? 0);
  });

  const screenshotPath = path.join(artifactDir, "shell.png");
  await page.screenshot({ path: screenshotPath, fullPage: true });
  await browser.close();

  return {
    consoleErrors,
    lcpMs,
    screenshotPath,
    ttiMs,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const appDir = path.resolve(repoRoot, args.app);
  const artifactDir = path.resolve(repoRoot, args.artifactDir);
  const distDir = path.join(appDir, "dist");
  const budgetPath = path.join(appDir, "profile-budget.json");

  await fs.mkdir(artifactDir, { recursive: true });

  console.log(`[profile-app-shell] Building ${path.relative(repoRoot, appDir)}...`);
  await runCommand("bun", ["run", "build"], { cwd: appDir, stdio: "inherit" });

  const budgets = JSON.parse(await fs.readFile(budgetPath, "utf8"));
  const assets = await collectAssets(distDir);
  const entryAssets = await parseEntryAssets(distDir);
  const entryJsAssets = assets.filter(
    (asset) => asset.type === ".js" && entryAssets.has(asset.file),
  );
  const entryCssAssets = assets.filter(
    (asset) => asset.type === ".css" && entryAssets.has(asset.file),
  );
  const allJsAssets = assets.filter((asset) => asset.type === ".js");

  const mockApi = await startMockApi(appDir);
  const staticServer = await startStaticServer(distDir);

  let metrics;
  try {
    const playwright = await importPlaywright();
    metrics = await measureShell({
      appBaseUrl: staticServer.baseUrl,
      apiBaseUrl: mockApi.baseUrl,
      artifactDir,
      playwright,
    });
  } finally {
    await staticServer.close();
    await mockApi.close();
  }

  const summary = {
    app: path.relative(repoRoot, appDir),
    budgets,
    metrics: {
      entryCssGzipBytes: entryCssAssets.reduce(
        (sum, asset) => sum + asset.gzipBytes,
        0,
      ),
      entryJsGzipBytes: entryJsAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0),
      lcpMs: metrics.lcpMs,
      totalJsGzipBytes: allJsAssets.reduce((sum, asset) => sum + asset.gzipBytes, 0),
      ttiMs: metrics.ttiMs,
    },
    topAssets: assets.slice(0, 12),
    consoleErrors: metrics.consoleErrors,
  };

  const failures = [];
  if (summary.metrics.entryCssGzipBytes > budgets.gzipBytes.entryCssMax) {
    failures.push(
      `entry CSS gzip ${formatBytes(summary.metrics.entryCssGzipBytes)} exceeded ${formatBytes(budgets.gzipBytes.entryCssMax)}`,
    );
  }
  if (summary.metrics.entryJsGzipBytes > budgets.gzipBytes.entryJsMax) {
    failures.push(
      `entry JS gzip ${formatBytes(summary.metrics.entryJsGzipBytes)} exceeded ${formatBytes(budgets.gzipBytes.entryJsMax)}`,
    );
  }
  if (summary.metrics.totalJsGzipBytes > budgets.gzipBytes.totalJsMax) {
    failures.push(
      `total JS gzip ${formatBytes(summary.metrics.totalJsGzipBytes)} exceeded ${formatBytes(budgets.gzipBytes.totalJsMax)}`,
    );
  }
  if (summary.metrics.ttiMs > budgets.webVitalsMs.ttiMax) {
    failures.push(`TTI ${summary.metrics.ttiMs}ms exceeded ${budgets.webVitalsMs.ttiMax}ms`);
  }
  if (summary.metrics.lcpMs > budgets.webVitalsMs.lcpMax) {
    failures.push(`LCP ${summary.metrics.lcpMs}ms exceeded ${budgets.webVitalsMs.lcpMax}ms`);
  }

  await fs.writeFile(
    path.join(artifactDir, "summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(artifactDir, "assets.json"),
    `${JSON.stringify(assets, null, 2)}\n`,
  );
  await fs.writeFile(
    path.join(artifactDir, "report.md"),
    [
      "# App Shell Profile",
      "",
      `- App: \`${summary.app}\``,
      `- Entry JS gzip: ${formatBytes(summary.metrics.entryJsGzipBytes)}`,
      `- Total JS gzip: ${formatBytes(summary.metrics.totalJsGzipBytes)}`,
      `- Entry CSS gzip: ${formatBytes(summary.metrics.entryCssGzipBytes)}`,
      `- TTI: ${summary.metrics.ttiMs}ms`,
      `- LCP: ${summary.metrics.lcpMs}ms`,
      `- Console errors: ${summary.consoleErrors.length}`,
      "",
      failures.length > 0 ? "## Budget failures" : "## Budget status",
      "",
      ...(failures.length > 0 ? failures.map((failure) => `- ${failure}`) : ["- All budgets passed"]),
    ].join("\n"),
  );

  console.log("[profile-app-shell] Entry JS gzip:", formatBytes(summary.metrics.entryJsGzipBytes));
  console.log("[profile-app-shell] Total JS gzip:", formatBytes(summary.metrics.totalJsGzipBytes));
  console.log("[profile-app-shell] Entry CSS gzip:", formatBytes(summary.metrics.entryCssGzipBytes));
  console.log("[profile-app-shell] TTI:", `${summary.metrics.ttiMs}ms`);
  console.log("[profile-app-shell] LCP:", `${summary.metrics.lcpMs}ms`);
  console.log(`[profile-app-shell] Artifacts: ${artifactDir}`);

  if (failures.length > 0) {
    console.error("[profile-app-shell] Budget failures:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  }
}

await main();
