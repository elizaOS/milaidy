/**
 * Tests for services/stream-manager.ts
 *
 * Tests the StreamManager singleton's observable behaviour:
 * - getHealth() shape
 * - setVolume() clamping / rounding
 * - mute() / unmute() state and getVolume() semantics
 * - buildVideoInputArgs() indirectly via spawn-captured FFmpeg args
 * - buildAudioInputArgs() indirectly via spawn-captured FFmpeg args
 * - Volume filter in FFmpeg args
 * - x11grab display arg forwarding
 *
 * FFmpeg is never actually spawned — child_process.spawn is mocked at the
 * module level so the import of `spawn` in stream-manager.ts is intercepted.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock child_process before any module that imports it is loaded.
// Vitest hoists vi.mock() calls to the top of the file automatically.
// ---------------------------------------------------------------------------

vi.mock("node:child_process", () => ({
  spawn: vi.fn(),
}));

// Suppress logger noise in test output.
vi.mock("@elizaos/core", () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

import { spawn } from "node:child_process";
import type { StreamConfig } from "./stream-manager";
import { streamManager } from "./stream-manager";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal mock ChildProcess whose exitCode stays null so start()
 * considers FFmpeg alive after the 1500 ms probe delay.
 */
function makeMockProc(opts: { exitCode?: number | null } = {}) {
  const exitCode = opts.exitCode ?? null;
  return {
    stdin: {
      write: vi.fn(),
      end: vi.fn(),
      on: vi.fn(),
    },
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
    on: vi.fn(),
    kill: vi.fn(),
    killed: false,
    exitCode,
    pid: 12345,
  };
}

/**
 * Install a spawn mock that returns a live (exitCode=null) process, call
 * start(), and advance fake timers past the 1500 ms probe wait so start()
 * resolves synchronously in tests.
 *
 * Returns the full flattened string[] that was passed to spawn() as its
 * second argument (i.e. the ffmpeg args including the leading "-y").
 */
async function startWithMock(config: StreamConfig): Promise<string[]> {
  const proc = makeMockProc();
  // biome-ignore lint/suspicious/noExplicitAny: mock proc shape doesn't fully match ChildProcess
  vi.mocked(spawn).mockReturnValueOnce(proc as any);

  vi.useFakeTimers();

  const startPromise = streamManager.start(config);
  await vi.runAllTimersAsync();
  await startPromise;

  vi.useRealTimers();

  const calls = vi.mocked(spawn).mock.calls;
  const lastCall = calls[calls.length - 1];
  // spawn("ffmpeg", ["-y", ...ffmpegArgs], opts)  →  lastCall[1] is the args array
  return lastCall[1] as string[];
}

// ---------------------------------------------------------------------------
// Reset singleton state between every test
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.mocked(spawn).mockReset();
});

afterEach(async () => {
  // stop() is a no-op when not running, so calling it unconditionally is safe.
  await streamManager.stop();
  vi.useRealTimers();
});

// ===========================================================================
// 1. getHealth() shape
// ===========================================================================

describe("getHealth()", () => {
  it("returns all expected fields", () => {
    const health = streamManager.getHealth();

    expect(health).toHaveProperty("running");
    expect(health).toHaveProperty("ffmpegAlive");
    expect(health).toHaveProperty("uptime");
    expect(health).toHaveProperty("frameCount");
    expect(health).toHaveProperty("volume");
    expect(health).toHaveProperty("muted");
    expect(health).toHaveProperty("audioSource");
    expect(health).toHaveProperty("inputMode");
  });

  it("reports running=false and ffmpegAlive=false before any stream starts", () => {
    const health = streamManager.getHealth();

    expect(health.running).toBe(false);
    expect(health.ffmpegAlive).toBe(false);
    expect(health.uptime).toBe(0);
    expect(health.frameCount).toBe(0);
  });

  it("reports audioSource='silent' and inputMode=null when no config is set", () => {
    const health = streamManager.getHealth();

    expect(health.audioSource).toBe("silent");
    expect(health.inputMode).toBeNull();
  });
});

// ===========================================================================
// 2. setVolume()
// ===========================================================================

describe("setVolume()", () => {
  it("sets volume to the given level", async () => {
    await streamManager.setVolume(60);

    expect(streamManager.getVolume()).toBe(60);
    expect(streamManager.getHealth().volume).toBe(60);
  });

  it("clamps negative values to 0", async () => {
    await streamManager.setVolume(-10);

    expect(streamManager.getHealth().volume).toBe(0);
  });

  it("clamps values above 100 to 100", async () => {
    await streamManager.setVolume(150);

    expect(streamManager.getHealth().volume).toBe(100);
  });

  it("rounds fractional values to nearest integer (0.7 → 1)", async () => {
    await streamManager.setVolume(73.7);

    expect(streamManager.getHealth().volume).toBe(74);
  });

  it("rounds 0.4 down to 0", async () => {
    await streamManager.setVolume(0.4);

    expect(streamManager.getHealth().volume).toBe(0);
  });

  it("does NOT call spawn when stream is not running", async () => {
    await streamManager.setVolume(40);

    expect(vi.mocked(spawn)).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 3. mute() / unmute()
// ===========================================================================

describe("mute() / unmute()", () => {
  // Restore a known base state before each test in this suite.
  beforeEach(async () => {
    // isMuted() may be true from a previous test — reset to unmuted.
    if (streamManager.isMuted()) {
      await streamManager.unmute();
    }
    await streamManager.setVolume(80);
  });

  it("mute() sets muted=true and isMuted() returns true", async () => {
    await streamManager.mute();

    expect(streamManager.isMuted()).toBe(true);
    expect(streamManager.getHealth().muted).toBe(true);
  });

  it("unmute() sets muted=false", async () => {
    await streamManager.mute();
    await streamManager.unmute();

    expect(streamManager.isMuted()).toBe(false);
    expect(streamManager.getHealth().muted).toBe(false);
  });

  it("getVolume() returns 0 when muted", async () => {
    await streamManager.setVolume(80);
    await streamManager.mute();

    expect(streamManager.getVolume()).toBe(0);
  });

  it("getVolume() returns actual volume when unmuted", async () => {
    await streamManager.setVolume(65);
    await streamManager.mute();
    await streamManager.unmute();

    expect(streamManager.getVolume()).toBe(65);
  });

  it("double mute() is a no-op and does not throw", async () => {
    await streamManager.mute();

    await expect(streamManager.mute()).resolves.toBeUndefined();
    expect(streamManager.isMuted()).toBe(true);
  });

  it("double unmute() is a no-op and does not throw", async () => {
    // Already unmuted from beforeEach.
    await expect(streamManager.unmute()).resolves.toBeUndefined();
    expect(streamManager.isMuted()).toBe(false);
  });

  it("mute() does NOT call spawn when stream is not running", async () => {
    vi.mocked(spawn).mockReset();
    await streamManager.mute();

    expect(vi.mocked(spawn)).not.toHaveBeenCalled();
  });

  it("unmute() does NOT call spawn when stream is not running", async () => {
    await streamManager.mute();
    vi.mocked(spawn).mockReset();
    await streamManager.unmute();

    expect(vi.mocked(spawn)).not.toHaveBeenCalled();
  });
});

// ===========================================================================
// 4. buildVideoInputArgs() — tested via spawn args
// ===========================================================================

const BASE_CONFIG: StreamConfig = {
  rtmpUrl: "rtmp://live.example.com/live",
  rtmpKey: "test-key",
  volume: 80,
  muted: false,
};

describe("buildVideoInputArgs() via spawn args", () => {
  it("pipe mode: contains -f image2pipe, -c:v mjpeg, -i pipe:0", async () => {
    const args = await startWithMock({ ...BASE_CONFIG, inputMode: "pipe" });

    expect(args).toContain("-f");
    expect(args).toContain("image2pipe");
    expect(args).toContain("-c:v");
    expect(args).toContain("mjpeg");
    expect(args).toContain("-i");
    expect(args).toContain("pipe:0");
  });

  it("pipe mode: contains -probesize 32 and -analyzeduration 0 for fast start", async () => {
    const args = await startWithMock({ ...BASE_CONFIG, inputMode: "pipe" });

    expect(args).toContain("-probesize");
    expect(args).toContain("32");
    expect(args).toContain("-analyzeduration");
    expect(args).toContain("0");
  });

  it("x11grab mode: contains -f x11grab and -video_size 1280x720", async () => {
    const args = await startWithMock({
      ...BASE_CONFIG,
      inputMode: "x11grab",
      display: ":42",
    });

    expect(args).toContain("-f");
    expect(args).toContain("x11grab");
    expect(args).toContain("-video_size");
    expect(args).toContain("1280x720");
  });

  it("x11grab mode: passes specified display as video -i argument", async () => {
    const args = await startWithMock({
      ...BASE_CONFIG,
      inputMode: "x11grab",
      display: ":42",
    });

    // Walk forward from the x11grab entry to find the first -i after it.
    const x11Index = args.indexOf("x11grab");
    let videoIIndex = -1;
    for (let i = x11Index; i < args.length - 1; i++) {
      if (args[i] === "-i") {
        videoIIndex = i;
        break;
      }
    }

    expect(videoIIndex).toBeGreaterThan(-1);
    expect(args[videoIIndex + 1]).toBe(":42");
  });

  it("x11grab mode: defaults to display :99 when display is omitted", async () => {
    const args = await startWithMock({ ...BASE_CONFIG, inputMode: "x11grab" });

    const x11Index = args.indexOf("x11grab");
    let videoIIndex = -1;
    for (let i = x11Index; i < args.length - 1; i++) {
      if (args[i] === "-i") {
        videoIIndex = i;
        break;
      }
    }

    expect(args[videoIIndex + 1]).toBe(":99");
  });

  it("avfoundation mode: contains -f avfoundation and <device>:none", async () => {
    const args = await startWithMock({
      ...BASE_CONFIG,
      inputMode: "avfoundation",
      videoDevice: "3",
    });

    expect(args).toContain("-f");
    expect(args).toContain("avfoundation");
    expect(args).toContain("3:none");
  });

  it("testsrc mode: contains -f lavfi with color= source string", async () => {
    const args = await startWithMock({ ...BASE_CONFIG, inputMode: "testsrc" });

    expect(args).toContain("-f");
    expect(args).toContain("lavfi");

    const iIndex = args.indexOf("-i");
    expect(iIndex).toBeGreaterThan(-1);
    expect(args[iIndex + 1]).toMatch(/^color=c=/);
  });

  it("file mode: contains -loop 1, -f image2, and the frame file path", async () => {
    const args = await startWithMock({
      ...BASE_CONFIG,
      inputMode: "file",
      frameFile: "/tmp/frame.jpg",
    });

    expect(args).toContain("-loop");
    expect(args).toContain("1");
    expect(args).toContain("-f");
    expect(args).toContain("image2");
    expect(args).toContain("/tmp/frame.jpg");
  });
});

// ===========================================================================
// 5. buildAudioInputArgs() — tested via spawn args
// ===========================================================================

describe("buildAudioInputArgs() via spawn args", () => {
  it("silent: args contain anullsrc", async () => {
    const args = await startWithMock({
      ...BASE_CONFIG,
      audioSource: "silent",
    });

    expect(args).toContain("anullsrc=channel_layout=stereo:sample_rate=44100");
  });

  it("system on darwin: args contain avfoundation and none:<device>", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      value: "darwin",
      configurable: true,
    });

    try {
      const args = await startWithMock({
        ...BASE_CONFIG,
        audioSource: "system",
        audioDevice: "2",
      });

      expect(args).toContain("none:2");
    } finally {
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    }
  });

  it("system on linux: args contain -f pulse", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      value: "linux",
      configurable: true,
    });

    try {
      const args = await startWithMock({
        ...BASE_CONFIG,
        audioSource: "system",
      });

      expect(args).toContain("-f");
      expect(args).toContain("pulse");
    } finally {
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    }
  });

  it("microphone on darwin: args contain avfoundation and none:<device>", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      value: "darwin",
      configurable: true,
    });

    try {
      const args = await startWithMock({
        ...BASE_CONFIG,
        audioSource: "microphone",
        audioDevice: "1",
      });

      expect(args).toContain("none:1");
    } finally {
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    }
  });

  it("microphone on linux: args contain -f pulse", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", {
      value: "linux",
      configurable: true,
    });

    try {
      const args = await startWithMock({
        ...BASE_CONFIG,
        audioSource: "microphone",
      });

      expect(args).toContain("-f");
      expect(args).toContain("pulse");
    } finally {
      Object.defineProperty(process, "platform", {
        value: originalPlatform,
        configurable: true,
      });
    }
  });

  it("absolute file path: args contain -stream_loop -1 and the path", async () => {
    const args = await startWithMock({
      ...BASE_CONFIG,
      audioSource: "/path/to/music.mp3",
    });

    expect(args).toContain("-stream_loop");
    expect(args).toContain("-1");
    expect(args).toContain("/path/to/music.mp3");
  });

  it("relative file path (./): args contain -stream_loop -1 and the path", async () => {
    const args = await startWithMock({
      ...BASE_CONFIG,
      audioSource: "./music/track.mp3",
    });

    expect(args).toContain("-stream_loop");
    expect(args).toContain("-1");
    expect(args).toContain("./music/track.mp3");
  });

  it("unknown string source: falls back to anullsrc (silent)", async () => {
    const args = await startWithMock({
      ...BASE_CONFIG,
      // biome-ignore lint/suspicious/noExplicitAny: intentionally testing unrecognized source
      audioSource: "totally-unknown-source" as any,
    });

    expect(args).toContain("anullsrc=channel_layout=stereo:sample_rate=44100");
  });
});

// ===========================================================================
// 6. Volume filter in FFmpeg args
// ===========================================================================

describe("volume filter (-af) in FFmpeg args", () => {
  it("includes -af volume=0.50 when volume=50 and muted=false", async () => {
    const args = await startWithMock({
      ...BASE_CONFIG,
      volume: 50,
      muted: false,
    });

    const afIndex = args.indexOf("-af");
    expect(afIndex).toBeGreaterThan(-1);
    expect(args[afIndex + 1]).toBe("volume=0.50");
  });

  it("includes -af volume=0.00 when muted=true regardless of volume", async () => {
    const args = await startWithMock({
      ...BASE_CONFIG,
      volume: 80,
      muted: true,
    });

    const afIndex = args.indexOf("-af");
    expect(afIndex).toBeGreaterThan(-1);
    expect(args[afIndex + 1]).toBe("volume=0.00");
  });

  it("includes -af volume=1.00 when volume=100 and muted=false", async () => {
    const args = await startWithMock({
      ...BASE_CONFIG,
      volume: 100,
      muted: false,
    });

    const afIndex = args.indexOf("-af");
    expect(afIndex).toBeGreaterThan(-1);
    expect(args[afIndex + 1]).toBe("volume=1.00");
  });

  it("includes -af volume=0.00 when volume=0 and muted=false", async () => {
    const args = await startWithMock({
      ...BASE_CONFIG,
      volume: 0,
      muted: false,
    });

    const afIndex = args.indexOf("-af");
    expect(afIndex).toBeGreaterThan(-1);
    expect(args[afIndex + 1]).toBe("volume=0.00");
  });
});

// ===========================================================================
// 7. x11grab mode args (dedicated suite)
// ===========================================================================

describe("x11grab mode args", () => {
  it("contains -f x11grab", async () => {
    const args = await startWithMock({
      ...BASE_CONFIG,
      inputMode: "x11grab",
      display: ":42",
    });

    expect(args).toContain("-f");
    expect(args).toContain("x11grab");
  });

  it("contains -video_size 1280x720 with default resolution", async () => {
    const args = await startWithMock({
      ...BASE_CONFIG,
      inputMode: "x11grab",
      display: ":42",
    });

    expect(args).toContain("-video_size");
    expect(args).toContain("1280x720");
  });

  it("contains -i :42 for the specified display", async () => {
    const args = await startWithMock({
      ...BASE_CONFIG,
      inputMode: "x11grab",
      display: ":42",
    });

    const x11Index = args.indexOf("x11grab");
    let videoIIndex = -1;
    for (let i = x11Index; i < args.length - 1; i++) {
      if (args[i] === "-i") {
        videoIIndex = i;
        break;
      }
    }

    expect(videoIIndex).toBeGreaterThan(-1);
    expect(args[videoIIndex + 1]).toBe(":42");
  });

  it("respects custom resolution in -video_size", async () => {
    const args = await startWithMock({
      ...BASE_CONFIG,
      inputMode: "x11grab",
      display: ":99",
      resolution: "1920x1080",
    });

    expect(args).toContain("-video_size");
    expect(args).toContain("1920x1080");
  });
});
