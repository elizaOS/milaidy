/**
 * FFmpeg + Xvfb stream manager for retake.tv.
 *
 * Manages the full headless video pipeline:
 *   Xvfb (virtual display) → FFmpeg (capture + encode) → RTMP (retake.tv)
 *
 * When PulseAudio is available, creates a virtual audio sink so TTS audio
 * can be mixed into the stream. Falls back to silent audio otherwise.
 *
 * Also handles thumbnail capture via scrot and automatic recovery via
 * a watchdog interval.
 *
 * @see https://retake.tv/skill.md §4 "FFmpeg Headless Streaming"
 */

import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { logger } from "@elizaos/core";
import type { RtmpCredentials, StreamManagerOptions } from "./types.js";

const TAG = "[retake-tv:stream]";

const PULSE_SINK_NAME = "retake_tts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type StreamManagerState = {
  isStreaming: boolean;
  hasAudio: boolean;
  display: number;
  xvfbPid: number | null;
  ffmpegPid: number | null;
  startedAt: number | null;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isCommandAvailable(cmd: string): boolean {
  try {
    execSync(`which ${cmd}`, { stdio: "ignore" });
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

  private xvfbProcess: ChildProcess | null = null;
  private ffmpegProcess: ChildProcess | null = null;
  private watchdogTimer: ReturnType<typeof setInterval> | null = null;
  private rtmpCredentials: RtmpCredentials | null = null;
  private startedAt: number | null = null;

  /** Whether PulseAudio virtual sink is active for TTS audio. */
  private pulseAudioReady = false;
  /** PulseAudio module index for cleanup. */
  private pulseSinkModuleId: number | null = null;

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
  }

  get displayEnv(): string {
    return `:${this.display}`;
  }

  /** Whether TTS audio can be routed into the stream. */
  get hasAudio(): boolean {
    return this.pulseAudioReady;
  }

  getState(): StreamManagerState {
    return {
      isStreaming: this.ffmpegProcess !== null && !this.ffmpegProcess.killed,
      hasAudio: this.pulseAudioReady,
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
    const optional = ["scrot", "xterm", "openbox", "pactl", "paplay"];
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
  // PulseAudio — virtual audio sink for TTS
  // -------------------------------------------------------------------------

  /**
   * Create a PulseAudio virtual sink so TTS audio can be captured by FFmpeg.
   *
   * Pipeline: TTS → paplay --device=retake_tts → FFmpeg -f pulse -i retake_tts.monitor → RTMP
   *
   * If PulseAudio isn't available, the stream falls back to silent audio.
   */
  setupPulseAudioSink(): boolean {
    if (!isCommandAvailable("pactl")) {
      logger.debug(`${TAG} pactl not available, audio will be silent`);
      return false;
    }

    try {
      // Check if sink already exists
      const sinks = execSync("pactl list short sinks", {
        encoding: "utf-8",
        timeout: 3000,
      });
      if (sinks.includes(PULSE_SINK_NAME)) {
        logger.info(
          `${TAG} PulseAudio sink "${PULSE_SINK_NAME}" already exists`,
        );
        this.pulseAudioReady = true;
        return true;
      }

      // Create virtual null sink
      const output = execSync(
        `pactl load-module module-null-sink sink_name=${PULSE_SINK_NAME} sink_properties=device.description="Retake_TTS_Audio"`,
        { encoding: "utf-8", timeout: 3000 },
      ).trim();

      this.pulseSinkModuleId = Number.parseInt(output, 10);
      this.pulseAudioReady = true;

      logger.info(
        `${TAG} PulseAudio virtual sink created: ${PULSE_SINK_NAME} (module ${this.pulseSinkModuleId})`,
      );
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn(`${TAG} PulseAudio setup failed: ${msg}`);
      this.pulseAudioReady = false;
      return false;
    }
  }

  /** Remove the PulseAudio virtual sink. */
  teardownPulseAudioSink(): void {
    if (this.pulseSinkModuleId !== null) {
      try {
        execSync(`pactl unload-module ${this.pulseSinkModuleId}`, {
          stdio: "ignore",
          timeout: 3000,
        });
        logger.debug(`${TAG} PulseAudio sink removed`);
      } catch {
        // Best-effort
      }
      this.pulseSinkModuleId = null;
    }
    this.pulseAudioReady = false;
  }

  // -------------------------------------------------------------------------
  // TTS audio playback into the stream
  // -------------------------------------------------------------------------

  /**
   * Play an audio buffer through the virtual PulseAudio sink so FFmpeg
   * captures it into the RTMP stream.
   *
   * Accepts MP3, WAV, or OGG audio. Writes to a temp file and plays
   * via paplay (WAV) or ffplay/ffmpeg decode → paplay.
   *
   * Fire-and-forget — returns immediately, audio plays in background.
   */
  playAudio(audioBuffer: Buffer, format: "mp3" | "wav" | "ogg" = "mp3"): void {
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

    // For WAV we can use paplay directly. For MP3/OGG, use ffmpeg to
    // decode to raw PCM and pipe into paplay, or use ffplay.
    let proc: ChildProcess;

    if (format === "wav" && isCommandAvailable("paplay")) {
      proc = spawn("paplay", [`--device=${PULSE_SINK_NAME}`, tmpFile], {
        stdio: "ignore",
        detached: true,
      });
    } else {
      // Use ffmpeg to decode any format → play through pulse sink
      proc = spawn(
        "ffmpeg",
        ["-i", tmpFile, "-f", "pulse", "-device", PULSE_SINK_NAME, "-"],
        { stdio: "ignore", detached: true },
      );
    }

    proc.unref();

    proc.on("exit", () => {
      // Clean up temp file
      try {
        if (existsSync(tmpFile)) unlinkSync(tmpFile);
      } catch {
        // Best-effort cleanup
      }
    });
  }

  // -------------------------------------------------------------------------
  // Xvfb — virtual display
  // -------------------------------------------------------------------------

  async startDisplay(): Promise<void> {
    if (this.xvfbProcess && !this.xvfbProcess.killed) {
      logger.debug(`${TAG} Xvfb already running on :${this.display}`);
      return;
    }

    // Check if something else is already using this display
    try {
      execSync(`xdpyinfo -display :${this.display}`, { stdio: "ignore" });
      logger.info(`${TAG} Display :${this.display} already active, reusing`);
      return;
    } catch {
      // Display not active, we'll start it
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

    // Give Xvfb time to initialize
    await new Promise((resolve) => setTimeout(resolve, 1500));

    logger.info(`${TAG} Xvfb started (pid: ${this.xvfbProcess.pid})`);
  }

  // -------------------------------------------------------------------------
  // Window manager + content window (optional)
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

  /**
   * Spawn a terminal window on the virtual display.
   * Useful for rendering text content that FFmpeg will capture.
   */
  spawnTerminal(command?: string): ChildProcess | null {
    if (!isCommandAvailable("xterm")) {
      logger.debug(`${TAG} xterm not available`);
      return null;
    }

    const args = [
      "-fa",
      "Monospace",
      "-fs",
      "12",
      "-bg",
      "black",
      "-fg",
      "#00ff00",
      "-geometry",
      "160x45+0+0",
    ];

    if (command) {
      args.push("-e", command);
    }

    const proc = spawn("xterm", args, {
      stdio: "ignore",
      detached: true,
      env: { ...process.env, DISPLAY: this.displayEnv },
    });
    proc.unref();

    logger.debug(`${TAG} xterm spawned (pid: ${proc.pid})`);
    return proc;
  }

  // -------------------------------------------------------------------------
  // FFmpeg — capture + RTMP push
  // -------------------------------------------------------------------------

  /**
   * Build FFmpeg audio input args.
   * If PulseAudio sink is available, capture from it.
   * Otherwise, use silent audio (anullsrc).
   */
  private buildAudioInputArgs(): string[] {
    if (this.pulseAudioReady) {
      return ["-f", "pulse", "-i", `${PULSE_SINK_NAME}.monitor`];
    }
    // Silent audio fallback
    return [
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
    ];
  }

  async startFFmpeg(rtmp: RtmpCredentials): Promise<void> {
    if (this.ffmpegProcess && !this.ffmpegProcess.killed) {
      logger.warn(`${TAG} FFmpeg already running, stopping first`);
      this.stopFFmpeg();
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    this.rtmpCredentials = rtmp;
    const rtmpTarget = `${rtmp.url}/${rtmp.key}`;

    const audioSource = this.pulseAudioReady
      ? `PulseAudio sink "${PULSE_SINK_NAME}"`
      : "silent (anullsrc)";
    logger.info(`${TAG} Starting FFmpeg stream (audio: ${audioSource})`);

    const audioArgs = this.buildAudioInputArgs();

    this.ffmpegProcess = spawn(
      "ffmpeg",
      [
        // X11 grab input
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
        // Audio input (PulseAudio or silent)
        ...audioArgs,
        // Video encoding
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
        `${Number.parseInt(this.videoBitrate, 10) * 2}k`,
        "-pix_fmt",
        "yuv420p",
        "-g",
        String(this.framerate * 2),
        // Audio encoding
        "-c:a",
        "aac",
        "-b:a",
        this.audioBitrate,
        // Output
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

    // Give FFmpeg time to connect
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

    // Force kill after 5s if SIGTERM didn't work
    const pid = this.ffmpegProcess.pid;
    setTimeout(() => {
      if (pid && isProcessRunning(pid)) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          // Already dead
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
      // Remove stale file
      if (existsSync(this.thumbnailPath)) unlinkSync(this.thumbnailPath);

      execSync(`scrot ${this.thumbnailPath}`, {
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
  // Watchdog — auto-recovery
  // -------------------------------------------------------------------------

  startWatchdog(onRestart?: () => Promise<void>): void {
    if (this.watchdogIntervalMs <= 0) return;
    if (this.watchdogTimer) return;

    logger.info(
      `${TAG} Watchdog started (interval: ${this.watchdogIntervalMs}ms)`,
    );

    this.watchdogTimer = setInterval(async () => {
      // Check Xvfb
      if (this.xvfbProcess?.pid && !isProcessRunning(this.xvfbProcess.pid)) {
        logger.warn(`${TAG} Watchdog: Xvfb died, restarting`);
        this.xvfbProcess = null;
        await this.startDisplay();
      }

      // Check FFmpeg
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

  /**
   * Full go-live sequence:
   * 1. Start virtual display
   * 2. Start window manager
   * 3. Set up PulseAudio virtual sink (if available)
   * 4. Start FFmpeg with RTMP credentials
   * 5. Start watchdog
   */
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

  /**
   * Full shutdown:
   * 1. Stop watchdog
   * 2. Stop FFmpeg
   * 3. Teardown PulseAudio sink
   * 4. Stop Xvfb
   */
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
