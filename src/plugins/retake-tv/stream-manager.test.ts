/**
 * Unit tests for StreamManager safety and process wiring.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { execFileSync, spawn } from "node:child_process";
import { StreamManager } from "./stream-manager.js";

vi.mock("node:child_process", async () => {
  const actual = await vi.importActual("node:child_process");
  return {
    ...actual,
    spawn: vi.fn(),
    execFileSync: vi.fn(),
  };
});

const mockProcess = () => ({
  pid: 4_321,
  unref: vi.fn(),
  on: vi.fn(),
  kill: vi.fn(),
  stderr: {
    on: vi.fn(),
  },
});

describe("StreamManager", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(execFileSync).mockClear();
    vi.mocked(spawn).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("checks required dependencies via execFileSync in command-array form", () => {
    const manager = new StreamManager();
    vi.mocked(execFileSync).mockReturnValue("");

    manager.checkDependencies();

    const calls = vi.mocked(execFileSync).mock.calls.map((c) => c[0]);
    expect(calls).toContain("which");
    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith("which", ["Xvfb"], {
      stdio: "ignore",
    });
    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith("which", ["ffmpeg"], {
      stdio: "ignore",
    });
  });

  it("builds FFmpeg launch args safely when no PulseAudio is available", async () => {
    const manager = new StreamManager({ watchdogIntervalMs: 0 });
    const mockedSpawn = vi.mocked(spawn);
    const mockedExec = vi.mocked(execFileSync);
    vi.useFakeTimers();

    mockedExec.mockReturnValue("");
    mockedSpawn.mockReturnValue(mockProcess() as never);

    const run = manager.startFFmpeg({
      url: "rtmp://example",
      key: "stream-key",
    });
    try {
      await vi.advanceTimersByTimeAsync(3000);
      await run;
    } finally {
      vi.useRealTimers();
    }

    const args = mockedSpawn.mock.calls.at(-1)?.[1] ?? [];
    expect(mockedSpawn).toHaveBeenCalledTimes(1);
    expect(args).toContain("-f");
    expect(args).toContain("x11grab");
    expect(args).toContain("lavfi");
    expect(args).toContain("anullsrc=channel_layout=stereo:sample_rate=44100");
    expect(args).toContain("flv");
    expect(args).toContain("rtmp://example/stream-key");
  });
});
