/**
 * Stream Manager — macOS-compatible RTMP streaming via FFmpeg.
 *
 * Supports three input modes:
 * - "pipe": Receives JPEG frames via writeFrame() → FFmpeg stdin (image2pipe).
 *   Used for streaming Electron window contents captured with capturePage().
 * - "avfoundation": macOS screen capture via avfoundation device.
 * - "testsrc": Solid color test pattern (default fallback).
 *
 * Usage:
 *   import { streamManager } from "./services/stream-manager";
 *   await streamManager.start({ rtmpUrl, rtmpKey, inputMode: "pipe" });
 *   streamManager.writeFrame(jpegBuffer); // called from frame capture
 *   await streamManager.stop();
 *
 * @module services/stream-manager
 */

import { type ChildProcess, spawn } from "node:child_process";
import { logger } from "@elizaos/core";

const TAG = "[StreamManager]";

export interface StreamConfig {
  rtmpUrl: string;
  rtmpKey: string;
  /** FFmpeg input source. Defaults to "testsrc" (test pattern). */
  inputMode?: "testsrc" | "avfoundation" | "screen" | "pipe" | "file";
  /** avfoundation video device index (default "3" = Capture screen 0 on macOS) */
  videoDevice?: string;
  /** Path to JPEG frame file (for "file" input mode) */
  frameFile?: string;
  /** Resolution (default "1280x720") */
  resolution?: string;
  /** Video bitrate (default "2500k") */
  bitrate?: string;
  /** Frame rate (default 15) */
  framerate?: number;
}

class StreamManager {
  private ffmpeg: ChildProcess | null = null;
  private _running = false;
  private startedAt: number | null = null;
  private _frameCount = 0;

  isRunning(): boolean {
    return this._running;
  }

  getUptime(): number {
    if (!this.startedAt) return 0;
    return Math.floor((Date.now() - this.startedAt) / 1000);
  }

  getHealth() {
    return {
      running: this._running,
      ffmpegAlive:
        this.ffmpeg !== null &&
        this.ffmpeg.exitCode === null &&
        !this.ffmpeg.killed,
      uptime: this.getUptime(),
      frameCount: this._frameCount,
    };
  }

  /**
   * Write a JPEG frame to FFmpeg's stdin (only works in "pipe" mode).
   * Returns true if the frame was accepted.
   */
  writeFrame(jpegData: Buffer): boolean {
    if (!this._running || !this.ffmpeg || !this.ffmpeg.stdin) return false;
    if (this.ffmpeg.killed || this.ffmpeg.exitCode !== null) return false;

    try {
      this.ffmpeg.stdin.write(jpegData);
      this._frameCount++;
      if (this._frameCount % 150 === 0) {
        logger.info(`${TAG} Piped ${this._frameCount} frames to FFmpeg`);
      }
      return true;
    } catch {
      return false;
    }
  }

  async start(config: StreamConfig): Promise<void> {
    if (this._running) {
      logger.warn(`${TAG} Already running — stop first`);
      return;
    }

    this._frameCount = 0;
    const resolution = config.resolution || "1280x720";
    const bitrate = config.bitrate || "2500k";
    const framerate = config.framerate || 15;
    const rtmpTarget = `${config.rtmpUrl}/${config.rtmpKey}`;
    const bufsize = `${parseInt(bitrate, 10) * 2}k`;
    const mode = config.inputMode || "testsrc";

    // Build FFmpeg args based on input mode
    const inputArgs = this.buildInputArgs(config, resolution, framerate);
    const isPipe = mode === "pipe";
    const isScreenCapture = mode === "avfoundation" || mode === "screen";

    // FFmpeg arg order: all inputs first, then encoding/output options
    // FFmpeg encoding settings: libx264 veryfast, zerolatency, -g 60, -thread_queue_size 512
    const ffmpegArgs = [
      "-thread_queue_size",
      "512",
      // Inputs
      ...inputArgs,
      "-f",
      "lavfi",
      "-i",
      "anullsrc=channel_layout=stereo:sample_rate=44100",
      // Video filter: scale for screen capture
      ...(isScreenCapture
        ? ["-vf", `scale=${resolution.replace("x", ":")}:flags=fast_bilinear`]
        : []),
      // Video encoding
      ...(process.platform === "darwin"
        ? [
            "-c:v",
            "h264_videotoolbox",
            "-realtime",
            "1",
            "-b:v",
            bitrate,
            "-maxrate",
            bitrate,
            "-bufsize",
            bufsize,
          ]
        : [
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-tune",
            "zerolatency",
            "-b:v",
            bitrate,
            "-maxrate",
            bitrate,
            "-bufsize",
            bufsize,
          ]),
      "-s",
      resolution,
      "-pix_fmt",
      "yuv420p",
      "-g",
      "60",
      // Audio encoding
      "-c:a",
      "aac",
      "-b:a",
      "128k",
      // Output
      "-f",
      "flv",
      rtmpTarget,
    ];

    logger.info(
      `${TAG} Starting FFmpeg RTMP stream (mode=${mode}) to ${config.rtmpUrl}`,
    );
    logger.info(
      `${TAG} Resolution: ${resolution}, Bitrate: ${bitrate}, FPS: ${framerate}`,
    );

    // In pipe mode, FFmpeg reads from stdin; otherwise stdin is ignored
    this.ffmpeg = spawn("ffmpeg", ["-y", ...ffmpegArgs], {
      stdio: [isPipe ? "pipe" : "ignore", "pipe", "pipe"],
    });

    // Log all FFmpeg stderr for debugging
    this.ffmpeg.stderr?.on("data", (chunk: Buffer) => {
      const line = chunk.toString().trim();
      if (line) {
        console.log(`[FFmpeg] ${line}`);
      }
    });

    this.ffmpeg.on("exit", (code, signal) => {
      if (this._running) {
        logger.warn(
          `${TAG} FFmpeg exited unexpectedly (code=${code}, signal=${signal})`,
        );
        this._running = false;
        this.startedAt = null;
      }
    });

    // Handle stdin errors gracefully in pipe mode
    if (isPipe && this.ffmpeg.stdin) {
      this.ffmpeg.stdin.on("error", (err) => {
        logger.warn(`${TAG} FFmpeg stdin error: ${err.message}`);
      });
    }

    // Wait a moment to confirm it started
    await new Promise((r) => setTimeout(r, 1500));

    if (this.ffmpeg.exitCode !== null) {
      const exitCode = this.ffmpeg.exitCode;
      this.ffmpeg = null;
      throw new Error(`${TAG} FFmpeg exited immediately with code ${exitCode}`);
    }

    this._running = true;
    this.startedAt = Date.now();
    logger.info(`${TAG} FFmpeg streaming to RTMP — stream should be live`);
  }

  async stop(): Promise<{ uptime: number }> {
    const uptime = this.getUptime();

    if (this.ffmpeg && !this.ffmpeg.killed && this.ffmpeg.exitCode === null) {
      const ffmpegProc = this.ffmpeg;
      // Close stdin first in pipe mode to signal EOF
      if (ffmpegProc.stdin) {
        try {
          ffmpegProc.stdin.end();
        } catch {}
      }
      ffmpegProc.kill("SIGTERM");
      await Promise.race([
        new Promise((resolve) => ffmpegProc.on("exit", resolve)),
        new Promise((resolve) => setTimeout(resolve, 3000)),
      ]);
      if (ffmpegProc.exitCode === null) {
        ffmpegProc.kill("SIGKILL");
      }
    }

    this.ffmpeg = null;
    this._running = false;
    this.startedAt = null;
    this._frameCount = 0;
    logger.info(
      `${TAG} Stream stopped (uptime: ${uptime}s, frames: ${this._frameCount})`,
    );
    return { uptime };
  }

  private buildInputArgs(
    config: StreamConfig,
    resolution: string,
    framerate: number,
  ): string[] {
    const mode = config.inputMode || "testsrc";

    switch (mode) {
      case "pipe": {
        // Read JPEG frames from stdin via image2pipe
        // -c:v mjpeg is mandatory: image2pipe cannot auto-detect JPEG from piped data
        // -probesize/-analyzeduration eliminate the default 5MB probe buffer that
        // causes FFmpeg to stall for ~100 frames before decoding starts
        return [
          "-probesize",
          "32",
          "-analyzeduration",
          "0",
          "-f",
          "image2pipe",
          "-c:v",
          "mjpeg",
          "-framerate",
          String(framerate),
          "-i",
          "pipe:0",
        ];
      }
      case "avfoundation":
      case "screen": {
        const videoDevice = config.videoDevice || "3";
        return [
          "-f",
          "avfoundation",
          "-framerate",
          String(framerate),
          "-pixel_format",
          "nv12",
          "-capture_cursor",
          "1",
          "-i",
          `${videoDevice}:none`,
        ];
      }
      case "file": {
        // Read from a continuously-updated JPEG file (written by browser-capture).
        // -loop 1 re-reads the file each frame, -r sets the output framerate.
        // -probesize/-analyzeduration eliminate the default 5MB probe buffer,
        // -c:v mjpeg hints the codec so FFmpeg doesn't stall probing.
        const framePath = config.frameFile || "/tmp/milady-stream-frame.jpg";
        return [
          "-probesize",
          "32",
          "-analyzeduration",
          "0",
          "-loop",
          "1",
          "-f",
          "image2",
          "-c:v",
          "mjpeg",
          "-framerate",
          String(framerate),
          "-i",
          framePath,
        ];
      }
      default: {
        return [
          "-f",
          "lavfi",
          "-i",
          `color=c=0x1a1a2e:s=${resolution}:r=${framerate}`,
        ];
      }
    }
  }
}

// Module singleton
export const streamManager = new StreamManager();
