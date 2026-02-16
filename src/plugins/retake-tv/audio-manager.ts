/**
 * PulseAudio sink and TTS playback helpers for retake.tv streaming.
 *
 * Split out from StreamManager so the main streaming class stays focused on
 * lifecycle orchestration while this file owns audio plumbing.
 */

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "@elizaos/core";

const TAG = "[retake-tv:audio]";
const PULSE_SINK_NAME = "retake_tts";

export type RetakeAudioFormat = "mp3" | "wav" | "ogg";

/**
 * Encapsulates PulseAudio + TTS playback operations to avoid shell command
 * interpolation risk and to keep StreamManager under a sane size.
 */
export class RetakeAudioManager {
  private pulseAudioReady = false;
  private pulseSinkModuleId: number | null = null;

  constructor(
    private readonly isCommandAvailable: (cmd: string) => boolean,
    private readonly pulseSinkName = PULSE_SINK_NAME,
  ) {}

  /** Whether the stream can capture TTS audio. */
  get hasAudio(): boolean {
    return this.pulseAudioReady;
  }

  /** Build audio args for FFmpeg based on whether PulseAudio is available. */
  buildAudioInputArgs(): string[] {
    if (this.pulseAudioReady) {
      return ["-f", "pulse", "-i", `${this.pulseSinkName}.monitor`];
    }

    return [
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
    ];
  }

  /** Create a virtual sink for TTS audio capture. */
  setupPulseAudioSink(): boolean {
    if (!this.isCommandAvailable("pactl")) {
      logger.debug(`${TAG} pactl not available, audio will be silent`);
      return false;
    }

    try {
      const sinks = execFileSync("pactl", ["list", "short", "sinks"], {
        encoding: "utf-8",
        timeout: 3000,
      });

      if (sinks.includes(this.pulseSinkName)) {
        logger.info(`${TAG} PulseAudio sink "${this.pulseSinkName}" already exists`);
        this.pulseAudioReady = true;
        return true;
      }

      const rawModuleId = execFileSync(
        "pactl",
        [
          "load-module",
          "module-null-sink",
          `sink_name=${this.pulseSinkName}`,
          'sink_properties=device.description="Retake_TTS_Audio"',
        ],
        { encoding: "utf-8", timeout: 3000 },
      ).trim();
      const moduleId = Number.parseInt(rawModuleId, 10);
      if (Number.isNaN(moduleId)) {
        throw new Error(`Unable to parse module id from "${rawModuleId}"`);
      }

      this.pulseSinkModuleId = moduleId;
      this.pulseAudioReady = true;

      logger.info(
        `${TAG} PulseAudio virtual sink created: ${this.pulseSinkName} (module ${this.pulseSinkModuleId})`,
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`${TAG} PulseAudio setup failed: ${msg}`);
      this.pulseAudioReady = false;
      return false;
    }
  }

  /** Remove virtual sink module. */
  teardownPulseAudioSink(): void {
    if (this.pulseSinkModuleId !== null) {
      try {
        execFileSync(
          "pactl",
          ["unload-module", String(this.pulseSinkModuleId)],
          { stdio: "ignore", timeout: 3000 },
        );
        logger.debug(`${TAG} PulseAudio sink removed`);
      } catch {
        // Best-effort.
      }
      this.pulseSinkModuleId = null;
    }

    this.pulseAudioReady = false;
  }

  /**
   * Play audio through the virtual sink. If WAV format is available and paplay
   * exists, use that; otherwise decode with FFmpeg into PulseAudio.
   */
  playAudio(audioBuffer: Buffer, format: RetakeAudioFormat = "mp3"): void {
    if (!this.pulseAudioReady) {
      logger.debug(`${TAG} No audio sink, skipping playAudio`);
      return;
    }

    const tmpFile = join(tmpdir(), `retake-tts-${Date.now()}.${format}`);
    try {
      writeFileSync(tmpFile, audioBuffer);
    } catch (err) {
      logger.warn(`${TAG} Failed to write temp audio: ${String(err)}`);
      return;
    }

    let proc: ChildProcess;
    if (format === "wav" && this.isCommandAvailable("paplay")) {
      proc = spawn("paplay", [`--device=${this.pulseSinkName}`, tmpFile], {
        stdio: "ignore",
        detached: true,
      });
    } else {
      proc = spawn(
        "ffmpeg",
        ["-i", tmpFile, "-f", "pulse", "-device", this.pulseSinkName, "-"],
        { stdio: "ignore", detached: true },
      );
    }

    proc.unref();
    proc.on("exit", () => {
      try {
        if (existsSync(tmpFile)) unlinkSync(tmpFile);
      } catch {
        // Best-effort cleanup.
      }
    });
  }
}
