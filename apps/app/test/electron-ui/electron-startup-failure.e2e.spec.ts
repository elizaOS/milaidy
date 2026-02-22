import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { __electronTestState } from "electron";
import { afterEach, describe, expect, it } from "vitest";

import { AgentManager } from "../../electron/src/native/agent";

interface StartupTestState {
  started: boolean;
  starts: number;
  closes: number;
  elizaCalls: number;
}

declare global {
  var __miladyAgentStartupTestState: StartupTestState | undefined;
}

function writeTestDist(appPath: string): void {
  const distDir = path.join(appPath, "milady-dist");
  writeFileSync(
    path.join(distDir, "server.js"),
    `export async function startApiServer() {
  const state = (globalThis.__miladyAgentStartupTestState ??= {
    started: false,
    starts: 0,
    closes: 0,
    elizaCalls: 0,
  });
  if (state.started) {
    const err = new Error("Port already in use");
    err.code = "EADDRINUSE";
    throw err;
  }
  state.started = true;
  state.starts += 1;
  return {
    port: 42138,
    close: async () => {
      state.started = false;
      state.closes += 1;
    },
    updateRuntime: () => {},
    updateStartup: () => {},
  };
}
`,
    { encoding: "utf8" },
  );
  writeFileSync(
    path.join(distDir, "eliza.js"),
    `export async function startEliza() {
  const state = (globalThis.__miladyAgentStartupTestState ??= {
    started: false,
    starts: 0,
    closes: 0,
    elizaCalls: 0,
  });
  state.elizaCalls += 1;
  if (state.elizaCalls === 1) {
    throw new Error("runtime bootstrap failed");
  }
  return {
    character: { name: "Milady" },
    stop: async () => {},
  };
}
`,
    { encoding: "utf8" },
  );
}

describe("electron agent startup failure cleanup", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
    globalThis.__miladyAgentStartupTestState = undefined;
    __electronTestState.appPath = "";
    __electronTestState.isPackaged = true;
  });

  it("closes API listener after failed start so next start does not hit EADDRINUSE", async () => {
    const appPath = mkdtempSync(path.join(os.tmpdir(), "milady-agent-start-"));
    tempDirs.push(appPath);
    const distDir = path.join(appPath, "milady-dist");
    rmSync(distDir, { recursive: true, force: true });
    mkdirSync(distDir, { recursive: true });
    writeTestDist(appPath);
    __electronTestState.appPath = appPath;
    __electronTestState.isPackaged = true;

    const manager = new AgentManager();

    const first = await manager.start();
    expect(first.state).toBe("error");
    expect(globalThis.__miladyAgentStartupTestState?.closes).toBe(1);

    const second = await manager.start();
    expect(second.state).toBe("running");
    expect(globalThis.__miladyAgentStartupTestState?.starts).toBe(2);

    await manager.stop();
    expect(globalThis.__miladyAgentStartupTestState?.closes).toBeGreaterThan(1);
  });
});
