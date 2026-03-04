import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Tests for SwabbleManager — wake word detection logic.
 *
 * Mocks the whisper module (isWhisperAvailable, transcribe) and the
 * sendToWebview callback to test audioChunk processing in isolation.
 */

// ---------------------------------------------------------------------------
// Mock whisper module
// ---------------------------------------------------------------------------

const mockTranscribe = vi.fn<(audioPath: string) => Promise<{ text: string } | null>>();
const mockIsWhisperAvailable = vi.fn<() => boolean>();

vi.mock("../native/whisper", () => ({
  isWhisperAvailable: () => mockIsWhisperAvailable(),
  transcribe: (audioPath: string) => mockTranscribe(audioPath),
}));

// Mock fs to avoid real file writes during tests
vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    default: {
      ...actual,
      writeFileSync: vi.fn(),
      unlinkSync: vi.fn(),
    },
    writeFileSync: vi.fn(),
    unlinkSync: vi.fn(),
  };
});

// ---------------------------------------------------------------------------
// Import after mocks are set up
// ---------------------------------------------------------------------------

// We need to dynamically import after mocks are registered
let SwabbleManager: typeof import("../native/swabble").SwabbleManager;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("../native/swabble");
  SwabbleManager = mod.SwabbleManager;
});

// ===========================================================================
// audioChunk wake word detection
// ===========================================================================

describe("SwabbleManager.audioChunk", () => {
  let manager: InstanceType<typeof SwabbleManager>;
  let sendToWebview: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    manager = new SwabbleManager();
    sendToWebview = vi.fn();
    manager.setSendToWebview(sendToWebview);
    mockIsWhisperAvailable.mockReturnValue(true);
  });

  it("sends swabbleWakeWord when trigger is found in transcript", async () => {
    mockTranscribe.mockResolvedValue({
      text: "hey milady what is the weather",
    });

    // Start listening first
    await manager.start();

    await manager.audioChunk({ data: Buffer.from("audio").toString("base64") });

    expect(sendToWebview).toHaveBeenCalledWith("swabbleWakeWord", {
      trigger: "hey milady",
      command: "what is the weather",
      transcript: "hey milady what is the weather",
    });
  });

  it("sends wake word event with undefined command when command is too short", async () => {
    mockTranscribe.mockResolvedValue({ text: "hey milady x" });

    await manager.start();
    await manager.audioChunk({ data: Buffer.from("audio").toString("base64") });

    expect(sendToWebview).toHaveBeenCalledWith("swabbleWakeWord", {
      trigger: "hey milady",
      command: undefined, // "x" is shorter than minCommandLength (2)
      transcript: "hey milady x",
    });
  });

  it("matches the shorter 'milady' trigger when 'hey milady' is not present", async () => {
    mockTranscribe.mockResolvedValue({
      text: "milady play some music",
    });

    await manager.start();
    await manager.audioChunk({ data: Buffer.from("audio").toString("base64") });

    // "hey milady" is checked first but doesn't match; "milady" does
    // However since "milady" is a substring of the text:
    // idx = text.indexOf("milady") => finds "milady" at position 0
    // command = "play some music"
    expect(sendToWebview).toHaveBeenCalledWith("swabbleWakeWord", {
      trigger: "milady",
      command: "play some music",
      transcript: "milady play some music",
    });
  });

  it("does not send event when no trigger matches", async () => {
    mockTranscribe.mockResolvedValue({ text: "hello world how are you" });

    await manager.start();
    await manager.audioChunk({ data: Buffer.from("audio").toString("base64") });

    expect(sendToWebview).not.toHaveBeenCalledWith(
      "swabbleWakeWord",
      expect.anything(),
    );
  });

  it("does nothing when not listening", async () => {
    mockTranscribe.mockResolvedValue({ text: "hey milady hello" });

    // Do NOT call start() — manager is not listening
    await manager.audioChunk({ data: Buffer.from("audio").toString("base64") });

    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(sendToWebview).not.toHaveBeenCalled();
  });

  it("does nothing when whisper is unavailable", async () => {
    mockIsWhisperAvailable.mockReturnValue(false);

    await manager.audioChunk({ data: Buffer.from("audio").toString("base64") });

    expect(mockTranscribe).not.toHaveBeenCalled();
  });

  it("does nothing when transcription returns null", async () => {
    mockTranscribe.mockResolvedValue(null);

    await manager.start();
    await manager.audioChunk({ data: Buffer.from("audio").toString("base64") });

    expect(sendToWebview).not.toHaveBeenCalledWith(
      "swabbleWakeWord",
      expect.anything(),
    );
  });

  it("handles transcription errors gracefully", async () => {
    mockTranscribe.mockRejectedValue(new Error("Transcription failed"));

    await manager.start();

    // Should not throw
    await expect(
      manager.audioChunk({ data: Buffer.from("audio").toString("base64") }),
    ).resolves.toBeUndefined();
  });

  it("is case-insensitive when matching triggers", async () => {
    mockTranscribe.mockResolvedValue({
      text: "HEY MILADY turn on lights",
    });

    await manager.start();
    await manager.audioChunk({ data: Buffer.from("audio").toString("base64") });

    expect(sendToWebview).toHaveBeenCalledWith("swabbleWakeWord", {
      trigger: "hey milady",
      command: "turn on lights",
      transcript: "HEY MILADY turn on lights",
    });
  });
});

// ===========================================================================
// SwabbleManager lifecycle
// ===========================================================================

describe("SwabbleManager lifecycle", () => {
  it("start returns unavailable when whisper is not available", async () => {
    mockIsWhisperAvailable.mockReturnValue(false);
    const manager = new SwabbleManager();

    const result = await manager.start();

    expect(result).toEqual({
      available: false,
      reason: expect.stringContaining("Whisper is not available"),
    });
  });

  it("start returns available when whisper is available", async () => {
    mockIsWhisperAvailable.mockReturnValue(true);
    const manager = new SwabbleManager();

    const result = await manager.start();

    expect(result).toEqual({ available: true });
  });

  it("stop sets listening to false", async () => {
    mockIsWhisperAvailable.mockReturnValue(true);
    const manager = new SwabbleManager();

    await manager.start();
    expect((await manager.isListening()).listening).toBe(true);

    await manager.stop();
    expect((await manager.isListening()).listening).toBe(false);
  });
});
