/**
 * Skills Marketplace Service — Unit Tests
 *
 * Tests for:
 * - searchSkillsMarketplace (request construction, response normalization, error handling)
 * - installMarketplaceSkill (pre-network validation + deterministic git/sparse-checkout flow + security scan outcomes)
 * - listInstalledMarketplaceSkills (record loading, sorting, corrupt-file resilience)
 * - uninstallMarketplaceSkill (record lookup, path-containment safety, cleanup)
 */

import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  type InstalledMarketplaceSkill,
  installMarketplaceSkill,
  listInstalledMarketplaceSkills,
  searchSkillsMarketplace,
  uninstallMarketplaceSkill,
} from "./skill-marketplace.js";

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

// ---------------------------------------------------------------------------
// mocks
// ---------------------------------------------------------------------------

vi.mock("@elizaos/core", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type CloneTask = (
  cloneDir: string,
  checkoutPath: string,
) => Promise<void> | void;

const cloneTasks: CloneTask[] = [];

function setCloneTasks(tasks: CloneTask[]): void {
  cloneTasks.splice(0, cloneTasks.length, ...tasks);
}

async function populateCloneCheckout(
  cloneDir: string,
  checkoutPath: string,
  options: { includeSkillMd?: boolean; includeBinary?: boolean } = {},
): Promise<void> {
  const targetDir =
    checkoutPath === "." ? cloneDir : path.join(cloneDir, checkoutPath);
  await fs.mkdir(targetDir, { recursive: true });
  if (options.includeSkillMd ?? true) {
    await fs.writeFile(path.join(targetDir, "SKILL.md"), "# skill");
  }
  if (options.includeBinary) {
    await fs.writeFile(path.join(targetDir, "payload.exe"), "binary");
  }
}

function nextCloneTask(): CloneTask {
  return (
    cloneTasks.shift() ??
    ((cloneDir, checkoutPath) => populateCloneCheckout(cloneDir, checkoutPath))
  );
}

/** Build a minimal fetch Response stub. */
function fakeResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    text: () =>
      Promise.resolve(typeof body === "string" ? body : JSON.stringify(body)),
  };
}

/** Path to the install-records JSON inside a workspace. */
function recordsPath(workspaceDir: string): string {
  return path.join(
    workspaceDir,
    "skills",
    ".cache",
    "marketplace-installs.json",
  );
}

/** Marketplace skill installation root inside a workspace. */
function installRoot(workspaceDir: string): string {
  return path.join(workspaceDir, "skills", ".marketplace");
}

/** Write an install-records file, creating parent dirs as needed. */
async function writeRecords(
  workspaceDir: string,
  records: Record<string, InstalledMarketplaceSkill>,
): Promise<void> {
  const p = recordsPath(workspaceDir);
  await fs.mkdir(path.dirname(p), { recursive: true });
  await fs.writeFile(p, JSON.stringify(records, null, 2));
}

/** Build a minimal InstalledMarketplaceSkill record for testing. */
function makeRecord(
  id: string,
  overrides: Partial<InstalledMarketplaceSkill> = {},
): InstalledMarketplaceSkill {
  return {
    id,
    name: overrides.name ?? id,
    description: overrides.description ?? "",
    repository: overrides.repository ?? `owner/${id}`,
    githubUrl: overrides.githubUrl ?? `https://github.com/owner/${id}`,
    path: overrides.path ?? ".",
    installPath: overrides.installPath ?? `/placeholder/${id}`,
    installedAt: overrides.installedAt ?? new Date().toISOString(),
    source: overrides.source ?? "skillsmp",
  };
}

// ---------------------------------------------------------------------------
// env + temp dir lifecycle
// ---------------------------------------------------------------------------

let tmpDir: string;
const savedApiKey = process.env.SKILLSMP_API_KEY;
const savedStateDir = process.env.MILAIDY_STATE_DIR;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "skill-mp-test-"));
  delete process.env.SKILLSMP_API_KEY;
  process.env.MILAIDY_STATE_DIR = tmpDir;
  cloneTasks.length = 0;
  execFileMock.mockReset();
  execFileMock.mockImplementation(
    (_cmd: string, args: string[], _options: unknown, callback?: unknown) => {
      const done =
        typeof callback === "function"
          ? callback
          : args[args.length - 1] && typeof args[args.length - 1] === "function"
            ? (args[args.length - 1] as () => void)
            : null;

      void (async () => {
        if (_cmd !== "git") {
          if (done) done(null, "", "");
          return;
        }

        if (args[0] === "clone") {
          const cloneDir = args[args.length - 1];
          await fs.mkdir(cloneDir, { recursive: true });
          if (done) done(null, "", "");
          return;
        }

        if (args[0] === "-C" && args[2] === "sparse-checkout") {
          const cloneDir = args[1];
          const checkoutPath = args[4];
          const task = nextCloneTask();
          await task(cloneDir, checkoutPath);
          if (done) done(null, "", "");
          return;
        }

        if (done) done(null, "", "");
      })().catch((err) => {
        if (done) done(err, "", "");
      });
    },
  );
});

afterEach(async () => {
  vi.unstubAllGlobals();
  if (savedApiKey === undefined) delete process.env.SKILLSMP_API_KEY;
  else process.env.SKILLSMP_API_KEY = savedApiKey;
  if (savedStateDir === undefined) delete process.env.MILAIDY_STATE_DIR;
  else process.env.MILAIDY_STATE_DIR = savedStateDir;
  await fs.rm(tmpDir, { recursive: true, force: true });
});

// ============================================================================
//  1. searchSkillsMarketplace
// ============================================================================

describe("searchSkillsMarketplace", () => {
  it("throws when SKILLSMP_API_KEY is not set", async () => {
    delete process.env.SKILLSMP_API_KEY;

    await expect(searchSkillsMarketplace("test")).rejects.toThrow(
      "SKILLSMP_API_KEY",
    );
  });

  it("sends Bearer token in Authorization header", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test-key";
    const mockFetch = vi.fn().mockResolvedValue(fakeResponse({ results: [] }));
    vi.stubGlobal("fetch", mockFetch);

    await searchSkillsMarketplace("test query");

    expect(mockFetch).toHaveBeenCalledOnce();
    const reqInit = mockFetch.mock.calls[0][1];
    expect(reqInit.headers.Authorization).toBe("Bearer sk-test-key");
  });

  it("passes an AbortSignal timeout to fetch for request cancellation", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    const mockFetch = vi.fn().mockResolvedValue(fakeResponse({ results: [] }));
    vi.stubGlobal("fetch", mockFetch);

    await searchSkillsMarketplace("test");

    const reqInit = mockFetch.mock.calls[0][1];
    expect(reqInit.signal).toBeInstanceOf(AbortSignal);
  });

  it("uses /search endpoint for keyword search", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    const mockFetch = vi.fn().mockResolvedValue(fakeResponse({ results: [] }));
    vi.stubGlobal("fetch", mockFetch);

    await searchSkillsMarketplace("my query", { aiSearch: false });

    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("/api/v1/skills/search");
    expect(url).not.toContain("/ai-search");
  });

  it("uses /ai-search endpoint when aiSearch is true", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    const mockFetch = vi.fn().mockResolvedValue(fakeResponse({ results: [] }));
    vi.stubGlobal("fetch", mockFetch);

    await searchSkillsMarketplace("my query", { aiSearch: true });

    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("/api/v1/skills/ai-search");
  });

  it("includes query and limit as URL search params", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    const mockFetch = vi.fn().mockResolvedValue(fakeResponse({ results: [] }));
    vi.stubGlobal("fetch", mockFetch);

    await searchSkillsMarketplace("content marketer", { limit: 5 });

    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("q=content+marketer");
    expect(url).toContain("limit=5");
  });

  it("clamps limit to [1, 50] range", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    const mockFetch = vi.fn().mockResolvedValue(fakeResponse({ results: [] }));
    vi.stubGlobal("fetch", mockFetch);

    await searchSkillsMarketplace("test", { limit: 999 });

    const url = String(mockFetch.mock.calls[0][0]);
    expect(url).toContain("limit=50");
  });

  it("normalizes results from 'results' response shape", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          results: [
            { repository: "owner/skill-one", name: "Skill One" },
            { repository: "owner/skill-two", name: "Skill Two" },
          ],
        }),
      ),
    );

    const items = await searchSkillsMarketplace("test");

    expect(items).toHaveLength(2);
    expect(items[0].source).toBe("skillsmp");
    expect(items[0].repository).toBe("owner/skill-one");
    expect(items[0].githubUrl).toBe("https://github.com/owner/skill-one");
    expect(items[1].repository).toBe("owner/skill-two");
  });

  it("normalizes results from 'skills' response shape", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          skills: [{ repo: "owner/skill-a", name: "Skill A" }],
        }),
      ),
    );

    const items = await searchSkillsMarketplace("test");

    expect(items).toHaveLength(1);
    expect(items[0].repository).toBe("owner/skill-a");
  });

  it("normalizes results from 'data' response shape", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          data: [{ github: "owner/skill-d", name: "Skill D" }],
        }),
      ),
    );

    const items = await searchSkillsMarketplace("test");

    expect(items).toHaveLength(1);
    expect(items[0].repository).toBe("owner/skill-d");
  });

  it("normalizes results from nested 'data.results' shape", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          data: {
            results: [{ repository: "owner/nested", name: "Nested Skill" }],
          },
        }),
      ),
    );

    const items = await searchSkillsMarketplace("test");

    expect(items).toHaveLength(1);
    expect(items[0].repository).toBe("owner/nested");
  });

  it("infers repository from githubUrl field", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          results: [
            {
              githubUrl: "https://github.com/owner/from-url",
              name: "URL Skill",
            },
          ],
        }),
      ),
    );

    const items = await searchSkillsMarketplace("test");

    expect(items).toHaveLength(1);
    expect(items[0].repository).toBe("owner/from-url");
  });

  it("skips entries without a valid repository", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          results: [
            { name: "No Repo Skill", description: "Missing repo field" },
            { repository: "owner/valid", name: "Valid" },
          ],
        }),
      ),
    );

    const items = await searchSkillsMarketplace("test");

    expect(items).toHaveLength(1);
    expect(items[0].repository).toBe("owner/valid");
  });

  it("preserves numeric score when present", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          results: [
            { repository: "owner/scored", name: "Scored", score: 0.95 },
          ],
        }),
      ),
    );

    const items = await searchSkillsMarketplace("test");

    expect(items).toHaveLength(1);
    expect(items[0].score).toBe(0.95);
  });

  it("sets score to null for non-numeric score values", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          results: [
            { repository: "owner/no-score", name: "NoScore", score: "high" },
          ],
        }),
      ),
    );

    const items = await searchSkillsMarketplace("test");

    expect(items).toHaveLength(1);
    expect(items[0].score).toBeNull();
  });

  it("normalizes tags from the response", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          results: [
            {
              repository: "owner/tagged",
              name: "Tagged",
              tags: ["AI", " marketing ", "", "content"],
            },
          ],
        }),
      ),
    );

    const items = await searchSkillsMarketplace("test");

    expect(items).toHaveLength(1);
    expect(items[0].tags).toEqual(["AI", "marketing", "content"]);
  });

  it("rejects path with embedded .. traversal segments", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          results: [
            {
              repository: "owner/safe",
              name: "Safe Skill",
              path: "skills/../../../etc/passwd",
            },
          ],
        }),
      ),
    );

    const items = await searchSkillsMarketplace("test");

    expect(items).toHaveLength(1);
    expect(items[0].path).toBeNull();
  });

  it("accepts valid nested path without traversal", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        fakeResponse({
          results: [
            {
              repository: "owner/valid",
              name: "Valid Skill",
              path: "skills/content-marketer",
            },
          ],
        }),
      ),
    );

    const items = await searchSkillsMarketplace("test");

    expect(items).toHaveLength(1);
    expect(items[0].path).toBe("skills/content-marketer");
  });

  it("returns empty array for non-JSON response body", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error("invalid json")),
        text: () => Promise.resolve("not json"),
      }),
    );

    const items = await searchSkillsMarketplace("test");

    expect(items).toHaveLength(0);
  });

  it("throws on HTTP error with server message", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          fakeResponse(
            { error: { message: "Rate limit exceeded" } },
            false,
            429,
          ),
        ),
    );

    await expect(searchSkillsMarketplace("test")).rejects.toThrow(
      "Rate limit exceeded",
    );
  });

  it("throws generic status message on HTTP error without details", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(fakeResponse({}, false, 500)),
    );

    await expect(searchSkillsMarketplace("test")).rejects.toThrow("500");
  });

  it("throws on network failure before receiving a response", async () => {
    process.env.SKILLSMP_API_KEY = "sk-test";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("ECONNREFUSED")),
    );

    await expect(searchSkillsMarketplace("test")).rejects.toThrow(
      "ECONNREFUSED",
    );
  });
});

// ============================================================================
//  2. installMarketplaceSkill — pre-network validation
// ============================================================================

describe("installMarketplaceSkill", () => {
  it("installs and records a clean skill discovered from repository root", async () => {
    setCloneTasks([
      (cloneDir, checkoutPath) => populateCloneCheckout(cloneDir, checkoutPath),
      (cloneDir, checkoutPath) => populateCloneCheckout(cloneDir, checkoutPath),
    ]);

    const installed = await installMarketplaceSkill(tmpDir, {
      repository: "owner/repo",
      name: "auto-skill",
    });

    expect(installed).toMatchObject({
      id: "auto-skill",
      name: "auto-skill",
      repository: "owner/repo",
      path: ".",
      source: "manual",
      scanStatus: "clean",
    });

    const records = await listInstalledMarketplaceSkills(tmpDir);
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({ id: "auto-skill" });
    expect(records[0].scanStatus).toBe("clean");
  });

  it("supports GitHub tree URLs and infers the skill path from the tree segment", async () => {
    setCloneTasks([
      (cloneDir, checkoutPath) => populateCloneCheckout(cloneDir, checkoutPath),
    ]);

    const installed = await installMarketplaceSkill(tmpDir, {
      githubUrl: "https://github.com/owner/repo/tree/main/skills/cli-runner",
    });

    expect(installed).toMatchObject({
      id: "cli-runner",
      repository: "owner/repo",
      path: "skills/cli-runner",
      scanStatus: "clean",
    });
  });

  it("throws when installed payload lacks SKILL.md and removes partial install", async () => {
    setCloneTasks([
      (cloneDir, checkoutPath) =>
        populateCloneCheckout(cloneDir, checkoutPath, {
          includeSkillMd: false,
        }),
    ]);

    await expect(
      installMarketplaceSkill(tmpDir, {
        repository: "owner/repo",
        path: ".",
        name: "missing-skill",
      }),
    ).rejects.toThrow("Installed path does not contain SKILL.md");

    const installedDir = path.join(installRoot(tmpDir), "missing-skill");
    const exists = await fs
      .stat(installedDir)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
    expect(await listInstalledMarketplaceSkills(tmpDir)).toEqual([]);
  });

  it("throws with blocked security scan and removes the installed directory", async () => {
    setCloneTasks([
      (cloneDir, checkoutPath) =>
        populateCloneCheckout(cloneDir, checkoutPath, {
          includeBinary: true,
        }),
    ]);

    await expect(
      installMarketplaceSkill(tmpDir, {
        repository: "owner/repo",
        path: ".",
        name: "blocked-skill",
      }),
    ).rejects.toThrow("blocked by security scan");

    const installedDir = path.join(installRoot(tmpDir), "blocked-skill");
    const exists = await fs
      .stat(installedDir)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);
    expect(await listInstalledMarketplaceSkills(tmpDir)).toEqual([]);
  });

  it("throws when neither repository nor GitHub URL is provided", async () => {
    await expect(installMarketplaceSkill(tmpDir, {})).rejects.toThrow(
      "Install requires a repository or GitHub URL",
    );
  });

  it("rejects git ref with invalid characters to prevent option injection", async () => {
    await expect(
      installMarketplaceSkill(tmpDir, {
        githubUrl:
          "https://github.com/owner/repo/tree/--upload-pack=evil/skills/test",
        name: "test-skill",
      }),
    ).rejects.toThrow("Invalid git ref");
  });

  it("rejects skill paths with traversal segments", async () => {
    await expect(
      installMarketplaceSkill(tmpDir, {
        repository: "owner/repo",
        path: "../secrets",
        name: "evil-skill",
      }),
    ).rejects.toThrow("Invalid skill path");
  });

  it("rejects absolute skill paths", async () => {
    await expect(
      installMarketplaceSkill(tmpDir, {
        repository: "owner/repo",
        path: "/etc",
        name: "evil-skill",
      }),
    ).rejects.toThrow("Invalid skill path");
  });

  it("rejects GitHub URLs with traversal paths", async () => {
    await expect(
      installMarketplaceSkill(tmpDir, {
        githubUrl: "https://github.com/owner/repo/tree/main/../secrets",
        name: "evil-skill",
      }),
    ).rejects.toThrow("Invalid skill path");
  });

  it("throws when skill is already installed at the target path", async () => {
    // Pre-create the target directory to trigger the existence check.
    // Providing input.path skips the git-based resolveSkillPathInRepo probe.
    const skillDir = path.join(installRoot(tmpDir), "test-skill");
    await fs.mkdir(skillDir, { recursive: true });

    await expect(
      installMarketplaceSkill(tmpDir, {
        repository: "owner/repo",
        path: ".",
        name: "test-skill",
      }),
    ).rejects.toThrow("already installed");
  });
});

// ============================================================================
//  3. listInstalledMarketplaceSkills
// ============================================================================

describe("listInstalledMarketplaceSkills", () => {
  it("returns empty array when no records file exists", async () => {
    const result = await listInstalledMarketplaceSkills(tmpDir);

    expect(result).toEqual([]);
  });

  it("returns skills sorted by installedAt descending", async () => {
    const records = {
      "skill-old": makeRecord("skill-old", {
        installedAt: "2026-01-01T00:00:00.000Z",
      }),
      "skill-new": makeRecord("skill-new", {
        installedAt: "2026-02-01T00:00:00.000Z",
      }),
      "skill-mid": makeRecord("skill-mid", {
        installedAt: "2026-01-15T00:00:00.000Z",
      }),
    };
    await writeRecords(tmpDir, records);

    const result = await listInstalledMarketplaceSkills(tmpDir);

    expect(result).toHaveLength(3);
    expect(result[0].id).toBe("skill-new");
    expect(result[1].id).toBe("skill-mid");
    expect(result[2].id).toBe("skill-old");
  });

  it("returns empty array for corrupt JSON in records file", async () => {
    const p = recordsPath(tmpDir);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, "not valid json {{{");

    const result = await listInstalledMarketplaceSkills(tmpDir);

    expect(result).toEqual([]);
  });

  it("returns empty array when records file contains an array instead of an object", async () => {
    const p = recordsPath(tmpDir);
    await fs.mkdir(path.dirname(p), { recursive: true });
    await fs.writeFile(p, JSON.stringify([1, 2, 3]));

    const result = await listInstalledMarketplaceSkills(tmpDir);

    expect(result).toEqual([]);
  });
});

// ============================================================================
//  4. uninstallMarketplaceSkill
// ============================================================================

describe("uninstallMarketplaceSkill", () => {
  it("throws when skill is not found in records", async () => {
    await writeRecords(tmpDir, {});

    await expect(
      uninstallMarketplaceSkill(tmpDir, "nonexistent"),
    ).rejects.toThrow("not found");
  });

  it("throws when install path escapes the marketplace root", async () => {
    const records = {
      "evil-skill": makeRecord("evil-skill", {
        installPath: "/tmp/somewhere-else/evil",
      }),
    };
    await writeRecords(tmpDir, records);

    await expect(
      uninstallMarketplaceSkill(tmpDir, "evil-skill"),
    ).rejects.toThrow("Refusing to remove");
  });

  it("throws when install path equals the marketplace root exactly", async () => {
    const root = installRoot(tmpDir);
    await fs.mkdir(root, { recursive: true });

    const records = {
      "root-skill": makeRecord("root-skill", {
        installPath: root,
      }),
    };
    await writeRecords(tmpDir, records);

    await expect(
      uninstallMarketplaceSkill(tmpDir, "root-skill"),
    ).rejects.toThrow("Refusing to remove");
  });

  it("removes skill directory and record on success", async () => {
    const root = installRoot(tmpDir);
    const skillDir = path.join(root, "good-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(path.join(skillDir, "SKILL.md"), "# Test");

    const records = {
      "good-skill": makeRecord("good-skill", {
        installPath: skillDir,
      }),
    };
    await writeRecords(tmpDir, records);

    const removed = await uninstallMarketplaceSkill(tmpDir, "good-skill");

    expect(removed.id).toBe("good-skill");

    // Directory should be gone
    const exists = await fs
      .stat(skillDir)
      .then(() => true)
      .catch(() => false);
    expect(exists).toBe(false);

    // Record should be removed
    const remaining = await listInstalledMarketplaceSkills(tmpDir);
    expect(remaining).toHaveLength(0);
  });

  it("returns the removed record with all fields intact", async () => {
    const root = installRoot(tmpDir);
    const skillDir = path.join(root, "my-skill");
    await fs.mkdir(skillDir, { recursive: true });

    const original = makeRecord("my-skill", {
      name: "My Skill",
      description: "A great skill",
      repository: "author/my-skill",
      githubUrl: "https://github.com/author/my-skill",
      path: "skills/my-skill",
      installPath: skillDir,
      installedAt: "2026-02-08T12:00:00.000Z",
      source: "skillsmp",
    });
    await writeRecords(tmpDir, { "my-skill": original });

    const removed = await uninstallMarketplaceSkill(tmpDir, "my-skill");

    expect(removed.id).toBe("my-skill");
    expect(removed.name).toBe("My Skill");
    expect(removed.description).toBe("A great skill");
    expect(removed.repository).toBe("author/my-skill");
    expect(removed.source).toBe("skillsmp");
  });
});
