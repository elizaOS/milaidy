#!/usr/bin/env node

/**
 * Deployment smoke check for app origins.
 *
 * Fails fast when /api/status is missing (for example when an app shell is
 * accidentally deployed to a marketing/static origin).
 *
 * Usage:
 *   node scripts/smoke-api-status.mjs https://milady.ai
 * or
 *   MILADY_DEPLOY_BASE_URL=https://milady.ai node scripts/smoke-api-status.mjs
 */

const baseArg = process.argv[2]?.trim();
const baseEnv = process.env.MILADY_DEPLOY_BASE_URL?.trim();
const base = baseArg || baseEnv;

if (!base) {
  console.error(
    "[smoke-api-status] Missing base URL. Pass arg or set MILADY_DEPLOY_BASE_URL.",
  );
  process.exit(2);
}

const timeoutMs = 10_000;
const controller = new AbortController();
const timer = setTimeout(() => controller.abort(), timeoutMs);

try {
  const url = new URL("/api/status", base).toString();
  const res = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    signal: controller.signal,
  });
  if (!res.ok) {
    console.error(
      `[smoke-api-status] FAIL ${url} returned HTTP ${res.status} ${res.statusText}`,
    );
    process.exit(1);
  }

  const body = await res.json().catch(() => null);
  if (!body || typeof body.state !== "string") {
    console.error(
      `[smoke-api-status] FAIL ${url} responded without expected status payload.`,
    );
    process.exit(1);
  }

  console.log(`[smoke-api-status] OK ${url} state=${body.state}`);
} catch (err) {
  const timedOut = controller.signal.aborted;
  const msg = err instanceof Error ? err.message : String(err);
  if (timedOut) {
    console.error(
      `[smoke-api-status] FAIL request timed out after ${timeoutMs}ms`,
    );
  } else {
    console.error(`[smoke-api-status] FAIL ${msg}`);
  }
  process.exit(1);
} finally {
  clearTimeout(timer);
}
