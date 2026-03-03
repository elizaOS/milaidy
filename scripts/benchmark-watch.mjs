#!/usr/bin/env node
import { spawn } from "node:child_process";
import process from "node:process";

const BASE_URL = process.env.MILADY_BENCH_URL ?? "http://127.0.0.1:3939";
const BENCHMARK = process.env.MILADY_BENCH_NAME ?? "agentbench";
const SHOULD_SPAWN_SERVER =
  process.argv.includes("--spawn-server") ||
  process.env.MILADY_BENCH_SPAWN === "1";
const USE_MOCK = process.env.MILADY_BENCH_MOCK ?? "true";

const taskId = `watch-${Date.now()}`;

const scenario = [
  {
    text: "Find a laptop under $500",
    context: {
      goal: "Find a laptop under $500",
      observation: { page: "search results" },
      action_space: ["search[query]", "click[id]", "buy[id]"],
    },
  },
  {
    text: "Now compare top options and choose the strongest value",
    context: {
      goal: "Compare options under budget and pick best value",
      observation: { page: "product list" },
      action_space: ["click[id]", "compare[id_a,id_b]", "back"],
    },
  },
  {
    text: "Proceed with the selected option",
    context: {
      goal: "Proceed to checkout with selected item",
      observation: { page: "product detail" },
      action_space: ["add_to_cart[id]", "checkout", "back"],
    },
  },
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function waitForServerReady(timeoutMs = 90_000) {
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    try {
      return await requestJson("/api/benchmark/health");
    } catch {
      await sleep(1_000);
    }
  }

  throw new Error(
    `Benchmark server at ${BASE_URL} did not become ready within ${timeoutMs}ms`,
  );
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

let serverProcess = null;

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

async function run() {
  if (SHOULD_SPAWN_SERVER) {
    printSection("Starting benchmark server");
    serverProcess = spawn(
      "node",
      ["--import", "tsx", "src/benchmark/server.ts"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          MILADY_BENCH_MOCK: USE_MOCK,
        },
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

  printSection("Waiting for server health");
  const health = await waitForServerReady();
  console.log(pretty(health));

  printSection("Reset benchmark session");
  const reset = await requestJson("/api/benchmark/reset", {
    method: "POST",
    body: JSON.stringify({
      task_id: taskId,
      benchmark: BENCHMARK,
    }),
  });
  console.log(pretty(reset));

  for (const [index, step] of scenario.entries()) {
    printSection(`Step ${index + 1}`);
    console.log(`Prompt: ${step.text}`);

    const messageResponse = await requestJson("/api/benchmark/message", {
      method: "POST",
      body: JSON.stringify({
        text: step.text,
        context: {
          benchmark: BENCHMARK,
          task_id: taskId,
          ...step.context,
        },
      }),
    });

    console.log(`Thought: ${messageResponse.thought ?? "(none)"}`);
    console.log(`Actions: ${pretty(messageResponse.actions ?? [])}`);
    console.log(`Params: ${pretty(messageResponse.params ?? {})}`);

    const trajectory = await requestJson(
      `/api/benchmark/trajectory?benchmark=${encodeURIComponent(BENCHMARK)}&task_id=${encodeURIComponent(taskId)}`,
    );
    const latestStep = trajectory.steps?.[trajectory.steps.length - 1] ?? null;

    console.log(
      `Trajectory length: ${trajectory.steps?.length ?? 0} | Latest step: ${latestStep?.step ?? "n/a"}`,
    );

    if (latestStep) {
      console.log(`Latest response text: ${latestStep.responseText ?? ""}`);
    }

    await sleep(500);
  }

  printSection("Final trajectory");
  const finalTrajectory = await requestJson(
    `/api/benchmark/trajectory?benchmark=${encodeURIComponent(BENCHMARK)}&task_id=${encodeURIComponent(taskId)}`,
  );
  console.log(
    pretty({
      benchmark: finalTrajectory.benchmark,
      task_id: finalTrajectory.task_id,
      room_id: finalTrajectory.room_id,
      steps: finalTrajectory.steps?.length ?? 0,
      outbox_entries: finalTrajectory.outbox?.length ?? 0,
    }),
  );
}

run()
  .catch((error) => {
    console.error(
      `benchmark-watch failed: ${error instanceof Error ? error.message : String(error)}`,
    );
    process.exitCode = 1;
  })
  .finally(() => {
    cleanup();
  });
