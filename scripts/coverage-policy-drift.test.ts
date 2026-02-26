import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * MW-01: Coverage policy drift detection.
 *
 * Ensures the canonical coverage thresholds declared in vitest.config.ts
 * stay in sync with every documentation file that references them.
 * If you update a threshold, update ALL locations listed below.
 */

const ROOT = path.resolve(import.meta.dirname, "..");

/** Canonical thresholds — single source of truth lives in vitest.config.ts. */
const EXPECTED = { lines: 25, functions: 25, statements: 25, branches: 15 };

/** Compact notation used in most docs: "25% lines/functions/statements, 15% branches" */
const COMPACT_RE = /(\d+)%\s*lines\/functions\/statements.*?(\d+)%\s*branches/;

/** Prose notation: "25% for lines, functions, and statements, and 15% for branches" */
const PROSE_RE =
  /(\d+)%.*?\blines\b.*?\bfunctions\b.*?\bstatements\b.*?(\d+)%.*?\bbranches\b/;

function extractFromDoc(content: string): { lfs: number; br: number } | null {
  const compact = content.match(COMPACT_RE);
  if (compact) return { lfs: Number(compact[1]), br: Number(compact[2]) };
  const prose = content.match(PROSE_RE);
  if (prose) return { lfs: Number(prose[1]), br: Number(prose[2]) };
  return null;
}

const DOCS_THAT_REFERENCE_THRESHOLDS = [
  "CONTRIBUTING.md",
  "AGENTS.md",
  "docs/guides/contribution-guide.md",
  "docs/guides/contributing.md",
  ".github/workflows/agent-review.yml",
];

describe("MW-01 — coverage policy drift detection", () => {
  it("vitest.config.ts thresholds match canonical values", async () => {
    const configSrc = fs.readFileSync(
      path.join(ROOT, "vitest.config.ts"),
      "utf8",
    );

    const linesMatch = configSrc.match(/lines:\s*(\d+)/);
    const funcsMatch = configSrc.match(/functions:\s*(\d+)/);
    const stmtsMatch = configSrc.match(/statements:\s*(\d+)/);
    const branchMatch = configSrc.match(/branches:\s*(\d+)/);

    expect(linesMatch).not.toBeNull();
    expect(Number(linesMatch?.[1])).toBe(EXPECTED.lines);
    expect(Number(funcsMatch?.[1])).toBe(EXPECTED.functions);
    expect(Number(stmtsMatch?.[1])).toBe(EXPECTED.statements);
    expect(Number(branchMatch?.[1])).toBe(EXPECTED.branches);
  });

  for (const relPath of DOCS_THAT_REFERENCE_THRESHOLDS) {
    it(`${relPath} matches canonical thresholds`, () => {
      const absPath = path.join(ROOT, relPath);
      expect(fs.existsSync(absPath), `${relPath} must exist`).toBe(true);

      const content = fs.readFileSync(absPath, "utf8");
      const extracted = extractFromDoc(content);
      expect(
        extracted,
        `${relPath} must reference coverage thresholds`,
      ).not.toBeNull();
      expect(extracted?.lfs).toBe(EXPECTED.lines);
      expect(extracted?.br).toBe(EXPECTED.branches);
    });
  }

  it("CI workflow runs bun run test:coverage", () => {
    const workflow = fs.readFileSync(
      path.join(ROOT, ".github/workflows/test.yml"),
      "utf8",
    );
    expect(workflow).toContain("bun run test:coverage");
  });
});
