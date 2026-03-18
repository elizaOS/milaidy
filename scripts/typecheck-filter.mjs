#!/usr/bin/env node
/**
 * Run tsc --noEmit and filter out errors originating from node_modules.
 *
 * @elizaos packages ship .ts source files in their npm tarballs. When the
 * sibling eliza workspace isn't present (CI, fresh clones), TypeScript
 * resolves these .ts files via node_modules and reports errors in code we
 * don't control.  skipLibCheck only covers .d.ts files, so we filter here.
 */
import { execSync } from "node:child_process";

try {
  execSync("tsc --noEmit", { stdio: "pipe", encoding: "utf-8" });
} catch (err) {
  const output = (err.stdout ?? "") + (err.stderr ?? "");
  const lines = output.split("\n");
  const ours = lines.filter(
    (l) => !l.includes("node_modules/") && !l.includes("node_modules\\"),
  );
  const ourErrors = ours.filter((l) => l.includes("error TS"));
  if (ourErrors.length > 0) {
    process.stderr.write(`${ours.join("\n")}\n`);
    process.exit(1);
  }
  // All errors were in node_modules — pass
}
