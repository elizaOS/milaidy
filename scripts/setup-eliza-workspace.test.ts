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
    // Accept both branded (MILADY_) and upstream (ELIZA_) env var names
    const skipEnvKey = ["MILADY_SKIP_LOCAL_ELIZA", "ELIZA_SKIP_LOCAL_ELIZA"];
    const results = skipEnvKey.map((key) =>
      getElizaWorkspaceSkipReason("/repo/milady", {
        env: { [key]: "1" },
        pathExists: () => true,
      }),
    );
    const matched = results.find((r) => r !== null);
    expect(matched).toBeDefined();
    expect(matched).toMatch(/(?:MILADY|ELIZA)_SKIP_LOCAL_ELIZA=1/);
  });

  it("skips in CI unless explicitly forced", () => {
    expect(
      getElizaWorkspaceSkipReason("/repo/milady", {
        env: { CI: "1" },
        pathExists: () => true,
      }),
    ).toBe("CI environment");

    // Accept both branded (MILADY_) and upstream (ELIZA_) force env var
    const forceKeys = ["MILADY_FORCE_LOCAL_ELIZA", "ELIZA_FORCE_LOCAL_ELIZA"];
    const forced = forceKeys.some(
      (key) =>
        getElizaWorkspaceSkipReason("/repo/milady", {
          env: { CI: "1", [key]: "1" },
          pathExists: () => true,
        }) === null,
    );
    expect(forced).toBe(true);
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
          candidate !== path.join(elizaRoot, "package.json"),
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
    const tempRoot = mkdtempSync(
      path.join(os.tmpdir(), "milady-setup-eliza-links-"),
    );

    try {
      const elizaRoot = path.join(tempRoot, "eliza");
      const miladyRoot = path.join(tempRoot, "milady");

      const packages = ["app-core", "autonomous", "ui"];
      for (const pkg of packages) {
        const targetDir = path.join(elizaRoot, "packages", pkg);
        mkdirSync(targetDir, { recursive: true });
        writeFileSync(
          path.join(targetDir, "package.json"),
          JSON.stringify({ name: `@elizaos/${pkg}` }),
          "utf8",
        );
      }

      const expectedLinks = getElizaPackageLinks(miladyRoot, elizaRoot).map(
        ({ linkPath, targetPath }) => ({
          linkPath,
          targetPath,
        }),
      );

      expect(expectedLinks).toEqual(
        expect.arrayContaining([
          {
            linkPath: path.join(miladyRoot, "node_modules/@elizaos/autonomous"),
            targetPath: path.join(elizaRoot, "packages/autonomous"),
          },
          {
            linkPath: path.join(miladyRoot, "node_modules/@elizaos/app-core"),
            targetPath: path.join(elizaRoot, "packages/app-core"),
          },
          {
            linkPath: path.join(
              miladyRoot,
              "apps/app/node_modules/@elizaos/app-core",
            ),
            targetPath: path.join(elizaRoot, "packages/app-core"),
          },
          {
            linkPath: path.join(
              miladyRoot,
              "apps/home/node_modules/@elizaos/app-core",
            ),
            targetPath: path.join(elizaRoot, "packages/app-core"),
          },
          {
            linkPath: path.join(miladyRoot, "node_modules/@elizaos/ui"),
            targetPath: path.join(elizaRoot, "packages/ui"),
          },
          {
            linkPath: path.join(
              miladyRoot,
              "apps/app/node_modules/@elizaos/ui",
            ),
            targetPath: path.join(elizaRoot, "packages/ui"),
          },
          {
            linkPath: path.join(
              miladyRoot,
              "apps/home/node_modules/@elizaos/ui",
            ),
            targetPath: path.join(elizaRoot, "packages/ui"),
          },
        ]),
      );
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
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
