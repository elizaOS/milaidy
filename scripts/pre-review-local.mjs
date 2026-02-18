#!/usr/bin/env bun
/**
 * Local pre-review guardrails for this repo.
 *
 * Goal: provide deterministic, bot-like checks before PR/push. Keep this script
 * dependency-free and fast; it should run in CI/dev without Node installed.
 */

import { spawnSync } from "node:child_process";

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, {
    cwd: opts.cwd,
    env: opts.env ?? process.env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  return {
    code: res.status ?? 1,
    stdout: (res.stdout ?? "").toString(),
    stderr: (res.stderr ?? "").toString(),
  };
}

function ok(code) {
  return code === 0;
}

function trimLines(s) {
  return s
    .split("\n")
    .map((l) => l.trimEnd())
    .filter(Boolean);
}

function pickBaseRef() {
  const hasOriginDevelop = ok(
    run("git", ["rev-parse", "--verify", "origin/develop"]).code,
  );
  if (hasOriginDevelop) return "origin/develop";
  const hasDevelop = ok(run("git", ["rev-parse", "--verify", "develop"]).code);
  if (hasDevelop) return "develop";
  return "main";
}

function mergeBase(baseRef) {
  const res = run("git", ["merge-base", baseRef, "HEAD"]);
  if (!ok(res.code)) return baseRef;
  return res.stdout.trim() || baseRef;
}

function uniq(items) {
  return [...new Set(items)];
}

function looksLikeRepoNoise(path) {
  // Avoid failing pre-review on generated local-only artifacts that are not intended for PRs.
  if (path === "package-lock.json") return true;
  if (path.startsWith(".bun/")) return true;
  if (path.startsWith("dist/")) return true;
  if (path.startsWith("build/")) return true;
  return false;
}

function changedFiles(baseRef) {
  // Compare base ref to *working tree*, not just committed HEAD, so this works before committing.
  // Include staged + unstaged, plus untracked files (excluding gitignored).
  const basePoint = mergeBase(baseRef);

  const unstaged = run("git", ["diff", "--name-only", basePoint]);
  const staged = run("git", ["diff", "--name-only", "--cached", basePoint]);
  const untracked = run("git", ["ls-files", "--others", "--exclude-standard"]);

  const files = uniq([
    ...trimLines(unstaged.stdout),
    ...trimLines(staged.stdout),
    ...trimLines(untracked.stdout),
  ]).filter((f) => !looksLikeRepoNoise(f));

  return files;
}

function classify(files) {
  const lower = files.map((f) => f.toLowerCase());
  const onlyDocs =
    lower.length > 0 &&
    lower.every(
      (f) =>
        f.endsWith(".md") ||
        f.startsWith("docs/") ||
        f === "license" ||
        f === "readme.md" ||
        f === "contributing.md",
    );

  if (onlyDocs) return "aesthetic";
  if (lower.some((f) => f.includes("security") || f.includes("auth")))
    return "security";
  if (lower.some((f) => f.includes("test") || f.endsWith(".test.ts")))
    return "bug fix";
  return "feature";
}

function scopeVerdict(classification) {
  if (classification === "aesthetic") return "out of scope";
  if (classification === "feature") return "needs deep review";
  return "in scope";
}

function scanAddedLinesForDiffIssues(baseRef) {
  // Scan both staged and unstaged added lines vs base ref.
  const basePoint = mergeBase(baseRef);
  const d1 = run("git", ["diff", "--unified=0", basePoint]);
  const d2 = run("git", ["diff", "--unified=0", "--cached", basePoint]);
  if (!ok(d1.code) || !ok(d2.code))
    return { issues: ["Failed to compute git diff."], notes: [] };

  // Parse unified diff and keep track of which file we're currently in.
  // This allows us to avoid self-referential false positives (the scanner
  // contains the patterns it searches for).
  const rawLines = `${d1.stdout}\n${d2.stdout}`.split("\n");
  let currentFile = null;
  const addedByFile = new Map();
  for (const line of rawLines) {
    if (line.startsWith("+++ b/")) {
      currentFile = line.slice("+++ b/".length).trim();
      continue;
    }
    if (!currentFile) continue;
    if (!line.startsWith("+") || line.startsWith("+++")) continue;
    const arr = addedByFile.get(currentFile) ?? [];
    arr.push(line);
    addedByFile.set(currentFile, arr);
  }

  const ignoreFilesForHeuristics = new Set(["scripts/pre-review-local.mjs"]);
  const added = [...addedByFile.entries()]
    .filter(([file]) => !ignoreFilesForHeuristics.has(file))
    .flatMap(([, lines]) => lines);

  const issues = [];
  const notes = [];

  const hasTsIgnore = added.some((l) => l.includes("@ts-ignore"));
  if (hasTsIgnore) issues.push("Blocked: added `@ts-ignore` in diff.");

  // Keep this heuristic conservative: flag obvious type escapes only.
  const anyPatterns = [": any", "<any>", " as any", "any[]"];
  const anyHits = added.filter((l) => anyPatterns.some((p) => l.includes(p)));
  if (anyHits.length > 0) {
    issues.push("Blocked: added `any`-typed code in diff (heuristic).");
    notes.push(
      ...anyHits.slice(0, 5).map((l) => `any-hit: ${l.slice(1).trim()}`),
    );
  }

  const secretPatterns = [
    /-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----/,
    /\bsk-[a-zA-Z0-9]{20,}\b/,
    /\bxox[baprs]-[a-zA-Z0-9-]{10,}\b/,
    /\bAKIA[0-9A-Z]{16}\b/,
    /\bAIza[0-9A-Za-z_-]{30,}\b/,
  ];
  const secretHits = added.filter((l) =>
    secretPatterns.some((re) => re.test(l)),
  );
  if (secretHits.length > 0) {
    issues.push("Blocked: possible secret material added in diff.");
    notes.push(
      ...secretHits.slice(0, 5).map((l) => `secret-hit: ${l.slice(1).trim()}`),
    );
  }

  return { issues, notes };
}

function dependencyScrutiny(baseRef, files) {
  if (!files.includes("package.json")) return { issues: [], notes: [] };
  const basePoint = mergeBase(baseRef);
  const d1 = run("git", ["diff", basePoint, "--", "package.json"]);
  const d2 = run("git", ["diff", "--cached", basePoint, "--", "package.json"]);
  if (!ok(d1.code) || !ok(d2.code))
    return { issues: ["Failed to diff package.json."], notes: [] };

  const added = `${d1.stdout}\n${d2.stdout}`
    .split("\n")
    .filter((l) => l.startsWith("+") && !l.startsWith("+++"))
    .map((l) => l.slice(1));

  const depAdd = added.filter(
    (l) => l.includes('"dependencies"') || l.includes('"devDependencies"'),
  );
  if (depAdd.length === 0) return { issues: [], notes: [] };

  // We can't safely prove runtime imports here without heavier analysis; require human review.
  return {
    issues: [
      "Dependency change detected in package.json; verify new deps are necessary and directly imported.",
    ],
    notes: [],
  };
}

function testsExpectation(classification, files) {
  if (classification === "aesthetic") return { issues: [], notes: [] };

  // If only tooling/config changes, don't require tests.
  const nonTestChanges = files.filter(
    (f) =>
      !(
        f.endsWith(".test.ts") ||
        f.endsWith(".e2e.test.ts") ||
        f.endsWith(".live.test.ts") ||
        f.startsWith("test/")
      ),
  );

  const onlyTooling =
    nonTestChanges.length > 0 &&
    nonTestChanges.every(
      (f) =>
        f.startsWith("scripts/") ||
        f.startsWith("git-hooks/") ||
        f.startsWith(".github/") ||
        f === "package.json" ||
        f === "pnpm-workspace.yaml" ||
        f === "biome.json" ||
        f.startsWith("docs/") ||
        f.endsWith(".md"),
    );

  if (onlyTooling) return { issues: [], notes: [] };

  const changedTests = files.filter(
    (f) =>
      f.endsWith(".test.ts") ||
      f.endsWith(".e2e.test.ts") ||
      f.endsWith(".live.test.ts"),
  );

  if (changedTests.length > 0) return { issues: [], notes: [] };

  return {
    issues: [
      "Tests expected for non-aesthetic changes, but no test files were modified.",
    ],
    notes: [],
  };
}

function runChangedTests(files) {
  const unitTests = files.filter(
    (f) =>
      f.endsWith(".test.ts") &&
      !f.endsWith(".e2e.test.ts") &&
      !f.endsWith(".live.test.ts"),
  );
  const e2eTests = files.filter((f) => f.endsWith(".e2e.test.ts"));

  const results = [];

  if (unitTests.length > 0) {
    const res = run("bunx", [
      "vitest",
      "run",
      "--config",
      "vitest.unit.config.ts",
      ...unitTests,
    ]);
    results.push({
      kind: "unit",
      code: res.code,
      stdout: res.stdout,
      stderr: res.stderr,
    });
    if (!ok(res.code)) return results;
  }

  if (e2eTests.length > 0) {
    const res = run("bunx", [
      "vitest",
      "run",
      "--config",
      "vitest.e2e.config.ts",
      ...e2eTests,
    ]);
    results.push({
      kind: "e2e",
      code: res.code,
      stdout: res.stdout,
      stderr: res.stderr,
    });
  }

  return results;
}

function fmtStatus(okay) {
  return okay ? "pass" : "fail";
}

function main() {
  const baseRef = pickBaseRef();
  const basePoint = mergeBase(baseRef);
  const files = changedFiles(baseRef);

  const branch = run("git", ["branch", "--show-current"]).stdout.trim();

  const classification = files.length === 0 ? "aesthetic" : classify(files);
  const scope = scopeVerdict(classification);

  const required = [];
  const notes = [];

  if (!branch) {
    required.push("Detached HEAD: checkout a branch before pushing/PR.");
  }

  // Code quality: typecheck + Biome (changed files only).
  let typecheckOk = true;
  let lintOk = true;

  if (scope !== "out of scope") {
    const tc = run("bun", ["run", "typecheck"]);
    typecheckOk = ok(tc.code);
    if (!typecheckOk) {
      required.push(
        "Typecheck failed: run `bun run typecheck` and fix errors.",
      );
      notes.push(
        ...trimLines(tc.stdout)
          .slice(0, 20)
          .map((l) => `typecheck: ${l}`),
      );
      notes.push(
        ...trimLines(tc.stderr)
          .slice(0, 20)
          .map((l) => `typecheck: ${l}`),
      );
    }

    const biomeTargets = files.filter(
      (f) =>
        f.endsWith(".ts") ||
        f.endsWith(".tsx") ||
        f.endsWith(".js") ||
        f.endsWith(".mjs"),
    );
    if (biomeTargets.length > 0) {
      const lint = run("bunx", ["@biomejs/biome", "check", ...biomeTargets]);
      lintOk = ok(lint.code);
      if (!lintOk) {
        required.push(
          "Biome check failed on changed files: run `bun run lint` and fix.",
        );
        notes.push(
          ...trimLines(lint.stdout)
            .slice(0, 40)
            .map((l) => `biome: ${l}`),
        );
        notes.push(
          ...trimLines(lint.stderr)
            .slice(0, 40)
            .map((l) => `biome: ${l}`),
        );
      }
    }
  }

  // Diff scans.
  const diffScan = scanAddedLinesForDiffIssues(baseRef);
  required.push(...diffScan.issues);
  notes.push(...diffScan.notes);

  const depScan = dependencyScrutiny(baseRef, files);
  required.push(...depScan.issues);
  notes.push(...depScan.notes);

  const testReq = testsExpectation(classification, files);
  required.push(...testReq.issues);
  notes.push(...testReq.notes);

  // Tests: if tests changed, execute them.
  const testRuns = runChangedTests(files);
  const testsOk = testRuns.every((r) => ok(r.code));
  if (testRuns.length > 0 && !testsOk)
    required.push("Changed tests failed: fix failing tests and re-run.");

  const decision =
    scope === "out of scope"
      ? "CLOSE"
      : required.length === 0 && typecheckOk && lintOk && testsOk
        ? "APPROVE"
        : "REQUEST CHANGES";

  const codeQualitySummary =
    scope === "out of scope"
      ? "skipped (out of scope)"
      : `typecheck=${fmtStatus(typecheckOk)}, biome(changed)=${fmtStatus(lintOk)}`;

  const securitySummary = diffScan.issues.some((i) =>
    i.toLowerCase().includes("secret"),
  )
    ? "fail (possible secret)"
    : "pass";

  let testsSummary = "skipped";
  if (testRuns.length > 0)
    testsSummary = testsOk ? "pass (changed tests)" : "fail (changed tests)";
  else if (scope !== "out of scope") testsSummary = "no changed tests";

  // Output in the expected structured format.
  console.log("## Pre-Review Results");
  console.log(`1. **Classification:** ${classification}`);
  console.log(`2. **Scope verdict:** ${scope}`);
  console.log(`3. **Code quality:** ${codeQualitySummary}`);
  console.log(`4. **Security:** ${securitySummary}`);
  console.log(`5. **Tests:** ${testsSummary}`);
  console.log(`6. **Decision:** ${decision}`);

  console.log("");
  console.log(
    `Context: baseRef=${baseRef}, basePoint=${basePoint}, branch=${branch || "DETACHED"}`,
  );

  if (files.length > 0) {
    console.log("");
    console.log("Changed files:");
    for (const f of files) console.log(`- ${f}`);
  }

  if (required.length > 0) {
    console.log("");
    console.log("Required changes:");
    for (const item of required) console.log(`- [ ] ${item}`);
  }

  if (notes.length > 0) {
    console.log("");
    console.log("Notes:");
    for (const n of notes) console.log(`- ${n}`);
  }

  // Exit code parity: 0 for approve, non-zero otherwise.
  process.exit(decision === "APPROVE" ? 0 : 1);
}

main();
