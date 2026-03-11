import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  discoverInstalledPlugins,
  discoverPluginsFromManifest,
} from "./server";

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (!dir) continue;
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("plugin metadata discovery", () => {
  it("returns retake as a streaming plugin with setup metadata from the bundled manifest", () => {
    const plugins = discoverPluginsFromManifest();
    const retake = plugins.find((plugin) => plugin.id === "retake");

    expect(retake).toBeDefined();
    expect(retake?.category).toBe("streaming");
    expect(retake?.setupGuideUrl).toBe(
      "https://docs.milady.ai/plugin-setup-guide#retaketv",
    );
    expect(retake?.repository).toContain("packages/plugin-retake");
  });

  it("enriches installed plugins with homepage, repository, and setup links", () => {
    const installPath = makeTempDir("plugin-retake-");
    writeFileSync(
      path.join(installPath, "package.json"),
      JSON.stringify(
        {
          name: "@elizaos/plugin-retake",
          description: "Retake.tv streaming plugin",
          homepage: "https://retake.tv",
          repository: {
            type: "git",
            url: "git+https://github.com/milady-ai/milady.git",
          },
          agentConfig: {
            pluginParameters: {
              RETAKE_AGENT_TOKEN: {
                type: "string",
                description: "Token",
                required: true,
              },
            },
          },
        },
        null,
        2,
      ),
      "utf8",
    );

    const plugins = discoverInstalledPlugins(
      {
        plugins: {
          installs: {
            "@elizaos/plugin-retake": {
              installPath,
              version: "0.1.0",
            },
          },
        },
      } as never,
      new Set<string>(),
    );

    expect(plugins).toHaveLength(1);
    expect(plugins[0]?.category).toBe("streaming");
    expect(plugins[0]?.homepage).toBe("https://retake.tv");
    expect(plugins[0]?.repository).toBe("https://github.com/milady-ai/milady");
    expect(plugins[0]?.setupGuideUrl).toBe(
      "https://docs.milady.ai/plugin-setup-guide#retaketv",
    );
    expect(plugins[0]?.parameters[0]?.key).toBe("RETAKE_AGENT_TOKEN");
  });
});
