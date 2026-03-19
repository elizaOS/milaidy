import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(import.meta.dirname, "..");

function readDoc(relativePath: string) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("docs command regressions", () => {
  it("keeps beginner user guidance aligned with supported CLI commands", () => {
    const beginnerGuide = readDoc("docs/guides/beginners-user-guide.md");

    expect(beginnerGuide).toContain("milady start");
    expect(beginnerGuide).not.toContain("milady start --headless");
    expect(beginnerGuide).not.toContain("milady doctor");
    expect(beginnerGuide).toContain("milady plugins install <name>");
    expect(beginnerGuide).toContain("milady plugins uninstall <name>");
    expect(beginnerGuide).not.toContain("milady plugins add <name>");
    expect(beginnerGuide).not.toContain("milady plugins remove <name>");
  });

  it("does not present unsupported first-run commands in quickstart docs", () => {
    const quickstart = readDoc("docs/quickstart.mdx");

    expect(quickstart).not.toContain("milady start --headless");
    expect(quickstart).not.toContain("milady doctor");
  });

  it("documents the published npm package name as miladyai", () => {
    const installation = readDoc("docs/installation.mdx");
    const configuration = readDoc("docs/configuration.mdx");
    const architecture = readDoc("docs/architecture.mdx");
    const cliOverview = readDoc("docs/cli/overview.md");

    expect(installation).toContain("npm install -g miladyai");

    expect(configuration).toContain("npm package name is `miladyai`");

    expect(architecture).toContain("the `miladyai` npm package");

    expect(cliOverview).toContain("bun install -g miladyai");
    expect(cliOverview).toContain("bunx miladyai");
  });
});
