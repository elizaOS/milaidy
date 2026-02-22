import { execFileSync, execSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ANY_TYPE_PATTERN = /:\s*any\b|<\s*any\s*>|\bas\s+any\b/;

const SECRET_LIKE_TOKEN_PATTERNS = [
  /sk-[a-z0-9]{20,}/i,
  /pk_[a-z0-9]{24,}/i,
  /xox[baprs]-[0-9a-z-]{10,}/i,
  /gh[pousr]_[A-Za-z0-9_]{36,}/i,
  /(?:^|[^A-Za-z0-9_])(password|secret|api[_-]?key|access[_-]?token|client[_-]?secret|private[_-]?key)\s*[:=]\s*["'][^"']{8,}/i,
];

function normalizeExecError(error) {
  return {
    ok: false,
    stdout: error.stdout ? String(error.stdout) : "",
    stderr: error.stderr ? String(error.stderr) : String(error.message),
    status: Number(error.status ?? 1),
  };
}

function runCommand(command, options = {}) {
  try {
    return {
      ok: true,
      stdout: execSync(command, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        ...options,
      }),
      stderr: "",
      status: 0,
    };
  } catch (error) {
    return normalizeExecError(error);
  }
}

function runCommandArgs(command, args, options = {}) {
  try {
    return {
      ok: true,
      stdout: execFileSync(command, args, {
        encoding: "utf8",
        stdio: ["pipe", "pipe", "pipe"],
        ...options,
      }),
      stderr: "",
      status: 0,
    };
  } catch (error) {
    return normalizeExecError(error);
  }
}

export function getBaseRef() {
  const candidates = [
    "refs/heads/origin/develop",
    "origin/develop",
    "develop",
    "refs/remotes/origin/main",
    "origin/main",
    "main",
  ];

  for (const ref of candidates) {
    const result = runCommandArgs("git", ["rev-parse", "--verify", ref]);
    if (result.ok) return ref;
  }

  return "HEAD~1";
}

function firstFailureTitle(message) {
  return `Failed: ${message}`;
}

export function classificationFromInputs({ branch, message }) {
  const content = `${branch} ${message}`.toLowerCase();

  if (
    /(\b(redesign|restyle|theme|font|layout|css|visual|icon|logo|animation|aesthetic)\b|dark\s+mode)/.test(
      content,
    )
  ) {
    return "aesthetic";
  }

  if (/(security|vuln|secret|auth|leak)/.test(content)) {
    return "security";
  }

  if (/(fix|bug|crash|regression|error|broken)/.test(content)) {
    return "bugfix";
  }

  return "feature";
}

export function scopeVerdictFor(classification) {
  if (classification === "aesthetic") return "out of scope";
  if (classification === "feature") return "needs deep review";
  return "in scope";
}

export function decisionFromFindings({ classification, issues }) {
  return classification === "aesthetic" || issues.length > 0
    ? "REQUEST CHANGES"
    : "APPROVE";
}

export function scanDiffTextForBlockedPatterns(diffChunks) {
  const issues = [];

  if (ANY_TYPE_PATTERN.test(diffChunks)) {
    issues.push(
      "Potential `any` usage introduced or modified. Verify strict typing is necessary.",
    );
  }

  if (/@ts-ignore/.test(diffChunks)) {
    issues.push(
      "`@ts-ignore` usage detected. Prefer explicit narrowing or guards.",
    );
  }

  for (const pattern of SECRET_LIKE_TOKEN_PATTERNS) {
    if (pattern.test(diffChunks)) {
      issues.push(
        "Potential secret-like string in diff; verify no credentials or secrets were added.",
      );
      break;
    }
  }

  return issues;
}

function readDiffForFiles(base, sourceFiles) {
  return sourceFiles
    .map((file) => {
      const result = runCommandArgs("git", [
        "diff",
        `${base}...HEAD`,
        "--",
        file,
      ]);
      return result.ok ? result.stdout : "";
    })
    .join("\n");
}

export function scanForBlockedDiffPatterns(base, changedFiles) {
  const sourceFiles = changedFiles.filter(
    (file) =>
      file !== "scripts/pre-review-local.mjs" &&
      !/\.(?:e2e\.)?test\.(tsx?|jsx?)$/i.test(file),
  );
  if (sourceFiles.length === 0) return [];

  const diffChunks = readDiffForFiles(base, sourceFiles);
  return scanDiffTextForBlockedPatterns(diffChunks);
}

export function collectChangedFiles(base) {
  const result = runCommandArgs("git", [
    "diff",
    "--name-only",
    `${base}...HEAD`,
  ]);
  if (!result.ok) {
    return {
      files: [],
      lines: "",
      errors: [
        firstFailureTitle("unable to read changed files"),
        result.stderr,
      ],
    };
  }

  const files = result.stdout
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return { files, lines: result.stdout, errors: [] };
}

export function collectCommitMessage(base) {
  const result = runCommandArgs("git", [
    "log",
    "-1",
    "--pretty=%s",
    `${base}..HEAD`,
  ]);
  if (result.ok && result.stdout.trim()) return result.stdout.trim();

  const fallback = runCommandArgs("git", ["log", "-1", "--pretty=%s", "HEAD"]);
  if (fallback.ok) return fallback.stdout.trim();

  return "";
}

export function runChecks() {
  const base = getBaseRef();
  const branch =
    runCommandArgs("git", ["branch", "--show-current"]).stdout.trim() ||
    "HEAD (detached)";
  const commitMessage = collectCommitMessage(base);
  const classification = classificationFromInputs({
    branch,
    message: commitMessage,
  });
  const scope = scopeVerdictFor(classification);

  const changed = collectChangedFiles(base);
  if (changed.errors.length) {
    return {
      classification,
      scopeVerdict: "needs deep review",
      codeQuality: `issues found: ${changed.errors.join("; ")}`,
      security: "concerns: change detection failed",
      tests: "not run: unable to read diff",
      decision: "REQUEST CHANGES",
      checklist: ["Pre-review failed to resolve git diff for changed files."],
      details: [],
      exitCode: 1,
    };
  }

  if (changed.files.length === 0) {
    return {
      classification: "other",
      scopeVerdict: "in scope",
      codeQuality: "pass",
      security: "clear",
      tests: "not applicable: no files changed compared to base branch.",
      decision: "APPROVE",
      checklist: [],
      details: [],
      changedFiles: [],
      exitCode: 0,
    };
  }

  const issues = scanForBlockedDiffPatterns(base, changed.files);

  const checks = [
    { name: "bun run lint", command: "bun run lint" },
    { name: "bun run typecheck", command: "bun run typecheck" },
  ];

  const missingTests = [];
  const checklist = [];

  for (const check of checks) {
    const result = runCommand(check.command);
    if (!result.ok) {
      issues.push(`${check.name} failed.`);
      checklist.push(`${check.name} must pass before approval.`);
    }
  }

  if (
    classification === "bugfix" ||
    classification === "feature" ||
    classification === "security"
  ) {
    const testFiles = changed.files.filter((file) =>
      /\.(?:e2e\.)?test\.(ts|tsx|js|jsx)$/.test(file),
    );
    if (testFiles.length === 0) {
      issues.push("No changed test files found for a behavioral change.");
      missingTests.push(
        "Add or update regression tests for changed runtime behavior.",
      );
      checklist.push(
        "Run tests that validate the exact behavior change and check them in.",
      );
    } else {
      const testRun = runCommand(
        `bunx vitest run --no-cache ${testFiles.join(" ")}`,
      );
      if (!testRun.ok) {
        issues.push("Regression/new-behavior tests did not pass.");
        missingTests.push(
          "Fix failing tests or add missing assertions for changed paths.",
        );
        checklist.push(
          "Re-run targeted regression tests after behavioral fixes.",
        );
      }
    }
  }

  const decision = decisionFromFindings({ classification, issues });

  if (classification === "aesthetic") {
    checklist.push(
      "Aesthetic-only scope is blocked unless user-specified and agent capability-focused.",
    );
  }

  if (classification === "feature") {
    checklist.push(
      "Feature changes should include focused unit or integration tests.",
    );
  }

  return {
    classification,
    scopeVerdict: scope,
    codeQuality: issues.length ? `issues found: ${issues.join(" ")}` : "pass",
    security: issues.length ? "concerns: review issues above" : "clear",
    tests:
      missingTests.length > 0
        ? `missing: ${missingTests.join(" ")}`
        : "adequate",
    decision,
    checklist: issues.length ? checklist : [],
    details: issues,
    changedFiles: changed.files,
    exitCode: decision === "APPROVE" ? 0 : 1,
  };
}

function printResult(result) {
  console.log("## Pre-Review Results");
  console.log(`1. **Classification:** ${result.classification}`);
  console.log(`2. **Scope verdict:** ${result.scopeVerdict}`);
  console.log(`3. **Code quality:** ${result.codeQuality}`);
  console.log(`4. **Security:** ${result.security}`);
  console.log(`5. **Tests:** ${result.tests}`);
  console.log(`6. **Decision:** ${result.decision}`);

  if (result.checklist.length > 0 || result.details.length > 0) {
    console.log("");
    console.log("### Required changes (if any):");
    const lines = [...new Set([...result.checklist, ...result.details])];
    for (const item of lines) {
      console.log(`- [ ] ${item}`);
    }
  }
}

function isMainModule() {
  if (!process.argv[1]) return false;
  return path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
}

if (isMainModule()) {
  const result = runChecks();
  printResult(result);
  process.exit(result.exitCode);
}
