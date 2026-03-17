#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

function parseArgs(argv) {
  const args = {
    input: "",
    output: "",
    summary: "",
    scenario: "baseline",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === "--input") args.input = argv[++i] ?? "";
    else if (token === "--output") args.output = argv[++i] ?? "";
    else if (token === "--summary") args.summary = argv[++i] ?? "";
    else if (token === "--scenario") args.scenario = argv[++i] ?? "baseline";
  }

  if (!args.input) {
    throw new Error(
      "Missing required --input. Example: --input ./.tmp/chat-baseline.log",
    );
  }

  if (!args.output) {
    const stem = path.basename(args.input).replace(/\.[^.]+$/, "");
    args.output = path.join(path.dirname(args.input), `${stem}.metrics.csv`);
  }

  if (!args.summary) {
    const stem = path.basename(args.output).replace(/\.[^.]+$/, "");
    args.summary = path.join(path.dirname(args.output), `${stem}.summary.json`);
  }

  return args;
}

function parseNumber(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`"${escaped}"\\s*:\\s*([0-9]+(?:\\.[0-9]+)?)`),
    new RegExp(`${escaped}\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)`),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (!match) continue;
    const value = Number(match[1]);
    if (Number.isFinite(value)) return value;
  }
  return null;
}

function parseString(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const patterns = [
    new RegExp(`"${escaped}"\\s*:\\s*"([^"]+)"`),
    new RegExp(`${escaped}\\s*[:=]\\s*([A-Za-z0-9_\\-.]+)`),
  ];
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return match[1];
  }
  return "";
}

function parseTimestamp(line) {
  const iso = line.match(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/)?.[0];
  if (iso) return iso;
  return "";
}

function quantile(sorted, q) {
  if (sorted.length === 0) return null;
  if (sorted.length === 1) return sorted[0];
  const pos = (sorted.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (sorted[base + 1] === undefined) return sorted[base];
  return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
}

function toCsv(rows) {
  const header = [
    "timestamp",
    "scenario",
    "run_index",
    "duration_ms",
    "prompt_chars",
    "completion_chars",
    "prompt_tokens_est",
    "completion_tokens_est",
    "mode",
    "stream_source",
    "message_source",
    "status",
  ];

  const lines = [header.join(",")];
  for (const row of rows) {
    const values = [
      row.timestamp,
      row.scenario,
      String(row.runIndex),
      String(row.durationMs ?? ""),
      String(row.promptChars ?? ""),
      String(row.completionChars ?? ""),
      String(row.promptTokens ?? ""),
      String(row.completionTokens ?? ""),
      row.mode,
      row.streamSource,
      row.messageSource,
      row.status,
    ].map((value) => `"${String(value).replace(/"/g, '""')}"`);
    lines.push(values.join(","));
  }
  return `${lines.join("\n")}\n`;
}

function summarize(rows) {
  const okRows = rows.filter((row) => row.status === "ok");
  const duration = okRows
    .map((row) => row.durationMs)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const promptTokens = okRows
    .map((row) => row.promptTokens)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);
  const completionTokens = okRows
    .map((row) => row.completionTokens)
    .filter((value) => Number.isFinite(value))
    .sort((a, b) => a - b);

  const average = (values) =>
    values.length === 0
      ? null
      : values.reduce((sum, value) => sum + value, 0) / values.length;

  return {
    sampleCount: rows.length,
    okCount: okRows.length,
    errorCount: rows.length - okRows.length,
    errorRate:
      rows.length === 0 ? 0 : (rows.length - okRows.length) / rows.length,
    durationMs: {
      avg: average(duration),
      p50: quantile(duration, 0.5),
      p95: quantile(duration, 0.95),
    },
    promptTokens: {
      avg: average(promptTokens),
      p50: quantile(promptTokens, 0.5),
      p95: quantile(promptTokens, 0.95),
    },
    completionTokens: {
      avg: average(completionTokens),
      p50: quantile(completionTokens, 0.5),
      p95: quantile(completionTokens, 0.95),
    },
  };
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const raw = await readFile(path.resolve(args.input), "utf8");
  const lines = raw.split(/\r?\n/);

  const rows = [];
  let runIndex = 0;

  for (const line of lines) {
    if (!line.includes("[chat] Prompt metrics")) continue;
    runIndex += 1;

    const durationMs = parseNumber(line, "durationMs");
    const promptChars = parseNumber(line, "promptChars");
    const completionChars = parseNumber(line, "completionChars");
    const promptTokens = parseNumber(line, "promptTokens");
    const completionTokens = parseNumber(line, "completionTokens");
    const mode = parseString(line, "mode");
    const streamSource = parseString(line, "streamSource");
    const messageSource = parseString(line, "messageSource");

    const status = durationMs === null ? "error" : "ok";

    rows.push({
      timestamp: parseTimestamp(line),
      scenario: args.scenario,
      runIndex,
      durationMs,
      promptChars,
      completionChars,
      promptTokens,
      completionTokens,
      mode,
      streamSource,
      messageSource,
      status,
    });
  }

  const outputPath = path.resolve(args.output);
  const summaryPath = path.resolve(args.summary);

  await mkdir(path.dirname(outputPath), { recursive: true });
  await mkdir(path.dirname(summaryPath), { recursive: true });

  await writeFile(outputPath, toCsv(rows), "utf8");
  await writeFile(
    summaryPath,
    `${JSON.stringify(
      {
        scenario: args.scenario,
        generatedAt: new Date().toISOString(),
        sourceLog: path.resolve(args.input),
        summary: summarize(rows),
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  console.log(`[chat-benchmark] rows=${rows.length}`);
  console.log(`[chat-benchmark] csv=${outputPath}`);
  console.log(`[chat-benchmark] summary=${summaryPath}`);
}

run().catch((error) => {
  console.error(
    `[extract-chat-benchmark-metrics] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
