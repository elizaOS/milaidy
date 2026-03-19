#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    apiBaseUrl: "http://127.0.0.1:31337",
    promptsPath: "docs/guides/chat-prompts-v1.md",
    promptIds: [],
    runsPerPrompt: 5,
    warmupRuns: 1,
    channelType: "DM",
    outputDir: "",
    timeoutMs: 180_000,
    chatOnly: true,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--api-base-url")
      args.apiBaseUrl = argv[++i] ?? args.apiBaseUrl;
    else if (token === "--prompts")
      args.promptsPath = argv[++i] ?? args.promptsPath;
    else if (token === "--prompt-ids") {
      const raw = argv[++i] ?? "";
      args.promptIds = raw
        .split(",")
        .map((item) => item.trim().toUpperCase())
        .filter(Boolean);
    } else if (token === "--runs")
      args.runsPerPrompt = Number(argv[++i] ?? args.runsPerPrompt);
    else if (token === "--warmup")
      args.warmupRuns = Number(argv[++i] ?? args.warmupRuns);
    else if (token === "--channel-type")
      args.channelType = argv[++i] ?? args.channelType;
    else if (token === "--output-dir") args.outputDir = argv[++i] ?? "";
    else if (token === "--timeout-ms")
      args.timeoutMs = Number(argv[++i] ?? args.timeoutMs);
    else if (token === "--chat-only")
      args.chatOnly = String(argv[++i] ?? "true").toLowerCase() !== "false";
  }

  if (!Number.isFinite(args.runsPerPrompt) || args.runsPerPrompt < 1) {
    throw new Error("--runs must be a positive integer");
  }
  if (!Number.isFinite(args.warmupRuns) || args.warmupRuns < 0) {
    throw new Error("--warmup must be >= 0");
  }
  if (args.warmupRuns >= args.runsPerPrompt) {
    throw new Error("--warmup must be less than --runs");
  }

  return args;
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

function parsePrompts(markdown) {
  const lines = markdown.split(/\r?\n/);
  const prompts = [];
  let currentId = "";
  let currentLines = [];

  const flush = () => {
    if (!currentId) return;
    const text = currentLines.join("\n").trim();
    if (text) prompts.push({ id: currentId, prompt: text });
    currentId = "";
    currentLines = [];
  };

  for (const line of lines) {
    const marker = line.match(/^`(P\d{2})`\s*$/);
    if (marker) {
      flush();
      currentId = marker[1];
      continue;
    }
    if (!currentId) continue;
    currentLines.push(line);
  }
  flush();

  return prompts;
}

async function requestJson(url, init, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...init, signal: controller.signal });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    return { response, json, text };
  } finally {
    clearTimeout(timer);
  }
}

async function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function createConversation(apiBaseUrl, title, timeoutMs) {
  const { response, json, text } = await requestJson(
    `${apiBaseUrl}/api/conversations`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title }),
    },
    timeoutMs,
  );
  if (!response.ok || !json?.conversation?.id) {
    throw new Error(
      `Failed to create conversation (${response.status}): ${text.slice(0, 500)}`,
    );
  }
  return json.conversation.id;
}

async function sendMessage(
  apiBaseUrl,
  conversationId,
  prompt,
  channelType,
  timeoutMs,
) {
  return requestJson(
    `${apiBaseUrl}/api/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: prompt, prompt, channelType }),
    },
    timeoutMs,
  );
}

function buildBenchmarkPrompt(prompt, chatOnly) {
  if (!chatOnly) return prompt;
  const guard = [
    "",
    "[Benchmark mode instruction]",
    "Respond directly in chat.",
    "Do NOT start or delegate coding tasks.",
    "Do NOT select START_CODING_TASK, SPAWN_CODING_AGENT, SEND_TO_CODING_AGENT, PROVISION_WORKSPACE, or FINALIZE_WORKSPACE.",
    "Do NOT launch any swarm or coding agent session.",
  ].join("\n");
  return `${prompt}${guard}`;
}

async function getLatestTrajectoryId(apiBaseUrl, timeoutMs) {
  const { response, json } = await requestJson(
    `${apiBaseUrl}/api/trajectories?limit=1`,
    { method: "GET" },
    timeoutMs,
  );
  if (!response.ok) return "";
  const first = Array.isArray(json?.trajectories) ? json.trajectories[0] : null;
  return typeof first?.id === "string" ? first.id : "";
}

function extractTrajectoryDiagnostics(detailJson) {
  const llmCalls = Array.isArray(detailJson?.llmCalls)
    ? detailJson.llmCalls
    : [];
  if (llmCalls.length === 0) {
    return {
      llmCallCount: 0,
      llmLatencyTotalMs: 0,
      maxCallLatencyMs: 0,
      mainPromptChars: 0,
      mainResponseChars: 0,
      securityCallCount: 0,
      objectSmallCallCount: 0,
    };
  }

  const mainCall = [...llmCalls].sort(
    (a, b) =>
      String(b?.userPrompt ?? b?.input ?? "").length -
      String(a?.userPrompt ?? a?.input ?? "").length,
  )[0];

  const llmLatencyTotalMs = llmCalls.reduce(
    (sum, call) => sum + Number(call?.latencyMs ?? 0),
    0,
  );
  const maxCallLatencyMs = llmCalls.reduce(
    (max, call) => Math.max(max, Number(call?.latencyMs ?? 0)),
    0,
  );

  const securityCallCount = llmCalls.filter((call) =>
    String(call?.userPrompt ?? "").startsWith(
      "You are a security evaluation system.",
    ),
  ).length;

  const objectSmallCallCount = llmCalls.filter(
    (call) => String(call?.model ?? "").toUpperCase() === "OBJECT_SMALL",
  ).length;

  return {
    llmCallCount: llmCalls.length,
    llmLatencyTotalMs,
    maxCallLatencyMs,
    mainPromptChars: String(mainCall?.userPrompt ?? mainCall?.input ?? "")
      .length,
    mainResponseChars: String(mainCall?.response ?? "").length,
    securityCallCount,
    objectSmallCallCount,
  };
}

async function getTrajectoryDiagnostics(
  apiBaseUrl,
  timeoutMs,
  previousLatestId,
) {
  const afterLatestId = await getLatestTrajectoryId(apiBaseUrl, timeoutMs);
  if (!afterLatestId || afterLatestId === previousLatestId) {
    return { trajectoryId: "", diagnostics: null };
  }
  const { response, json } = await requestJson(
    `${apiBaseUrl}/api/trajectories/${encodeURIComponent(afterLatestId)}`,
    { method: "GET" },
    timeoutMs,
  );
  if (!response.ok) {
    return { trajectoryId: afterLatestId, diagnostics: null };
  }
  return {
    trajectoryId: afterLatestId,
    diagnostics: extractTrajectoryDiagnostics(json),
  };
}

function toCsv(rows) {
  const header = [
    "prompt_id",
    "run_index",
    "is_warmup",
    "status",
    "http_status",
    "duration_ms",
    "response_chars",
    "conversation_id",
    "trajectory_id",
    "main_prompt_chars",
    "main_response_chars",
    "llm_call_count",
    "llm_latency_total_ms",
    "llm_max_call_latency_ms",
    "security_call_count",
    "object_small_call_count",
    "error",
  ];
  const lines = [header.join(",")];
  for (const row of rows) {
    const cells = [
      row.promptId,
      String(row.runIndex),
      row.isWarmup ? "1" : "0",
      row.status,
      String(row.httpStatus ?? ""),
      String(row.durationMs ?? ""),
      String(row.responseChars ?? ""),
      row.conversationId ?? "",
      row.trajectoryId ?? "",
      String(row.mainPromptChars ?? ""),
      String(row.mainResponseChars ?? ""),
      String(row.llmCallCount ?? ""),
      String(row.llmLatencyTotalMs ?? ""),
      String(row.llmMaxCallLatencyMs ?? ""),
      String(row.securityCallCount ?? ""),
      String(row.objectSmallCallCount ?? ""),
      row.error ?? "",
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`);
    lines.push(cells.join(","));
  }
  return `${lines.join("\n")}\n`;
}

function summarize(rows) {
  const measured = rows.filter((row) => !row.isWarmup);
  const ok = measured.filter((row) => row.status === "ok");
  const durations = ok
    .map((row) => row.durationMs)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const avg =
    durations.length > 0
      ? durations.reduce((sum, value) => sum + value, 0) / durations.length
      : null;

  const quantile = (q) => {
    if (durations.length === 0) return null;
    if (durations.length === 1) return durations[0];
    const pos = (durations.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    const next = durations[base + 1] ?? durations[base];
    return durations[base] + rest * (next - durations[base]);
  };

  const quantileFor = (values, q) => {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    if (sorted.length === 1) return sorted[0];
    const pos = (sorted.length - 1) * q;
    const base = Math.floor(pos);
    const rest = pos - base;
    const next = sorted[base + 1] ?? sorted[base];
    return sorted[base] + rest * (next - sorted[base]);
  };

  const byPrompt = {};
  for (const row of measured) {
    if (!byPrompt[row.promptId]) {
      byPrompt[row.promptId] = { total: 0, ok: 0, error: 0 };
    }
    byPrompt[row.promptId].total += 1;
    if (row.status === "ok") byPrompt[row.promptId].ok += 1;
    else byPrompt[row.promptId].error += 1;
  }

  const avgNumber = (values) => {
    const finite = values.filter((value) => Number.isFinite(value));
    if (finite.length === 0) return null;
    return finite.reduce((sum, value) => sum + value, 0) / finite.length;
  };

  return {
    measuredCount: measured.length,
    okCount: ok.length,
    errorCount: measured.length - ok.length,
    errorRate:
      measured.length === 0
        ? 0
        : (measured.length - ok.length) / measured.length,
    durationMs: {
      avg,
      p50: quantile(0.5),
      p95: quantile(0.95),
    },
    diagnostics: {
      mainPromptCharsAvg: avgNumber(ok.map((row) => row.mainPromptChars)),
      llmCallCountAvg: avgNumber(ok.map((row) => row.llmCallCount)),
      llmLatencyTotalMsAvg: avgNumber(ok.map((row) => row.llmLatencyTotalMs)),
      llmMaxCallLatencyMsP95: quantileFor(
        ok
          .map((row) => row.llmMaxCallLatencyMs)
          .filter((value) => Number.isFinite(value)),
        0.95,
      ),
      securityCallCountAvg: avgNumber(ok.map((row) => row.securityCallCount)),
      objectSmallCallCountAvg: avgNumber(
        ok.map((row) => row.objectSmallCallCount),
      ),
    },
    byPrompt,
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const promptsRaw = await readFile(path.resolve(args.promptsPath), "utf8");
  const parsedPrompts = parsePrompts(promptsRaw);
  const prompts =
    args.promptIds.length === 0
      ? parsedPrompts
      : parsedPrompts.filter((entry) => args.promptIds.includes(entry.id));

  if (args.promptIds.length > 0) {
    const missingPromptIds = args.promptIds.filter(
      (promptId) => !parsedPrompts.some((entry) => entry.id === promptId),
    );
    if (missingPromptIds.length > 0) {
      throw new Error(
        `Unknown prompt IDs: ${missingPromptIds.join(", ")} (available from ${args.promptsPath})`,
      );
    }
  }

  if (prompts.length === 0) {
    throw new Error(`No prompts found in ${args.promptsPath}`);
  }

  const outputDir =
    args.outputDir.trim().length > 0
      ? path.resolve(args.outputDir)
      : path.resolve(".tmp", `chat-benchmark-${nowStamp()}`);
  await mkdir(outputDir, { recursive: true });

  const runRows = [];

  for (const promptDef of prompts) {
    for (let runIndex = 1; runIndex <= args.runsPerPrompt; runIndex += 1) {
      const isWarmup = runIndex <= args.warmupRuns;
      const title = `benchmark ${promptDef.id} run ${runIndex}`;
      const startedAt = Date.now();
      let conversationId = "";
      let status = "ok";
      let httpStatus = 0;
      let responseChars = 0;
      let trajectoryId = "";
      let mainPromptChars = 0;
      let mainResponseChars = 0;
      let llmCallCount = 0;
      let llmLatencyTotalMs = 0;
      let llmMaxCallLatencyMs = 0;
      let securityCallCount = 0;
      let objectSmallCallCount = 0;
      let error = "";

      const perRunTimeoutMs = Math.max(args.timeoutMs + 30_000, 60_000);
      try {
        await withTimeout(
          (async () => {
            const latestBeforeId = await getLatestTrajectoryId(
              args.apiBaseUrl,
              args.timeoutMs,
            );
            conversationId = await createConversation(
              args.apiBaseUrl,
              title,
              args.timeoutMs,
            );
            const { response, json, text } = await sendMessage(
              args.apiBaseUrl,
              conversationId,
              buildBenchmarkPrompt(promptDef.prompt, args.chatOnly),
              args.channelType,
              args.timeoutMs,
            );
            httpStatus = response.status;
            if (!response.ok) {
              status = "error";
              error = `HTTP ${response.status}: ${text.slice(0, 400)}`;
            } else {
              const responseText =
                typeof json?.text === "string"
                  ? json.text
                  : typeof text === "string"
                    ? text
                    : "";
              responseChars = responseText.length;
            }

            const trajectory = await getTrajectoryDiagnostics(
              args.apiBaseUrl,
              args.timeoutMs,
              latestBeforeId,
            );
            trajectoryId = trajectory.trajectoryId;
            if (trajectory.diagnostics) {
              mainPromptChars = trajectory.diagnostics.mainPromptChars;
              mainResponseChars = trajectory.diagnostics.mainResponseChars;
              llmCallCount = trajectory.diagnostics.llmCallCount;
              llmLatencyTotalMs = trajectory.diagnostics.llmLatencyTotalMs;
              llmMaxCallLatencyMs = trajectory.diagnostics.maxCallLatencyMs;
              securityCallCount = trajectory.diagnostics.securityCallCount;
              objectSmallCallCount =
                trajectory.diagnostics.objectSmallCallCount;
            }
          })(),
          perRunTimeoutMs,
          `Benchmark run ${promptDef.id}#${runIndex}`,
        );
      } catch (err) {
        status = "error";
        error = err instanceof Error ? err.message : String(err);
      }

      const durationMs = Date.now() - startedAt;
      runRows.push({
        promptId: promptDef.id,
        runIndex,
        isWarmup,
        status,
        httpStatus,
        durationMs,
        responseChars,
        conversationId,
        trajectoryId,
        mainPromptChars,
        mainResponseChars,
        llmCallCount,
        llmLatencyTotalMs,
        llmMaxCallLatencyMs,
        securityCallCount,
        objectSmallCallCount,
        error,
      });

      const marker = isWarmup ? "warmup" : "measured";
      console.log(
        `[chat-benchmark] ${promptDef.id} run=${runIndex}/${args.runsPerPrompt} (${marker}) status=${status} durationMs=${durationMs}`,
      );
    }
  }

  const csvPath = path.join(outputDir, "runs.csv");
  const jsonPath = path.join(outputDir, "runs.json");
  const summaryPath = path.join(outputDir, "summary.json");

  const summary = summarize(runRows);
  await writeFile(csvPath, toCsv(runRows), "utf8");
  await writeFile(
    `${jsonPath}`,
    `${JSON.stringify(runRows, null, 2)}\n`,
    "utf8",
  );
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        apiBaseUrl: args.apiBaseUrl,
        promptsPath: path.resolve(args.promptsPath),
        promptIds: args.promptIds,
        chatOnly: args.chatOnly,
        runsPerPrompt: args.runsPerPrompt,
        warmupRuns: args.warmupRuns,
        channelType: args.channelType,
        summary,
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`[chat-benchmark] outputDir=${outputDir}`);
  console.log(`[chat-benchmark] csv=${csvPath}`);
  console.log(`[chat-benchmark] summary=${summaryPath}`);
}

run().catch((error) => {
  console.error(
    `[run-chat-benchmark-suite] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
