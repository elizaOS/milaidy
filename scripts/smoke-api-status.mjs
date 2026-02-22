#!/usr/bin/env node

/**
 * Deployment smoke check for app origins.
 *
 * Fails fast when /api/status is missing (for example when an app shell is
 * accidentally deployed to a marketing/static origin).
 *
 * Usage:
 *   node scripts/smoke-api-status.mjs https://milady.ai https://app.milady.ai
 * or
 *   MILADY_DEPLOY_BASE_URLS=https://milady.ai,https://app.milady.ai node scripts/smoke-api-status.mjs
 */

const argvBases = process.argv
  .slice(2)
  .map((value) => value.trim())
  .filter(Boolean);
const envList =
  process.env.MILADY_DEPLOY_BASE_URLS?.split(",")
    .map((value) => value.trim())
    .filter(Boolean) ?? [];
const legacyEnv = process.env.MILADY_DEPLOY_BASE_URL?.trim();
if (legacyEnv) envList.push(legacyEnv);
const bases = argvBases.length > 0 ? argvBases : envList;

if (bases.length === 0) {
  console.error(
    "[smoke-api-status] Missing base URLs. Pass args or set MILADY_DEPLOY_BASE_URLS.",
  );
  process.exit(2);
}

const timeoutMs = 10_000;
let hasFailure = false;

for (const base of bases) {
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
      hasFailure = true;
      continue;
    }

    const body = await res.json().catch(() => null);
    if (!body || typeof body.state !== "string") {
      console.error(
        `[smoke-api-status] FAIL ${url} responded without expected status payload.`,
      );
      hasFailure = true;
      continue;
    }

    console.log(`[smoke-api-status] OK ${url} state=${body.state}`);
  } catch (err) {
    const timedOut = controller.signal.aborted;
    const msg = err instanceof Error ? err.message : String(err);
    if (timedOut) {
      console.error(
        `[smoke-api-status] FAIL ${base} timed out after ${timeoutMs}ms`,
      );
    } else {
      console.error(`[smoke-api-status] FAIL ${base} ${msg}`);
    }
    hasFailure = true;
  } finally {
    clearTimeout(timer);
  }
}

if (hasFailure) process.exit(1);
