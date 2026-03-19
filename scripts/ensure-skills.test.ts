import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  ensureShippedSkills,
  resolveSkillsDir,
  SHIPPED_SKILLS_DIR,
} from "./ensure-skills.mjs";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

describe("resolveSkillsDir", () => {
  it("uses the state dir env var when provided", () => {
    const stateDir = makeTempDir("skill-state-");
    // Accept both branded (MILADY_STATE_DIR) and upstream (ELIZA_STATE_DIR)
    const envKeys = ["MILADY_STATE_DIR", "ELIZA_STATE_DIR"];
    const matched = envKeys.some(
      (key) =>
        resolveSkillsDir({ [key]: stateDir }) === path.join(stateDir, "skills"),
    );
    expect(matched).toBe(true);
  });
});

describe("ensureShippedSkills", () => {
  it("seeds the shipped managed skills into the target skills dir", () => {
    const stateDir = makeTempDir("milady-skill-seed-");
    const skillsDir = path.join(stateDir, "skills");

    const created = ensureShippedSkills({
      skillsDir,
      assetsDir: SHIPPED_SKILLS_DIR,
    });

    expect(created).toEqual(["bags", "milady-development", "moltbook"]);
    for (const skillId of created) {
      expect(existsSync(path.join(skillsDir, skillId, "SKILL.md"))).toBe(true);
    }
  });

  it("does not overwrite an existing managed skill", () => {
    const stateDir = makeTempDir("milady-skill-existing-");
    const skillsDir = path.join(stateDir, "skills");
    const existingSkillPath = path.join(skillsDir, "bags", "SKILL.md");
    const customContent = "---\nname: bags\ndescription: custom\n---\n";

    mkdirSync(path.dirname(existingSkillPath), { recursive: true });
    writeFileSync(existingSkillPath, customContent, "utf8");

    const created = ensureShippedSkills({
      skillsDir,
      assetsDir: SHIPPED_SKILLS_DIR,
    });

    expect(created).toEqual(["milady-development", "moltbook"]);
    expect(readFileSync(existingSkillPath, "utf8")).toBe(customContent);
  });
});
