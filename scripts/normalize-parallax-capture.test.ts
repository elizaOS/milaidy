import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

describe("normalize-parallax-capture", () => {
  it("runs through node tsx and writes a normalized replay artifact", () => {
    const tmpDir = mkdtempSync(
      path.join(os.tmpdir(), "milady-normalize-parallax-capture-"),
    );
    const inputPath = path.join(tmpDir, "capture.json");
    const outputPath = path.join(tmpDir, "capture.replay.json");

    writeFileSync(
      inputPath,
      JSON.stringify([
        {
          type: "decision",
          reasoning: "pick single agent",
        },
      ]),
      "utf8",
    );

    try {
      const result = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          path.join(__dirname, "normalize-parallax-capture.ts"),
          "--input",
          inputPath,
          "--output",
          outputPath,
        ],
        {
          cwd: path.join(__dirname, ".."),
          encoding: "utf8",
        },
      );

      if (result.status !== 0) {
        throw new Error(
          result.stderr || result.stdout || "normalize CLI failed",
        );
      }

      expect(result.stdout.trim()).toBe(outputPath);

      const normalized = JSON.parse(readFileSync(outputPath, "utf8")) as {
        schema_version: string;
        run: { mode: string };
        events: Array<{ actor: string; kind: string; message: string }>;
        outcome: { status: string };
      };

      expect(normalized).toMatchObject({
        schema_version: "1.0",
        run: { mode: "unknown" },
        outcome: { status: "unknown" },
      });
      expect(normalized.events).toHaveLength(1);
      expect(normalized.events[0]).toMatchObject({
        actor: "orchestrator",
        kind: "decision",
        message: "pick single agent",
      });
    } finally {
      rmSync(tmpDir, { force: true, recursive: true });
    }
  });
});
