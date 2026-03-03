#!/usr/bin/env node
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const BASE_URL = process.env.MILADY_BENCH_URL ?? "http://127.0.0.1:3939";
const SHOULD_SPAWN_SERVER =
  process.argv.includes("--spawn-server") ||
  process.env.MILADY_BENCH_SPAWN === "1";
const SAVE_SCREENSHOTS =
  process.argv.includes("--save-screenshots") ||
  process.env.MILADY_BENCH_SAVE_SHOTS === "1";
const OUTPUT_DIR =
  process.env.MILADY_BENCH_SCREENSHOT_DIR ??
  path.join(process.cwd(), ".local", "benchmark-cua-shots");

const hasCuaConfig = Boolean(
  process.env.CUA_HOST?.trim() ||
    (process.env.CUA_API_KEY?.trim() &&
      (process.env.CUA_SANDBOX_NAME?.trim() ||
        process.env.CUA_CONTAINER_NAME?.trim())),
);

const roomId = `cua-watch-${Date.now()}`;

const goals = [
  "Open the ChatGPT app. If the app is not installed, open a browser and go to https://chatgpt.com.",
  "Close any extra browser tabs and leave only the ChatGPT tab open.",
  "Demonstrate browser control by opening a new tab to https://example.com, then return to the ChatGPT tab.",
];

let serverProcess = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function shorten(text, max = 220) {
  if (typeof text !== "string") return String(text);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function safeJson(value) {
  return JSON.stringify(value, null, 2);
}

async function requestJson(pathname, options = {}) {
  const response = await fetch(`${BASE_URL}${pathname}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers ?? {}),
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `${options.method ?? "GET"} ${pathname} failed (${response.status}): ${body}`,
    );
  }

  return response.json();
}

async function waitForHealth(timeoutMs = 120_000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const health = await requestJson("/api/benchmark/health");
      return health;
    } catch {
      await sleep(1_000);
    }
  }

  throw new Error(
    `Benchmark server at ${BASE_URL} did not become healthy within ${timeoutMs}ms`,
  );
}

async function waitForCuaService(timeoutMs = 120_000) {
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const status = await requestJson("/api/benchmark/cua/status");
      if (status.ok) {
        return status;
      }
    } catch {
      await sleep(1_000);
    }
  }

  throw new Error(
    `CUA service did not become available within ${timeoutMs}ms. Ensure MILADY_ENABLE_CUA=1 and CUA_HOST/keys are configured.`,
  );
}

function ensureConfig() {
  if (!hasCuaConfig) {
    throw new Error(
      [
        "Missing CUA configuration.",
        "Set CUA_HOST for local LUME VM (example: CUA_HOST=localhost:8000)",
        "or set CUA_API_KEY + CUA_SANDBOX_NAME for cloud mode.",
      ].join(" "),
    );
  }
}

function cleanup() {
  if (serverProcess) {
    serverProcess.kill("SIGTERM");
    serverProcess = null;
  }
}

process.on("SIGINT", () => {
  cleanup();
  process.exit(130);
});
process.on("SIGTERM", () => {
  cleanup();
  process.exit(143);
});

async function maybeStartServer() {
  if (!SHOULD_SPAWN_SERVER) {
    return;
  }

  const childEnv = {
    ...process.env,
    MILADY_ENABLE_CUA: process.env.MILADY_ENABLE_CUA ?? "1",
    MILADY_BENCH_MOCK: process.env.MILADY_BENCH_MOCK ?? "false",
    CUA_OS_TYPE: process.env.CUA_OS_TYPE ?? "linux",
    CUA_COMPUTER_USE_MODEL:
      process.env.CUA_COMPUTER_USE_MODEL ??
      (process.env.OPENAI_API_KEY ? "computer-use-preview" : "auto"),
  };

  printSection("Starting benchmark server");
  serverProcess = spawn(
    "node",
    ["--import", "tsx", "src/benchmark/server.ts"],
    {
      cwd: process.cwd(),
      env: childEnv,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  serverProcess.stdout.on("data", (chunk) => {
    process.stdout.write(`[server] ${chunk.toString()}`);
  });

  serverProcess.stderr.on("data", (chunk) => {
    process.stderr.write(`[server] ${chunk.toString()}`);
  });
}

async function maybeSaveStepScreenshots(taskIndex, steps) {
  if (!SAVE_SCREENSHOTS || !Array.isArray(steps)) {
    return;
  }

  await fs.mkdir(OUTPUT_DIR, { recursive: true });

  for (const [index, step] of steps.entries()) {
    const encoded = step?.screenshotAfterBase64;
    if (typeof encoded !== "string" || encoded.length === 0) {
      continue;
    }

    const filename = `task-${taskIndex + 1}-step-${index + 1}.png`;
    const filepath = path.join(OUTPUT_DIR, filename);
    await fs.writeFile(filepath, Buffer.from(encoded, "base64"));
    console.log(`Saved screenshot: ${filepath}`);
  }
}

async function runScenario() {
  for (const [taskIndex, goal] of goals.entries()) {
    printSection(`Task ${taskIndex + 1}`);
    console.log(`Goal: ${goal}`);

    const payload = await requestJson("/api/benchmark/cua/run", {
      method: "POST",
      body: JSON.stringify({
        room_id: roomId,
        goal,
        auto_approve: true,
        include_screenshots: SAVE_SCREENSHOTS,
        max_approvals: 8,
      }),
    });

    const result = payload?.result ?? {};
    const status = result?.status ?? "unknown";
    console.log(`Status: ${status}`);
    if (payload?.approvals) {
      console.log(`Safety approvals auto-accepted: ${payload.approvals}`);
    }

    const steps = Array.isArray(result?.steps)
      ? result.steps
      : Array.isArray(result?.pending?.stepsSoFar)
        ? result.pending.stepsSoFar
        : [];

    console.log(`Steps observed: ${steps.length}`);
    for (const [index, step] of steps.entries()) {
      const actionText = shorten(safeJson(step?.action ?? {}), 180);
      console.log(`  step ${index + 1}: action=${actionText}`);
      if (typeof step?.error === "string" && step.error.trim()) {
        console.log(`    step_error=${shorten(step.error, 180)}`);
      }
    }

    if (typeof result?.error === "string" && result.error.trim()) {
      console.log(`Task error: ${result.error}`);
    }

    await maybeSaveStepScreenshots(taskIndex, steps);

    if (status === "failed") {
      throw new Error(
        `Task ${taskIndex + 1} failed: ${result?.error ?? "unknown"}`,
      );
    }

    if (status === "paused_for_approval") {
      throw new Error(
        `Task ${taskIndex + 1} is still paused_for_approval after auto-approve attempts`,
      );
    }
  }
}

async function run() {
  ensureConfig();
  await maybeStartServer();

  printSection("Waiting for benchmark server");
  const health = await waitForHealth();
  console.log(safeJson(health));

  printSection("Waiting for CUA service");
  const cuaStatus = await waitForCuaService();
  console.log(safeJson(cuaStatus));

  printSection("Running CUA LUME watch scenario");
  console.log(`Room: ${roomId}`);

  await runScenario();

  printSection("Done");
  console.log(
    "All tasks completed. If the LUME VM is visible, you should have seen the desktop actions live.",
  );
}

run()
  .catch((error) => {
    console.error(
      `benchmark-cua-watch failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(() => {
    cleanup();
  });
