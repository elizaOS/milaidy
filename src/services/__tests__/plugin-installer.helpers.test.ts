import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RegistryPluginInfo } from "../registry-client";

const execFileMock = vi.fn();

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

// `../plugin-installer` imports `@elizaos/core` for logging; mock it to keep these
// validator/helper tests hermetic and avoid pulling in the full core runtime.
vi.mock("@elizaos/core", () => ({
  logger: {
    warn: vi.fn(),
    info: vi.fn(),
    error: vi.fn(),
  },
}));

function setupExecFileHandler(
  responses: Array<{ stdout: string; branch?: string; list?: boolean }> = [],
) {
  let callIndex = 0;
  execFileMock.mockImplementation(
    (
      _file: string,
      args: string[] | readonly string[],
      _options: unknown,
      callback?: (err: Error | null, result?: { stdout?: string }) => void,
    ) => {
      const response = responses[callIndex++];

      const expected = response?.list ? "ls-remote --heads" : response?.branch;
      if (expected && Array.isArray(args)) {
        const joinArgs = args.join(" ");
        expect(joinArgs).toContain(expected);
      }

      if (response) {
        callback?.(null, { stdout: response.stdout });
        return;
      }

      callback?.(null, { stdout: "" });
    },
  );
}

beforeEach(() => {
  vi.resetModules();
  execFileMock.mockReset();
});

describe("plugin-installer input validators", () => {
  it("validates package names", async () => {
    const { assertValidPackageName, VALID_PACKAGE_NAME } = await import(
      "../plugin-installer"
    );

    expect(VALID_PACKAGE_NAME.test("@elizaos/plugin-test")).toBe(true);
    expect(assertValidPackageName("@elizaos/plugin-test")).toBeUndefined();
    expect(VALID_PACKAGE_NAME.test("plugin-test")).toBe(true);
    expect(assertValidPackageName("plugin-test")).toBeUndefined();
  });

  it("rejects invalid package names", async () => {
    const { assertValidPackageName } = await import("../plugin-installer");
    expect(() => assertValidPackageName("../../etc")).toThrow(
      /Invalid package name/,
    );
    expect(() => assertValidPackageName("bad name")).toThrow(
      /Invalid package name/,
    );
    expect(() => assertValidPackageName("")).toThrow(/Invalid package name/);
  });

  it("validates git URLs", async () => {
    const { assertValidGitUrl } = await import("../plugin-installer");
    expect(() =>
      assertValidGitUrl("https://github.com/elizaos-plugins/plugin-test.git"),
    ).not.toThrow();
    expect(() =>
      assertValidGitUrl("https://gitlab.com/elizaos-plugins/plugin-test.git"),
    ).not.toThrow();
  });

  it("rejects invalid git URLs", async () => {
    const { assertValidGitUrl } = await import("../plugin-installer");
    expect(() =>
      assertValidGitUrl("git@github.com:elizaos-plugins/plugin-test.git"),
    ).toThrow(/Invalid git URL/);
    expect(() => assertValidGitUrl("https://invalid-url")).toThrow(
      /Invalid git URL/,
    );
  });
});

describe("resolveGitBranch", () => {
  it("returns the first valid branch reported by git remote checks", async () => {
    setupExecFileHandler([
      { stdout: "abcd\trefs/heads/main\n" },
      { stdout: "1234\trefs/heads/main\n" }, // fallback call, should not execute
    ]);

    const { resolveGitBranch } = await import("../plugin-installer");

    const pluginInfo = {
      name: "@elizaos/plugin-test",
      gitRepo: "elizaos-plugins/plugin-test",
      gitUrl: "https://github.com/elizaos-plugins/plugin-test.git",
      git: {
        v0Branch: null,
        v1Branch: null,
        v2Branch: "main",
      },
      npm: { package: "@elizaos/plugin-test" },
      supports: { v0: false, v1: false, v2: true },
      description: "Test plugin",
      homepage: null,
      topics: [],
      stars: 0,
      language: "TypeScript",
    } as RegistryPluginInfo;

    const branch = await resolveGitBranch(pluginInfo);
    expect(branch).toBe("main");
    expect(execFileMock).toHaveBeenCalledTimes(1);
  });

  it("falls back to remote branch discovery when configured branches are unavailable", async () => {
    setupExecFileHandler([
      { stdout: "" }, // main
      { stdout: "" }, // next
      { stdout: "" }, // v1Branch check
      { stdout: "", list: true }, // git ls-remote --heads
    ]);

    const { resolveGitBranch } = await import("../plugin-installer");

    const pluginInfo = {
      name: "@elizaos/plugin-test",
      gitRepo: "elizaos-plugins/plugin-test",
      gitUrl: "https://github.com/elizaos-plugins/plugin-test.git",
      git: {
        v0Branch: null,
        v1Branch: null,
        v2Branch: "dev",
      },
      npm: { package: "@elizaos/plugin-test" },
      supports: { v0: false, v1: false, v2: true },
      description: "Test plugin",
      homepage: null,
      topics: [],
      stars: 0,
      language: "TypeScript",
    } as RegistryPluginInfo;

    const branch = await resolveGitBranch(pluginInfo);
    expect(branch).toBe("main");
    expect(execFileMock).toHaveBeenCalledTimes(5);
  });

  it("chooses a preferred branch from git ls-remote --heads output", async () => {
    setupExecFileHandler([
      { stdout: "" }, // main
      { stdout: "" }, // next
      { stdout: "" }, // v1Branch check
      { stdout: "" }, // master check
      {
        stdout: "1234\trefs/heads/release\n5678\trefs/heads/dev\n",
        list: true,
      },
    ]);

    const { resolveGitBranch } = await import("../plugin-installer");

    const pluginInfo = {
      name: "@elizaos/plugin-test",
      gitRepo: "elizaos-plugins/plugin-test",
      gitUrl: "https://github.com/elizaos-plugins/plugin-test.git",
      git: {
        v0Branch: null,
        v1Branch: null,
        v2Branch: "dev",
      },
      npm: { package: "@elizaos/plugin-test" },
      supports: { v0: false, v1: false, v2: true },
      description: "Test plugin",
      homepage: null,
      topics: [],
      stars: 0,
      language: "TypeScript",
    } as RegistryPluginInfo;

    const branch = await resolveGitBranch(pluginInfo);
    expect(branch).toBe("dev");
    expect(execFileMock).toHaveBeenCalledTimes(5);
  });
});
