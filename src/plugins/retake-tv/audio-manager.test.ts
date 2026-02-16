/**
 * Unit tests for RetakeAudioManager.
 *
 * Focuses on shell-call safety, sink lifecycle, and audio playback command shape.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));
vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  unlinkSync: vi.fn(),
  writeFileSync: vi.fn(),
}));

import { execFileSync, spawn } from "node:child_process";
import { RetakeAudioManager } from "./audio-manager.js";

function createMockProcess() {
  return {
    pid: 12_345,
    unref: vi.fn(),
    on: vi.fn(),
  };
}

describe("RetakeAudioManager", () => {
  const commandAvailable = vi.fn();
  let audioManager: RetakeAudioManager;

  beforeEach(() => {
    vi.mocked(execFileSync).mockReset();
    vi.mocked(spawn).mockReset();
    vi.mocked(spawn).mockReturnValue(createMockProcess());
    commandAvailable.mockReset();
    commandAvailable.mockReturnValue(true);
    audioManager = new RetakeAudioManager(commandAvailable);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("reuses an existing retake PulseAudio sink", () => {
    vi.mocked(execFileSync).mockReturnValue("0\t1\tretake_tts");
    const ok = audioManager.setupPulseAudioSink();

    expect(ok).toBe(true);
    expect(audioManager.hasAudio).toBe(true);
    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith(
      "pactl",
      ["list", "short", "sinks"],
      expect.objectContaining({ encoding: "utf-8", timeout: 3000 }),
    );
  });

  it("loads a new PulseAudio sink when one does not exist", () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce("0\t1\tretake_other")
      .mockReturnValueOnce("42\n");

    const ok = audioManager.setupPulseAudioSink();

    expect(ok).toBe(true);
    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith(
      "pactl",
      ["load-module", "module-null-sink", "sink_name=retake_tts", 'sink_properties=device.description="Retake_TTS_Audio"'],
      expect.objectContaining({ encoding: "utf-8", timeout: 3000 }),
    );
    expect(audioManager.hasAudio).toBe(true);
  });

  it("fails to setup when pactl returns a non-numeric module id", () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce("0\t1\tretake_other")
      .mockReturnValueOnce("not-a-number\n");

    const ok = audioManager.setupPulseAudioSink();

    expect(ok).toBe(false);
    expect(audioManager.hasAudio).toBe(false);
  });

  it("unloads PulseAudio module during teardown", () => {
    vi.mocked(execFileSync)
      .mockReturnValueOnce("0\t1\tretake_other")
      .mockReturnValueOnce("42\n");
    audioManager.setupPulseAudioSink();
    audioManager.teardownPulseAudioSink();

    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith(
      "pactl",
      ["unload-module", "42"],
      expect.objectContaining({ stdio: "ignore", timeout: 3000 }),
    );
  });

  it("plays WAV via paplay on the PulseAudio sink", () => {
    commandAvailable.mockImplementation((cmd) => cmd === "pactl" || cmd === "paplay");
    vi.mocked(execFileSync)
      .mockReturnValueOnce("0\t1\tretake_tts")
      .mockReturnValueOnce("99\n");
    audioManager.setupPulseAudioSink();

    const spawned = vi.mocked(spawn);
    spawned.mockReturnValue(createMockProcess());

    audioManager.playAudio(Buffer.from("audio"), "wav");
    const args = spawned.mock.calls.at(-1);

    expect(args?.[0]).toBe("paplay");
    expect(args?.[1]?.[0]).toBe("--device=retake_tts");
  });

  it("falls back to ffmpeg decode for non-WAV audio", () => {
    commandAvailable.mockReturnValue((cmd) => cmd !== "paplay");
    vi.mocked(execFileSync)
      .mockReturnValueOnce("0\t1\tretake_tts")
      .mockReturnValueOnce("99\n");
    vi.mocked(spawn).mockReturnValue(createMockProcess());
    audioManager.setupPulseAudioSink();

    audioManager.playAudio(Buffer.from("audio"), "mp3");
    const args = vi.mocked(spawn).mock.calls.at(-1);

    expect(args?.[0]).toBe("ffmpeg");
    expect(args?.[1]).toContain("retake_tts");
  });

  it("does nothing when audio sink is unavailable", () => {
    commandAvailable.mockReturnValue(false);

    audioManager.playAudio(Buffer.from("audio"), "wav");

    expect(vi.mocked(spawn)).not.toHaveBeenCalled();
  });
});
