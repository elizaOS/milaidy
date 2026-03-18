/**
 * Unit tests for the Electrobun Whisper native module.
 *
 * Covers:
 * - parseWhisperOutput (pure function — timestamp parsing, segment extraction)
 * - writeWavFile (RIFF header layout, Float32 → Int16 conversion)
 * - isWhisperBinaryAvailable (fs.existsSync gating)
 * - isWhisperAvailable (composite: binary OR dynamically-loaded module)
 * - transcribeBunSpawn (Bun.spawn mock — success / binary-missing / spawn error)
 */

import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// vi.hoisted runs before ANY module import (earlier than vi.mock factories).
// Set env vars here so resolveWhisperPath() uses them on module load and never
// reaches `import.meta.dir` (Bun-only, undefined in Vitest/Node).
// ---------------------------------------------------------------------------
vi.hoisted(() => {
  process.env.MILADY_WHISPER_BIN = "/mock/whisper/main";
  process.env.MILADY_WHISPER_MODEL = "/mock/whisper/ggml-base.en.bin";
});

// ---------------------------------------------------------------------------
// Mocks — vi.fn() calls must be INSIDE the factory to avoid hoisting issues.
// The module is imported after vi.mock() to receive the mocked fs.
// ---------------------------------------------------------------------------

vi.mock("node:fs", () => {
  const existsSyncFn = vi.fn(() => true);
  const writeFileSyncFn = vi.fn();
  return {
    default: { existsSync: existsSyncFn, writeFileSync: writeFileSyncFn },
    existsSync: existsSyncFn,
    writeFileSync: writeFileSyncFn,
  };
});

vi.stubGlobal("Bun", { spawn: vi.fn() });

// ---------------------------------------------------------------------------
// Module under test — imported after mocks so module-level code sees them.
// ---------------------------------------------------------------------------
import * as nodeFs from "node:fs";
import {
  getWhisperModule,
  isWhisperAvailable,
  isWhisperBinaryAvailable,
  parseWhisperOutput,
  transcribeBunSpawn,
  writeWavFile,
} from "../whisper";

// Typed references to the mocked functions
const existsSyncFn = nodeFs.existsSync as ReturnType<typeof vi.fn>;
const writeFileSyncFn = nodeFs.writeFileSync as ReturnType<typeof vi.fn>;
const mockSpawn = (globalThis as { Bun: { spawn: ReturnType<typeof vi.fn> } })
  .Bun.spawn;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReadableStream(text: string): ReadableStream<Uint8Array> {
  const encoded = new TextEncoder().encode(text);
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoded);
      controller.close();
    },
  });
}

function makeMockProc(stdout: string) {
  return {
    stdout: makeReadableStream(stdout),
    exited: Promise.resolve(0),
  };
}

// ---------------------------------------------------------------------------
// parseWhisperOutput
// ---------------------------------------------------------------------------

describe("parseWhisperOutput", () => {
  it("returns empty text and segments for empty input", () => {
    const result = parseWhisperOutput("");
    expect(result.text).toBe("");
    expect(result.segments).toEqual([]);
  });

  it("parses a single timestamped line", () => {
    const stdout = "[00:00:00.000 --> 00:00:01.500]   Hello world\n";
    const result = parseWhisperOutput(stdout);
    expect(result.text).toBe("Hello world");
    expect(result.segments).toHaveLength(1);
    expect(result.segments[0].text).toBe("Hello world");
    expect(result.segments[0].start).toBeCloseTo(0);
    expect(result.segments[0].end).toBeCloseTo(1.5);
  });

  it("parses multiple segments and joins text with spaces", () => {
    const stdout = [
      "[00:00:00.000 --> 00:00:01.000]   Hello",
      "[00:00:01.000 --> 00:00:02.000]   world",
    ].join("\n");

    const result = parseWhisperOutput(stdout);
    expect(result.text).toBe("Hello world");
    expect(result.segments).toHaveLength(2);
  });

  it("converts HH:MM:SS.mmm timestamps to seconds", () => {
    const stdout = "[01:02:03.500 --> 01:02:04.250]   tick\n";
    const result = parseWhisperOutput(stdout);
    const expectedStart = 1 * 3600 + 2 * 60 + 3.5;
    const expectedEnd = 1 * 3600 + 2 * 60 + 4.25;
    expect(result.segments[0].start).toBeCloseTo(expectedStart);
    expect(result.segments[0].end).toBeCloseTo(expectedEnd);
  });

  it("ignores lines that do not match the timestamp pattern", () => {
    const stdout = [
      "whisper_model_load: loading model from ...",
      "[00:00:00.000 --> 00:00:01.000]   Hey Milady",
      "whisper_print_timings: total time = 123 ms",
    ].join("\n");

    const result = parseWhisperOutput(stdout);
    expect(result.segments).toHaveLength(1);
    expect(result.text).toBe("Hey Milady");
  });

  it("skips empty text segments", () => {
    const stdout = "[00:00:00.000 --> 00:00:01.000]   \n";
    const result = parseWhisperOutput(stdout);
    expect(result.segments).toHaveLength(0);
    expect(result.text).toBe("");
  });

  it("handles extra whitespace around text", () => {
    const stdout = "[00:00:00.000 --> 00:00:01.000]     lots of spaces   \n";
    const result = parseWhisperOutput(stdout);
    expect(result.segments[0].text).toBe("lots of spaces");
  });
});

// ---------------------------------------------------------------------------
// writeWavFile
// ---------------------------------------------------------------------------

describe("writeWavFile", () => {
  beforeEach(() => writeFileSyncFn.mockClear());

  it("writes a RIFF WAV file to the specified path", () => {
    const samples = new Float32Array([0, 0.5, -0.5, 1.0, -1.0]);
    writeWavFile("/tmp/test.wav", samples, 16000, 1);
    expect(writeFileSyncFn).toHaveBeenCalledTimes(1);
    expect(writeFileSyncFn.mock.calls[0][0]).toBe("/tmp/test.wav");
  });

  it("produces a buffer with correct RIFF header magic bytes", () => {
    const samples = new Float32Array(4);
    writeWavFile("/tmp/test.wav", samples);

    const buffer: Buffer = writeFileSyncFn.mock.calls[0][1] as Buffer;
    expect(buffer.toString("ascii", 0, 4)).toBe("RIFF");
    expect(buffer.toString("ascii", 8, 12)).toBe("WAVE");
  });

  it("produces correct fmt chunk", () => {
    const samples = new Float32Array(8);
    writeWavFile("/tmp/test.wav", samples, 16000, 1);

    const buffer: Buffer = writeFileSyncFn.mock.calls[0][1] as Buffer;
    expect(buffer.toString("ascii", 12, 16)).toBe("fmt ");
    expect(buffer.readUInt16LE(20)).toBe(1); // PCM format
    expect(buffer.readUInt16LE(22)).toBe(1); // 1 channel
    expect(buffer.readUInt32LE(24)).toBe(16000); // sample rate
    expect(buffer.readUInt16LE(34)).toBe(16); // bits per sample
  });

  it("data chunk size equals numSamples * 2 (16-bit)", () => {
    const numSamples = 10;
    const samples = new Float32Array(numSamples);
    writeWavFile("/tmp/test.wav", samples);

    const buffer: Buffer = writeFileSyncFn.mock.calls[0][1] as Buffer;
    expect(buffer.toString("ascii", 36, 40)).toBe("data");
    expect(buffer.readUInt32LE(40)).toBe(numSamples * 2);
  });

  it("total buffer size is 44 (header) + numSamples * 2", () => {
    const numSamples = 100;
    const samples = new Float32Array(numSamples);
    writeWavFile("/tmp/test.wav", samples);

    const buffer: Buffer = writeFileSyncFn.mock.calls[0][1] as Buffer;
    expect(buffer.length).toBe(44 + numSamples * 2);
  });

  it("clamps values > 1.0 to Int16 max (32767)", () => {
    const samples = new Float32Array([2.0]);
    writeWavFile("/tmp/test.wav", samples);

    const buffer: Buffer = writeFileSyncFn.mock.calls[0][1] as Buffer;
    expect(buffer.readInt16LE(44)).toBe(32767);
  });

  it("clamps values < -1.0 to Int16 min (-32768)", () => {
    const samples = new Float32Array([-2.0]);
    writeWavFile("/tmp/test.wav", samples);

    const buffer: Buffer = writeFileSyncFn.mock.calls[0][1] as Buffer;
    expect(buffer.readInt16LE(44)).toBe(-32768);
  });

  it("converts silence (0.0) to 0 in Int16", () => {
    const samples = new Float32Array([0]);
    writeWavFile("/tmp/test.wav", samples);

    const buffer: Buffer = writeFileSyncFn.mock.calls[0][1] as Buffer;
    expect(buffer.readInt16LE(44)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isWhisperBinaryAvailable
// ---------------------------------------------------------------------------

describe("isWhisperBinaryAvailable", () => {
  beforeEach(() => existsSyncFn.mockReset());

  it("returns true when both bin and model exist", () => {
    existsSyncFn.mockReturnValue(true);
    expect(isWhisperBinaryAvailable()).toBe(true);
  });

  it("returns false when bin is missing", () => {
    existsSyncFn
      .mockReturnValueOnce(false) // WHISPER_BIN missing
      .mockReturnValue(true);
    expect(isWhisperBinaryAvailable()).toBe(false);
  });

  it("returns false when model is missing", () => {
    existsSyncFn
      .mockReturnValueOnce(true) // WHISPER_BIN exists
      .mockReturnValueOnce(false); // WHISPER_MODEL missing
    expect(isWhisperBinaryAvailable()).toBe(false);
  });

  it("returns false when both are missing", () => {
    existsSyncFn.mockReturnValue(false);
    expect(isWhisperBinaryAvailable()).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// isWhisperAvailable
// ---------------------------------------------------------------------------

describe("isWhisperAvailable", () => {
  beforeEach(() => existsSyncFn.mockReset());

  it("returns true when binary is available", () => {
    existsSyncFn.mockReturnValue(true);
    expect(isWhisperAvailable()).toBe(true);
  });

  it("returns false when binary is missing and no loaded module", () => {
    existsSyncFn.mockReturnValue(false);
    expect(isWhisperAvailable()).toBe(getWhisperModule() !== null);
  });
});

// ---------------------------------------------------------------------------
// transcribeBunSpawn
// ---------------------------------------------------------------------------

describe("transcribeBunSpawn", () => {
  beforeEach(() => {
    existsSyncFn.mockReset();
    mockSpawn.mockReset();
  });

  it("returns null when binary is not available", async () => {
    existsSyncFn.mockReturnValue(false);
    const result = await transcribeBunSpawn("/tmp/audio.wav");
    expect(result).toBeNull();
    expect(mockSpawn).not.toHaveBeenCalled();
  });

  it("spawns whisper binary with correct arguments when available", async () => {
    existsSyncFn.mockReturnValue(true);
    mockSpawn.mockReturnValue(makeMockProc(""));

    await transcribeBunSpawn("/tmp/audio.wav");

    expect(mockSpawn).toHaveBeenCalledTimes(1);
    const [args, opts] = mockSpawn.mock.calls[0] as [string[], { cwd: string }];
    expect(args[0]).toBe("/mock/whisper/main");
    expect(args).toContain("-m");
    expect(args).toContain("/mock/whisper/ggml-base.en.bin");
    expect(args).toContain("-f");
    expect(args).toContain("/tmp/audio.wav");
    expect(args).toContain("-l");
    expect(args).toContain("en");
    expect(opts.cwd).toBe(path.dirname("/mock/whisper/main"));
  });

  it("returns parsed WhisperResult on success", async () => {
    existsSyncFn.mockReturnValue(true);
    const stdout =
      "[00:00:00.000 --> 00:00:01.000]   Hey Milady what time is it\n";
    mockSpawn.mockReturnValue(makeMockProc(stdout));

    const result = await transcribeBunSpawn("/tmp/audio.wav");
    expect(result).not.toBeNull();
    expect(result?.text).toBe("Hey Milady what time is it");
    expect(result?.segments).toHaveLength(1);
  });

  it("returns empty result on empty stdout", async () => {
    existsSyncFn.mockReturnValue(true);
    mockSpawn.mockReturnValue(makeMockProc(""));

    const result = await transcribeBunSpawn("/tmp/audio.wav");
    expect(result).not.toBeNull();
    expect(result?.text).toBe("");
    expect(result?.segments).toHaveLength(0);
  });

  it("returns null when Bun.spawn throws", async () => {
    existsSyncFn.mockReturnValue(true);
    mockSpawn.mockImplementation(() => {
      throw new Error("spawn failed");
    });

    const result = await transcribeBunSpawn("/tmp/audio.wav");
    expect(result).toBeNull();
  });

  it("parses multi-segment output correctly", async () => {
    existsSyncFn.mockReturnValue(true);
    const stdout = [
      "[00:00:00.000 --> 00:00:01.000]   Hey",
      "[00:00:01.000 --> 00:00:02.000]   Milady",
    ].join("\n");
    mockSpawn.mockReturnValue(makeMockProc(stdout));

    const result = await transcribeBunSpawn("/tmp/audio.wav");
    expect(result?.segments).toHaveLength(2);
    expect(result?.text).toBe("Hey Milady");
  });
});
