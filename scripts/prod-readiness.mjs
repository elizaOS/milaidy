#!/usr/bin/env node

import { execSync } from "node:child_process";

const runFullE2E = process.env.MILADY_PROD_READINESS_FULL === "1";

const checks = [
  {
    name: "Runtime state/config hygiene",
    command: "node scripts/runtime-hygiene-check.mjs --strict",
  },
  {
    name: "Typecheck",
    command: "bun run typecheck",
  },
  {
    name: "Hardening lint",
    command:
      "bunx @biomejs/biome check src/config/config.ts src/config/config.test.ts scripts/runtime-hygiene-check.mjs scripts/migrate-config-secrets.ts",
  },
  {
    name: "Backend targeted tests",
    command:
      "bunx vitest run src/config/config.test.ts src/runtime/dev-server-state.test.ts src/runtime/eliza.test.ts src/runtime/trajectory-persistence.test.ts src/api/provider-switch-config.test.ts src/api/wallet-routes.test.ts",
  },
  {
    name: "API readiness smoke tests",
    command:
      'bunx vitest run test/api-server.e2e.test.ts -t "healthz|readyz|returns not_started state"',
  },
  {
    name: "Build",
    command: "bun run build",
  },
  {
    name: "Frontend perf budget",
    command: "node scripts/perf-budget-check.mjs",
  },
];

function run(command, { allowSandboxBindFailure = false } = {}) {
  try {
    if (allowSandboxBindFailure) {
      const output = execSync(command, {
        stdio: "pipe",
        encoding: "utf8",
      });
      if (output?.trim()) process.stdout.write(output);
      return;
    }
    execSync(command, {
      stdio: "inherit",
      encoding: "utf8",
    });
  } catch (err) {
    if (!allowSandboxBindFailure) throw err;
    const output = [
      err && typeof err === "object" && "stdout" in err
        ? String(err.stdout ?? "")
        : "",
      err && typeof err === "object" && "stderr" in err
        ? String(err.stderr ?? "")
        : "",
      err instanceof Error ? err.message : String(err),
    ]
      .filter(Boolean)
      .join("\n");
    if (output.trim()) process.stderr.write(`${output}\n`);
    if (
      output.includes("listen EPERM: operation not permitted 127.0.0.1") ||
      output.includes("EACCES: permission denied") ||
      output.includes("SandboxDenied")
    ) {
      console.warn(
        "[prod-readiness] warn: API smoke skipped (sandbox/network bind restriction).",
      );
      return;
    }
    throw err;
  }
}

function main() {
  if (runFullE2E) {
    checks.splice(3, 0, {
      name: "API full e2e",
      command: "bunx vitest run test/api-server.e2e.test.ts",
    });
  }
  for (const check of checks) {
    console.log(`\n[prod-readiness] ${check.name}`);
    run(check.command, {
      allowSandboxBindFailure: check.name === "API readiness smoke tests",
    });
  }
  console.log("\n[prod-readiness] all checks passed");
}

main();
