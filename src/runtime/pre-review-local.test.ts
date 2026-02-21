import { execSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  classificationFromInputs,
  runChecks,
  scanDiffTextForBlockedPatterns,
  scopeVerdictFor,
} from "../../scripts/pre-review-local.mjs";

describe("pre-review-local helpers", () => {
  it("classifies branch/message context", () => {
    expect(
      classificationFromInputs({
        branch: "feature/new-theme",
        message: "ui redesign pass",
      }),
    ).toBe("aesthetic");

    expect(
      classificationFromInputs({
        branch: "hardening/auth-guard",
        message: "security leak fix",
      }),
    ).toBe("security");

    expect(
      classificationFromInputs({
        branch: "bugfix/runtime-crash",
        message: "fix regression in parser",
      }),
    ).toBe("bugfix");

    expect(
      classificationFromInputs({
        branch: "chore/ci-parity",
        message: "add helper script",
      }),
    ).toBe("feature");
  });

  it("maps classification to scope verdict", () => {
    expect(scopeVerdictFor("aesthetic")).toBe("out of scope");
    expect(scopeVerdictFor("feature")).toBe("needs deep review");
    expect(scopeVerdictFor("bugfix")).toBe("in scope");
    expect(scopeVerdictFor("security")).toBe("in scope");
  });

  it("flags TypeScript any usage without matching plain English text", () => {
    const plainEnglishDiff = `
+ // allow any reviewer to run this
+ const label = "any"
+ const notes = "at any time"
`;
    const plainIssues = scanDiffTextForBlockedPatterns(plainEnglishDiff);
    expect(plainIssues.some((issue) => issue.includes("`any` usage"))).toBe(
      false,
    );

    const typedAnyDiff = `
+ const payload: any = value
+ const normalized = value as any
+ const casted = <any>value
`;
    const typedIssues = scanDiffTextForBlockedPatterns(typedAnyDiff);
    expect(typedIssues.some((issue) => issue.includes("`any` usage"))).toBe(
      true,
    );
  });

  it("flags ts-ignore and secret-like assignments", () => {
    const diff = `
+ // @ts-ignore temporary
+ const api_key = "sk-1234567890abcdefghijklmnopqrst"
`;

    const issues = scanDiffTextForBlockedPatterns(diff);
    expect(issues.some((issue) => issue.includes("`@ts-ignore` usage"))).toBe(
      true,
    );
    expect(issues.some((issue) => issue.includes("secret-like string"))).toBe(
      true,
    );
  });

  it("approves when branch has no changed files compared to base", () => {
    const originalCwd = process.cwd();
    const repoDir = mkdtempSync(path.join(tmpdir(), "milady-prereview-"));

    try {
      execSync("git init -b main", { cwd: repoDir, stdio: "pipe" });
      execSync('git config user.email "test@example.com"', {
        cwd: repoDir,
        stdio: "pipe",
      });
      execSync('git config user.name "Test User"', {
        cwd: repoDir,
        stdio: "pipe",
      });
      writeFileSync(path.join(repoDir, "README.md"), "seed\n");
      execSync("git add README.md", { cwd: repoDir, stdio: "pipe" });
      execSync('git commit -m "seed"', { cwd: repoDir, stdio: "pipe" });
      execSync("git checkout -b feature/no-diff", {
        cwd: repoDir,
        stdio: "pipe",
      });

      process.chdir(repoDir);
      const result = runChecks();

      expect(result.decision).toBe("APPROVE");
      expect(result.classification).toBe("other");
      expect(result.changedFiles).toEqual([]);
      expect(result.tests).toContain("not applicable");
    } finally {
      process.chdir(originalCwd);
    }
  });
});
