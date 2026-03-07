#!/usr/bin/env node

import { execSync } from "node:child_process";

const runFullE2E = process.env.MILADY_PROD_READINESS_FULL === "1";

const checks = [
  {
    name: "Typecheck",
    command: "bun run typecheck",
  },
  {
    name: "Backend targeted tests",
    command:
      "bunx vitest run src/config/config.test.ts src/api/wallet-routes.test.ts src/runtime/eliza.test.ts",
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
];

function run(command) {
  execSync(command, {
    stdio: "inherit",
    encoding: "utf8",
  });
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
    run(check.command);
  }
  console.log("\n[prod-readiness] all checks passed");
}

main();
