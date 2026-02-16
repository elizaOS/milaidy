/**
 * FFmpeg + Xvfb stream manager for retake.tv.
 *
 * Manages the full headless video pipeline:
 *   Xvfb (virtual display) -> FFmpeg capture -> RTMP push.
 *
 * When PulseAudio is available, a virtual sink is created for TTS audio.
 */

import { type ChildProcess, execFileSync, spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync } from "node:fs";
import { logger } from "@elizaos/core";
import type { RtmpCredentials, StreamManagerOptions } from "./types.js";
import { RetakeAudioManager } from "./audio-manager.js";

const TAG = "[retake-tv:stream]";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCommandAvailable(cmd: string): boolean {
  try {
    execFileSync("which", [cmd], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export type StreamManagerState = {
  isStreaming: boolean;
  hasAudio: boolean;
  display: number;
  xvfbPid: number | null;
  ffmpegPid: number | null;
  startedAt: number | null;
};

// ---------------------------------------------------------------------------
// StreamManager
// ---------------------------------------------------------------------------

export class StreamManager {
  private readonly display: number;
  private readonly width: number;
  private readonly height: number;
  private readonly framerate: number;
  private readonly videoBitrate: string;
  private readonly audioBitrate: string;
  private readonly preset: string;
  private readonly watchdogIntervalMs: number;
  private readonly thumbnailPath: string;

  private readonly audioManager: RetakeAudioManager;

  private xvfbProcess: ChildProcess | null = null;
  private ffmpegProcess: ChildProcess | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private rtmpCredentials: RtmpCredentials | null = null;
  private startedAt: number | null = null;

  constructor(opts?: StreamManagerOptions) {
    this.display = opts?.display ?? 99;
    this.width = opts?.width ?? 1280;
    this.height = opts?.height ?? 720;
    this.framerate = opts?.framerate ?? 30;
    this.videoBitrate = opts?.videoBitrate ?? "1500k";
    this.audioBitrate = opts?.audioBitrate ?? "128k";
    this.preset = opts?.preset ?? "veryfast";
    this.watchdogIntervalMs = opts?.watchdogIntervalMs ?? 15_000;
    this.thumbnailPath = opts?.thumbnailPath ?? "/tmp/retake-thumbnail.png";

    this.audioManager = new RetakeAudioManager(isCommandAvailable);
  }

  get displayEnv(): string {
    return `:${this.display}`;
  }

  /** Whether TTS audio can be routed into the stream. */
  get hasAudio(): boolean {
    return this.audioManager.hasAudio;
  }

  getState(): StreamManagerState {
    return {
      isStreaming: this.ffmpegProcess !== null && !this.ffmpegProcess.killed,
      hasAudio: this.audioManager.hasAudio,
      display: this.display,
      xvfbPid: this.xvfbProcess?.pid ?? null,
      ffmpegPid: this.ffmpegProcess?.pid ?? null,
      startedAt: this.startedAt,
    };
  }

  // -------------------------------------------------------------------------
  // Dependency check
  // -------------------------------------------------------------------------

  checkDependencies(): { ok: boolean; missing: string[] } {
    const required = ["Xvfb", "ffmpeg"];
    const optional = ["scrot", "openbox", "pactl", "paplay"];
    const missing: string[] = [];

    for (const cmd of required) {
      if (!isCommandAvailable(cmd)) missing.push(cmd);
    }

    for (const cmd of optional) {
      if (!isCommandAvailable(cmd)) {
        logger.debug(`${TAG} Optional dependency not found: ${cmd}`);
      }
    }

    return { ok: missing.length === 0, missing };
  }

  // -------------------------------------------------------------------------
  // PulseAudio wrappers
  // -------------------------------------------------------------------------

  /** Create a PulseAudio virtual sink so TTS audio can be captured by FFmpeg. */
  setupPulseAudioSink(): boolean {
    return this.audioManager.setupPulseAudioSink();
  }

  /** Remove the PulseAudio virtual sink. */
  teardownPulseAudioSink(): void {
    this.audioManager.teardownPulseAudioSink();
  }

  /** Play an audio buffer into the stream if PulseAudio is available. */
  playAudio(audioBuffer: Buffer, format: "mp3" | "wav" | "ogg" = "mp3"): void {
    this.audioManager.playAudio(audioBuffer, format);
  }

  // -------------------------------------------------------------------------
  // Xvfb — virtual display
  // -------------------------------------------------------------------------

  async startDisplay(): Promise<void> {
    if (this.xvfbProcess && !this.xvfbProcess.killed) {
      logger.debug(`${TAG} Xvfb already running on :${this.display}`);
      return;
    }

    // Check if something else is already using this display.
    try {
      execFileSync("xdpyinfo", ["-display", this.displayEnv], {
        stdio: "ignore",
      });
      logger.info(`${TAG} Display :${this.display} already active, reusing`);
      return;
    } catch {
      // Display not active, start it.
    }

    logger.info(
      `${TAG} Starting Xvfb on :${this.display} (${this.width}x${this.height})`,
    );

    this.xvfbProcess = spawn(
      "Xvfb",
      [
        `:${this.display}`,
        "-screen",
        "0",
        `${this.width}x${this.height}x24`,
        "-ac",
      ],
      { stdio: "ignore", detached: true },
    );
    this.xvfbProcess.unref();

    this.xvfbProcess.on("exit", (code) => {
      logger.warn(`${TAG} Xvfb exited with code ${code}`);
      this.xvfbProcess = null;
    });

    // Give Xvfb time to initialize.
    await new Promise((resolve) => setTimeout(resolve, 1500));
    logger.info(`${TAG} Xvfb started (pid: ${this.xvfbProcess.pid})`);
  }

  // -------------------------------------------------------------------------
  // Window manager
  // -------------------------------------------------------------------------

  startWindowManager(): void {
    if (!isCommandAvailable("openbox")) {
      logger.debug(`${TAG} openbox not available, skipping window manager`);
      return;
    }

    spawn("openbox", [], {
      stdio: "ignore",
      detached: true,
      env: { ...process.env, DISPLAY: this.displayEnv },
    }).unref();

    logger.debug(`${TAG} openbox started on :${this.display}`);
  }

  // -------------------------------------------------------------------------
  // FFmpeg — capture + RTMP push
  // -------------------------------------------------------------------------

  /**
   * Build FFmpeg audio input args based on TTS sink availability.
   */
  private buildAudioInputArgs(): string[] {
    return this.audioManager.buildAudioInputArgs();
  }

  async startFFmpeg(rtmp: RtmpCredentials): Promise<void> {
    if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
      logger.warn(`${TAG} FFmpeg already running, stopping first`);
      this.stopFFmpeg();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    this.rtmpCredentials = rtmp;
    const rtmpTarget = `${rtmp.url}/${rtmp.key}`;
    const audioSource = this.audioManager.hasAudio
      ? `PulseAudio sink "retake_tts"`
      : "silent (anullsrc)";
    logger.info(`${TAG} Starting FFmpeg stream (audio: ${audioSource})`);

    const audioArgs = this.buildAudioInputArgs();
    const parsedBitrate = Number.parseInt(this.videoBitrate, 10);
    const maxRate = Number.isNaN(parsedBitrate) ? 1500 : parsedBitrate;
    this.ffmpegProcess = spawn(
      "ffmpeg",
      [
        "-thread_queue_size",
        "512",
        "-f",
        "x11grab",
        "-video_size",
        `${this.width}x${this.height}`,
        "-framerate",
        String(this.framerate),
        "-i",
        this.displayEnv,
        ...audioArgs,
        "-c:v",
        "libx264",
        "-preset",
        this.preset,
        "-tune",
        "zerolatency",
        "-b:v",
        this.videoBitrate,
        "-maxrate",
        this.videoBitrate,
        "-bufsize",
        `${maxRate * 2}k`,
        "-pix_fmt",
        "yuv420p",
        "-g",
        String(this.framerate * 2),
        "-c:a",
        "aac",
        "-b:a",
        this.audioBitrate,
        "-f",
        "flv",
        rtmpTarget,
      ],
      {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, DISPLAY: this.displayEnv },
      },
    );

    this.ffmpegProcess.stderr?.on("data", (data: Buffer) => {
      const line = data.toString().trim();
      if (line && !line.startsWith("frame=")) {
        logger.debug(`${TAG} ffmpeg: ${line.slice(0, 200)}`);
      }
    });

    this.ffmpegProcess.on("exit", (code) => {
      logger.warn(`${TAG} FFmpeg exited with code ${code}`);
      this.ffmpegProcess = null;
    });

    this.startedAt = Date.now();

    // Give FFmpeg time to connect.
    await new Promise((resolve) => setTimeout(resolve, 3000));

    if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
      logger.info(`${TAG} FFmpeg streaming (pid: ${this.ffmpegProcess.pid})`);
    } else {
      throw new Error(`${TAG} FFmpeg failed to start`);
    }
  }

  stopFFmpeg(): void {
    if (!this.ffmpegProcess) return;

    logger.info(`${TAG} Stopping FFmpeg`);
    this.ffmpegProcess.kill("SIGTERM");

    // Force kill after 5s if SIGTERM didn't work.
    const pid = this.ffmpegProcess.pid;
    setTimeout(() => {
      if (pid && isProcessRunning(pid)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // Already dead.
        }
      }
    }, 5000);

    this.ffmpegProcess = null;
    this.startedAt = null;
  }

  // -------------------------------------------------------------------------
  // Thumbnail capture
  // -------------------------------------------------------------------------

  captureThumbnail(): Buffer | null {
    if (!isCommandAvailable("scrot")) {
      logger.debug(`${TAG} scrot not available for thumbnail capture`);
      return null;
    }

    try {
      if (existsSync(this.thumbnailPath)) unlinkSync(this.thumbnailPath);

      execFileSync("scrot", [this.thumbnailPath], {
        env: { ...process.env, DISPLAY: this.displayEnv },
        timeout: 5000,
      });

      if (!existsSync(this.thumbnailPath)) return null;

      const buf = readFileSync(this.thumbnailPath);
      unlinkSync(this.thumbnailPath);
      return buf;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`${TAG} Thumbnail capture failed: ${msg}`);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // Watchdog
  // -------------------------------------------------------------------------

  startWatchdog(onRestart?: () => Promise<void>): void {
    if (this.watchdogIntervalMs <= 0) return;
    if (this.watchdogTimer) return;

    logger.info(
      `${TAG} Watchdog started (interval: ${this.watchdogIntervalMs}ms)`,
    );

    this.watchdogTimer = setInterval(async () => {
      if (this.xvfbProcess?.pid && !isProcessRunning(this.xvfbProcess.pid)) {
        logger.warn(`${TAG} Watchdog: Xvfb died, restarting`);
        this.xvfbProcess = null;
        await this.startDisplay();
      }

      if (
        this.rtmpCredentials &&
        (!this.ffmpegProcess ||
          (this.ffmpegProcess.pid && !isProcessRunning(this.ffmpegProcess.pid)))
      ) {
        logger.warn(`${TAG} Watchdog: FFmpeg died, restarting`);
        this.ffmpegProcess = null;
        try {
          await this.startFFmpeg(this.rtmpCredentials);
          if (onRestart) await onRestart();
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          logger.error(`${TAG} Watchdog: FFmpeg restart failed: ${msg}`);
        }
      }
    }, this.watchdogIntervalMs);
  }

  stopWatchdog(): void {
    if (this.watchdogTimer) {
      clearInterval(this.watchdogTimer);
      this.watchdogTimer = null;
      logger.debug(`${TAG} Watchdog stopped`);
    }
  }

  // -------------------------------------------------------------------------
  // Full lifecycle
  // -------------------------------------------------------------------------

  async goLive(rtmp: RtmpCredentials): Promise<void> {
    const deps = this.checkDependencies();
    if (!deps.ok) {
      throw new Error(
        `${TAG} Missing required dependencies: ${deps.missing.join(", ")}. Install with: sudo apt install ${deps.missing.join(" ")}`,
      );
    }

    await this.startDisplay();
    this.startWindowManager();
    this.setupPulseAudioSink();
    await this.startFFmpeg(rtmp);
    this.startWatchdog();
  }

  shutdown(): void {
    logger.info(`${TAG} Shutting down stream pipeline`);
    this.stopWatchdog();
    this.stopFFmpeg();
    this.teardownPulseAudioSink();

    if (this.xvfbProcess) {
      this.xvfbProcess.kill("SIGTERM");
      this.xvfbProcess = null;
    }
  }
}
