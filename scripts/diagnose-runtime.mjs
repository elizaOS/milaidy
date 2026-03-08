#!/usr/bin/env node

/**
 * Local runtime diagnostics loop.
 *
 * Usage:
 *   bun run diagnose:runtime
 *   bun run diagnose:runtime -- --base http://127.0.0.1:31337 --interval 3000 --tail 12
 *   bun run diagnose:runtime -- --once
 */

const args = process.argv.slice(2);

function readFlag(name, fallback = "") {
  const idx = args.indexOf(name);
  if (idx === -1) return fallback;
  const next = args[idx + 1];
  if (!next || next.startsWith("--")) return fallback;
  return next;
}

const once = args.includes("--once");
const base = (readFlag("--base", "http://127.0.0.1:31337") || "").replace(
  /\/+$/,
  "",
);
const intervalMs = Number.parseInt(readFlag("--interval", "3000"), 10);
const tailCount = Number.parseInt(readFlag("--tail", "10"), 10);

if (!base.startsWith("http://") && !base.startsWith("https://")) {
  console.error(`[diagnose-runtime] Invalid --base URL: ${base}`);
  process.exit(2);
}

if (!Number.isFinite(intervalMs) || intervalMs < 250) {
  console.error(
    `[diagnose-runtime] Invalid --interval: ${intervalMs}. Must be >= 250.`,
  );
  process.exit(2);
}

if (!Number.isFinite(tailCount) || tailCount < 1 || tailCount > 200) {
  console.error(
    `[diagnose-runtime] Invalid --tail: ${tailCount}. Must be 1..200.`,
  );
  process.exit(2);
}

let lastPrintedLogTimestamp = 0;
let tick = 0;

function formatIso(ts) {
  if (!Number.isFinite(ts) || ts <= 0) return "n/a";
  return new Date(ts).toISOString();
}

function summarizeStatus(status) {
  const startup = status?.startup ?? {};
  const pendingRestartReasons = Array.isArray(status?.pendingRestartReasons)
    ? status.pendingRestartReasons
    : [];
  return [
    `state=${status?.state ?? "unknown"}`,
    `phase=${startup.phase ?? "unknown"}`,
    `attempt=${startup.attempt ?? 0}`,
    `pendingRestart=${Boolean(status?.pendingRestart)}`,
    `reasons=${pendingRestartReasons.length}`,
    `uptime=${status?.uptime ?? 0}`,
  ].join(" | ");
}

function classifyFailureHint(status, logs) {
  const startup = status?.startup ?? {};
  const lastErrorText = String(startup.lastError ?? "").toLowerCase();
  const latestErrors = (logs ?? [])
    .filter((entry) => entry?.level === "error" || entry?.level === "warn")
    .slice(-20)
    .map((entry) => String(entry?.message ?? "").toLowerCase())
    .join("\n");
  const haystack = `${lastErrorText}\n${latestErrors}`;

  if (
    haystack.includes("migrations._migrations") ||
    haystack.includes("migration failed")
  ) {
    return "Likely DB migration metadata issue (plugin-sql/trust/todo).";
  }
  if (haystack.includes("incorrect api key") || haystack.includes("401")) {
    return "Likely invalid API key for selected provider.";
  }
  if (haystack.includes("insufficient credits")) {
    return "Provider account has insufficient credits.";
  }
  if (haystack.includes("request timeout") || haystack.includes("timed out")) {
    return "Runtime startup/model call timeout.";
  }
  if (haystack.includes("eaddrinuse") || haystack.includes("port")) {
    return "Port collision detected.";
  }
  return "";
}

async function getJson(pathname) {
  const res = await fetch(`${base}${pathname}`, {
    headers: { accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`${pathname} -> HTTP ${res.status}`);
  }
  return res.json();
}

async function tickOnce() {
  tick += 1;
  const now = new Date().toISOString();
  try {
    const [statusResp, logsResp] = await Promise.all([
      getJson("/api/status"),
      getJson("/api/logs"),
    ]);

    const entries = Array.isArray(logsResp?.entries) ? logsResp.entries : [];
    const latest = entries
      .filter((entry) => entry?.timestamp > lastPrintedLogTimestamp)
      .filter((entry) => entry?.level === "warn" || entry?.level === "error")
      .slice(-tailCount);

    if (latest.length > 0) {
      const maxTs = latest.reduce(
        (acc, entry) => Math.max(acc, Number(entry?.timestamp ?? 0)),
        lastPrintedLogTimestamp,
      );
      lastPrintedLogTimestamp = maxTs;
    }

    console.log(`\n[${now}] tick=${tick} ${summarizeStatus(statusResp)}`);

    const startup = statusResp?.startup ?? {};
    if (startup.lastError) {
      console.log(
        `startup.lastErrorAt=${formatIso(Number(startup.lastErrorAt ?? 0))}`,
      );
      console.log(`startup.lastError=${String(startup.lastError)}`);
    }
    if (startup.nextRetryAt) {
      console.log(
        `startup.nextRetryAt=${formatIso(Number(startup.nextRetryAt ?? 0))}`,
      );
    }

    const hint = classifyFailureHint(statusResp, entries);
    if (hint) console.log(`hint=${hint}`);

    if (latest.length === 0) {
      console.log("new warn/error logs: none");
    } else {
      console.log("new warn/error logs:");
      for (const entry of latest) {
        const ts = formatIso(Number(entry?.timestamp ?? 0));
        const level = String(entry?.level ?? "info").toUpperCase();
        const source = String(entry?.source ?? "unknown");
        const message = String(entry?.message ?? "")
          .replace(/\s+/g, " ")
          .trim();
        console.log(`- ${ts} [${level}] (${source}) ${message}`);
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(`\n[${now}] tick=${tick} api-unreachable: ${message}`);
  }
}

await tickOnce();
if (!once) {
  setInterval(() => {
    void tickOnce();
  }, intervalMs);
}
