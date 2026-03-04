/**
 * Screen Capture Native Module for Electrobun
 *
 * macOS implementation:
 * - Window listing: CoreGraphics FFI via Bun cc() (CGWindowListCopyWindowInfo)
 * - Screenshots: macOS /usr/sbin/screencapture CLI
 * - Window capture: screencapture -l <CGWindowID>
 * - Save to disk: Node fs
 *
 * Recording and frame capture require ScreenCaptureKit which needs
 * Objective-C/Swift integration — still stubbed.
 *
 * Requirements:
 * - Screen Recording permission (System Preferences > Privacy & Security)
 *   Without it, screenshots will be blank/gray.
 */

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

type SendToWebview = (message: string, payload?: unknown) => void;

const IS_MACOS = process.platform === "darwin";
const SCREENCAPTURE_BIN = "/usr/sbin/screencapture";
const RECORDING_UNAVAILABLE =
  "Recording requires ScreenCaptureKit (not yet integrated)";
const PLATFORM_UNAVAILABLE = "Screen capture is only available on macOS";
const SEP = String.fromCharCode(31); // ASCII Unit Separator

// ============================================================================
// CoreGraphics FFI (window listing)
//
// FFI approach: Window listing uses bun:ffi cc() to compile inline C that
// calls CGWindowListCopyWindowInfo. All CoreGraphics struct access (CGRect,
// CGPoint, CGSize) is handled inside the compiled C code — no Buffer.alloc
// in JS. This avoids buffer sizing pitfalls (CGRect = 4 doubles = 32 bytes,
// CGPoint = 2 doubles = 16 bytes on 64-bit macOS).
//
// Screenshots use the /usr/sbin/screencapture CLI (array-form Bun.spawn),
// NOT CoreGraphics FFI for image capture.
// ============================================================================

interface CGSymbols {
  list_windows: () => string;
}

let cgSymbols: CGSymbols | null = null;
let cgInitAttempted = false;

async function initCoreGraphicsFFI(): Promise<boolean> {
  if (cgInitAttempted) return cgSymbols !== null;
  cgInitAttempted = true;
  if (!IS_MACOS) return false;

  try {
    const { cc } = await import("bun:ffi");
    const compiled = cc({
      source: `
#include <CoreGraphics/CoreGraphics.h>
#include <CoreFoundation/CoreFoundation.h>
#include <string.h>
#include <stdio.h>

// Single static buffer — safe because Bun FFI calls are single-threaded
// (no concurrent C invocations from JS). Must not be called from multiple
// native threads simultaneously.
static char buffer[65536];

const char* list_windows(void) {
    CGWindowListOption opts = kCGWindowListOptionOnScreenOnly
                            | kCGWindowListExcludeDesktopElements;
    CFArrayRef windows = CGWindowListCopyWindowInfo(opts, kCGNullWindowID);
    if (!windows) { buffer[0] = 0; return buffer; }

    int pos = 0;
    CFIndex count = CFArrayGetCount(windows);
    for (CFIndex i = 0; i < count && pos < 64000; i++) {
        CFDictionaryRef win = (CFDictionaryRef)CFArrayGetValueAtIndex(windows, i);

        CFNumberRef numRef = (CFNumberRef)CFDictionaryGetValue(win, kCGWindowNumber);
        int wid = 0;
        if (numRef) CFNumberGetValue(numRef, kCFNumberIntType, &wid);

        char owner[256] = "";
        CFStringRef ownerRef = (CFStringRef)CFDictionaryGetValue(win, kCGWindowOwnerName);
        if (ownerRef) CFStringGetCString(ownerRef, owner, sizeof(owner), kCFStringEncodingUTF8);

        char name[256] = "";
        CFStringRef nameRef = (CFStringRef)CFDictionaryGetValue(win, kCGWindowName);
        if (nameRef) CFStringGetCString(nameRef, name, sizeof(name), kCFStringEncodingUTF8);

        if (owner[0] == 0) continue;

        pos += snprintf(buffer + pos, (int)sizeof(buffer) - pos,
            "%d%c%s%c%s\\n", wid, 31, owner, 31, name);
    }
    buffer[pos] = 0;
    CFRelease(windows);
    return buffer;
}
      `,
      flags: ["-framework CoreGraphics", "-framework CoreFoundation"],
      symbols: {
        list_windows: { args: [], returns: "cstring" },
      },
    });
    cgSymbols = compiled.symbols as unknown as CGSymbols;
    console.log("[ScreenCapture] CoreGraphics FFI initialized");
    return true;
  } catch (err) {
    console.warn("[ScreenCapture] CoreGraphics FFI failed:", err);
    return false;
  }
}

// ============================================================================
// ScreenCaptureManager
// ============================================================================

export class ScreenCaptureManager {
  private sendToWebview: SendToWebview | null = null;

  setSendToWebview(fn: SendToWebview): void {
    this.sendToWebview = fn;
  }

  async getSources() {
    if (!IS_MACOS) {
      return { sources: [], available: false, reason: PLATFORM_UNAVAILABLE };
    }

    const sources: Array<{
      id: string;
      name: string;
      thumbnail: string;
      appIcon?: string;
    }> = [{ id: "0", name: "Entire Screen", thumbnail: "" }];

    await initCoreGraphicsFFI();
    if (cgSymbols) {
      try {
        const raw = cgSymbols.list_windows();
        if (raw) {
          const seen = new Set<string>();
          for (const line of raw.split("\n")) {
            if (!line) continue;
            const parts = line.split(SEP);
            const id = parts[0];
            const owner = parts[1];
            const name = parts[2];
            if (!id || !owner) continue;
            const displayName = name ? `${owner} - ${name}` : owner;
            if (seen.has(displayName)) continue;
            seen.add(displayName);
            sources.push({ id, name: displayName, thumbnail: "" });
          }
        }
      } catch {
        // FFI call failed — return screen-only list
      }
    }

    return { sources, available: true };
  }

  async takeScreenshot() {
    if (!IS_MACOS) {
      return { available: false, reason: PLATFORM_UNAVAILABLE };
    }

    try {
      const tmpFile = path.join(
        os.tmpdir(),
        `milady-screenshot-${Date.now()}.png`,
      );
      // SAFE: array-form Bun.spawn — no shell interpolation
      const proc = Bun.spawn([SCREENCAPTURE_BIN, "-x", "-t", "png", tmpFile], {
        stdout: "pipe",
        stderr: "pipe",
      });
      await proc.exited;

      if (proc.exitCode !== 0 || !fs.existsSync(tmpFile)) {
        return {
          available: false,
          reason: "screencapture failed — check Screen Recording permission",
        };
      }

      const data = fs.readFileSync(tmpFile);
      fs.unlinkSync(tmpFile);
      return {
        available: true,
        data: `data:image/png;base64,${data.toString("base64")}`,
      };
    } catch (err) {
      return { available: false, reason: String(err) };
    }
  }

  async captureWindow(options?: { windowId?: string }) {
    if (!IS_MACOS) {
      return { available: false, reason: PLATFORM_UNAVAILABLE };
    }

    try {
      const tmpFile = path.join(os.tmpdir(), `milady-window-${Date.now()}.png`);
      // SAFE: array-form Bun.spawn — no shell interpolation
      const args = [SCREENCAPTURE_BIN, "-x", "-t", "png"];
      if (options?.windowId) {
        // Sanitize windowId: CGWindowID is a numeric value — reject non-numeric input
        const sanitizedId = options.windowId.replace(/[^0-9]/g, "");
        if (!sanitizedId) {
          return {
            available: false,
            reason: "Invalid windowId — must be numeric",
          };
        }
        args.push("-l", sanitizedId);
      }
      args.push(tmpFile);

      const proc = Bun.spawn(args, { stdout: "pipe", stderr: "pipe" });
      await proc.exited;

      if (proc.exitCode !== 0 || !fs.existsSync(tmpFile)) {
        return {
          available: false,
          reason:
            "Window capture failed — invalid windowId or permission denied",
        };
      }

      const data = fs.readFileSync(tmpFile);
      fs.unlinkSync(tmpFile);
      return {
        available: true,
        data: `data:image/png;base64,${data.toString("base64")}`,
      };
    } catch (err) {
      return { available: false, reason: String(err) };
    }
  }

  // --- Recording (needs ScreenCaptureKit) ---

  async startRecording() {
    return { available: false, reason: RECORDING_UNAVAILABLE };
  }

  async stopRecording() {
    return { available: false };
  }

  async pauseRecording() {
    return { available: false };
  }

  async resumeRecording() {
    return { available: false };
  }

  async getRecordingState() {
    return { recording: false, duration: 0, paused: false };
  }

  // --- Frame capture (needs ScreenCaptureKit) ---

  async startFrameCapture(_options?: Record<string, unknown>) {
    return { available: false, reason: RECORDING_UNAVAILABLE };
  }

  async stopFrameCapture() {
    return { available: false };
  }

  async isFrameCaptureActive() {
    return { active: false };
  }

  // --- Save ---

  async saveScreenshot(options: { data: string; filename?: string }) {
    try {
      // Sanitize filename: strip path separators and restrict to safe characters
      const rawName = options.filename ?? `milady-screenshot-${Date.now()}.png`;
      const baseName = path.basename(rawName);
      const safeName = baseName.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filename = safeName || `milady-screenshot-${Date.now()}.png`;
      const savePath = path.join(os.homedir(), "Pictures", filename);
      const dir = path.dirname(savePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      let base64Data = options.data;
      const match = base64Data.match(/^data:[^;]+;base64,(.+)$/);
      if (match) base64Data = match[1];

      fs.writeFileSync(savePath, Buffer.from(base64Data, "base64"));
      return { available: true, path: savePath };
    } catch {
      return { available: false };
    }
  }

  async switchSource(_options: { sourceId: string }) {
    // TODO: implement actual source switching via ScreenCaptureKit
    return { available: false };
  }

  dispose(): void {
    // No-op; retained for interface compatibility
  }
}

let screenCaptureManager: ScreenCaptureManager | null = null;

export function getScreenCaptureManager(): ScreenCaptureManager {
  if (!screenCaptureManager) {
    screenCaptureManager = new ScreenCaptureManager();
  }
  return screenCaptureManager;
}
