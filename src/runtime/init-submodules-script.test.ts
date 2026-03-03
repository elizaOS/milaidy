import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  parseTrackedSubmodules,
  runInitSubmodules,
} from "../../scripts/init-submodules.mjs";

const ROOT = "/tmp/milady-test-root";
const GIT_DIR = resolve(ROOT, ".git");
const GITMODULES = resolve(ROOT, ".gitmodules");

function createExistsStub() {
  return (filePath: string) => filePath === GIT_DIR || filePath === GITMODULES;
}

describe("init-submodules script", () => {
  it("discovers tracked submodules from .gitmodules git-config output", () => {
    const exec = vi.fn((command: string) => {
      if (
        command ===
        'git config --file .gitmodules --get-regexp "^submodule\\..*\\.path$"'
      ) {
        return [
          "submodule.test/contracts/lib/openzeppelin-contracts.path test/contracts/lib/openzeppelin-contracts",
          "submodule.extra.path extra",
        ].join("\n");
      }
      if (
        command ===
        'git submodule status -- "test/contracts/lib/openzeppelin-contracts"'
      ) {
        return "-dc44c9f test/contracts/lib/openzeppelin-contracts";
      }
      if (command === 'git submodule status -- "extra"') {
        return " dc44c9f extra";
      }
      if (
        command ===
        'git submodule update --init --recursive "test/contracts/lib/openzeppelin-contracts"'
      ) {
        return "";
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = runInitSubmodules({
      rootDir: ROOT,
      exists: createExistsStub(),
      exec,
      log: () => {},
      logError: () => {},
    });

    expect(result.submodules).toEqual([
      {
        name: "test/contracts/lib/openzeppelin-contracts",
        path: "test/contracts/lib/openzeppelin-contracts",
      },
      {
        name: "extra",
        path: "extra",
      },
    ]);
    expect(result.initialized).toBe(1);
    expect(result.alreadyInitialized).toBe(1);
    expect(result.failed).toBe(0);
  });

  it("emits an explicit failure summary when initialization fails", () => {
    const errorLogs: string[] = [];
    const exec = vi.fn((command: string) => {
      if (
        command ===
        'git config --file .gitmodules --get-regexp "^submodule\\..*\\.path$"'
      ) {
        return "submodule.bad.path bad";
      }
      if (command === 'git submodule status -- "bad"') {
        return "-deadbeef bad";
      }
      if (command === 'git submodule update --init --recursive "bad"') {
        throw new Error("simulated update failure");
      }
      throw new Error(`Unexpected command: ${command}`);
    });

    const result = runInitSubmodules({
      rootDir: ROOT,
      exists: createExistsStub(),
      exec,
      log: () => {},
      logError: (message: string) => errorLogs.push(message),
    });

    expect(result.failed).toBe(1);
    expect(
      errorLogs.some((message) =>
        message.includes(
          "Failed to initialize bad (bad): simulated update failure",
        ),
      ),
    ).toBe(true);
    expect(
      errorLogs.some((message) =>
        message.includes("Initialized 0, already ready 0, failed 1."),
      ),
    ).toBe(true);
  });

  it("parses empty .gitmodules output as no tracked submodules", () => {
    expect(parseTrackedSubmodules("")).toEqual([]);
    expect(parseTrackedSubmodules("   \n")).toEqual([]);
  });
});
