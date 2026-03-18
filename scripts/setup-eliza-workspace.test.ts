import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  createPackageLink,
  getElizaPackageLinks,
  getElizaWorkspaceSkipReason,
  hasInstalledElizaDependencies,
  hasRequiredElizaWorkspaceFiles,
  isPackageLinkCurrent,
} from "./setup-eliza-workspace.mjs";

describe("getElizaWorkspaceSkipReason", () => {
  it("respects the local eliza skip env flag", () => {
    expect(
      getElizaWorkspaceSkipReason("/repo/milady", {
        env: { MILADY_SKIP_LOCAL_ELIZA: "1" },
        pathExists: () => true,
      }),
    ).toBe("MILADY_SKIP_LOCAL_ELIZA=1");
  });

  it("skips in CI unless explicitly forced", () => {
    expect(
      getElizaWorkspaceSkipReason("/repo/milady", {
        env: { CI: "1" },
        pathExists: () => true,
      }),
    ).toBe("CI environment");

    expect(
      getElizaWorkspaceSkipReason("/repo/milady", {
        env: { CI: "1", MILADY_FORCE_LOCAL_ELIZA: "1" },
        pathExists: () => true,
      }),
    ).toBeNull();
  });

  it("skips non-development installs", () => {
    expect(
      getElizaWorkspaceSkipReason("/repo/milady", {
        env: {},
        pathExists: (candidate) =>
          candidate !==
          path.join("/repo/milady", "apps", "app", "vite.config.ts"),
      }),
    ).toBe("non-development install");
  });
});

describe("hasRequiredElizaWorkspaceFiles", () => {
  it("requires the develop package layout", () => {
    const elizaRoot = "/repo/eliza";

    expect(
      hasRequiredElizaWorkspaceFiles(elizaRoot, {
        pathExists: (candidate) =>
          candidate !== path.join(elizaRoot, "packages", "ui", "package.json"),
      }),
    ).toBe(false);

    expect(
      hasRequiredElizaWorkspaceFiles(elizaRoot, {
        pathExists: () => true,
      }),
    ).toBe(true);
  });
});

describe("hasInstalledElizaDependencies", () => {
  it("detects a Bun-installed workspace from root install markers", () => {
    const elizaRoot = "/repo/eliza";

    expect(
      hasInstalledElizaDependencies(elizaRoot, {
        pathExists: (candidate) =>
          candidate !== path.join(elizaRoot, "node_modules", ".bin"),
      }),
    ).toBe(false);

    expect(
      hasInstalledElizaDependencies(elizaRoot, {
        pathExists: () => true,
      }),
    ).toBe(true);
  });
});

describe("getElizaPackageLinks", () => {
  it("links Milady package entries to the sibling eliza checkout", () => {
    expect(
      getElizaPackageLinks("/repo/milady", "/repo/eliza").map(
        ({ linkPath, targetPath }) => ({
          linkPath,
          targetPath,
        }),
      ),
    ).toEqual([
      {
        linkPath: "/repo/milady/node_modules/@elizaos/autonomous",
        targetPath: "/repo/eliza/packages/autonomous",
      },
      {
        linkPath: "/repo/milady/node_modules/@elizaos/app-core",
        targetPath: "/repo/eliza/packages/app-core",
      },
      {
        linkPath: "/repo/milady/apps/app/node_modules/@elizaos/app-core",
        targetPath: "/repo/eliza/packages/app-core",
      },
      {
        linkPath: "/repo/milady/apps/home/node_modules/@elizaos/app-core",
        targetPath: "/repo/eliza/packages/app-core",
      },
      {
        linkPath: "/repo/milady/node_modules/@elizaos/ui",
        targetPath: "/repo/eliza/packages/ui",
      },
      {
        linkPath: "/repo/milady/apps/app/node_modules/@elizaos/ui",
        targetPath: "/repo/eliza/packages/ui",
      },
      {
        linkPath: "/repo/milady/apps/home/node_modules/@elizaos/ui",
        targetPath: "/repo/eliza/packages/ui",
      },
    ]);
  });
});

describe("createPackageLink", () => {
  it("creates and updates local package symlinks", () => {
    const tempRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-setup-eliza-workspace-"),
    );

    try {
      const targetOne = path.join(tempRoot, "eliza", "packages", "app-core");
      const targetTwo = path.join(tempRoot, "eliza", "packages", "ui");
      const linkPath = path.join(
        tempRoot,
        "milady",
        "node_modules",
        "@elizaos",
        "app-core",
      );

      mkdirSync(targetOne, { recursive: true });
      mkdirSync(targetTwo, { recursive: true });
      writeFileSync(path.join(targetOne, "package.json"), "{}\n", "utf8");
      writeFileSync(path.join(targetTwo, "package.json"), "{}\n", "utf8");

      expect(createPackageLink(linkPath, targetOne)).toBe(true);
      expect(isPackageLinkCurrent(linkPath, targetOne)).toBe(true);
      expect(realpathSync(linkPath)).toBe(realpathSync(targetOne));

      expect(createPackageLink(linkPath, targetOne)).toBe(false);
      expect(createPackageLink(linkPath, targetTwo)).toBe(true);
      expect(isPackageLinkCurrent(linkPath, targetTwo)).toBe(true);
      expect(realpathSync(linkPath)).toBe(realpathSync(targetTwo));
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });
});
