/**
 * WebGPU Browser Support — cross-platform detection and lifecycle.
 *
 * Determines whether WebGPU is available in the current Electrobun
 * renderer (WKWebView on macOS, CEF on Linux/Windows), locates
 * Chrome Beta when needed, and provides download URLs.
 *
 * On macOS 26+, WKWebView exposes `navigator.gpu` natively.
 * On Linux and Windows, CEF needs `--enable-unsafe-webgpu` and
 * potentially Vulkan flags, which require upstream Electrobun support.
 * As a fallback, Chrome Beta can be used for WebGPU testing.
 */

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WebGpuSupportStatus {
  /** Whether WebGPU is expected to be available in the webview renderer. */
  available: boolean;
  /** Human-readable explanation of the status. */
  reason: string;
  /** Which renderer backend is active (native = WKWebView, cef = Chromium). */
  renderer: "native" | "cef" | "unknown";
  /** Path to Chrome Beta if found on disk. */
  chromeBetaPath: string | null;
  /** URL to download Chrome Beta for this platform. */
  downloadUrl: string | null;
}

export interface ChromeBetaDetection {
  /** Whether Chrome Beta was found on disk. */
  found: boolean;
  /** Absolute path to the Chrome Beta executable, or null. */
  path: string | null;
  /** Platform-specific download URL for Chrome Beta. */
  downloadUrl: string;
}

// ---------------------------------------------------------------------------
// Chrome Beta Detection
// ---------------------------------------------------------------------------

const CHROME_BETA_PATHS: Record<string, string[]> = {
  darwin: [
    "/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta",
  ],
  linux: [
    "/usr/bin/google-chrome-beta",
    "/opt/google/chrome-beta/google-chrome-beta",
  ],
  win32: [
    // %LOCALAPPDATA%\Google\Chrome Beta\Application\chrome.exe
    path.join(
      process.env.LOCALAPPDATA ?? "",
      "Google",
      "Chrome Beta",
      "Application",
      "chrome.exe",
    ),
    // Fallback for x86 program files
    path.join(
      process.env.PROGRAMFILES ?? "C:\\Program Files",
      "Google",
      "Chrome Beta",
      "Application",
      "chrome.exe",
    ),
    path.join(
      process.env["PROGRAMFILES(X86)"] ?? "C:\\Program Files (x86)",
      "Google",
      "Chrome Beta",
      "Application",
      "chrome.exe",
    ),
  ],
};

const CHROME_BETA_DOWNLOAD_URLS: Record<string, string> = {
  darwin: "https://www.google.com/chrome/beta/",
  linux: "https://www.google.com/chrome/beta/",
  win32: "https://www.google.com/chrome/beta/",
};

/**
 * Locate Chrome Beta on the current platform.
 */
export function detectChromeBeta(): ChromeBetaDetection {
  const platform = process.platform;
  const candidates = CHROME_BETA_PATHS[platform] ?? [];
  const downloadUrl =
    CHROME_BETA_DOWNLOAD_URLS[platform] ??
    "https://www.google.com/chrome/beta/";

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return { found: true, path: candidate, downloadUrl };
      }
    } catch {
      // Permission errors etc. — try next candidate
    }
  }

  return { found: false, path: null, downloadUrl };
}

/**
 * Returns the platform-specific download URL for Chrome Beta.
 */
export function getChromeBetaDownloadUrl(): string {
  return (
    CHROME_BETA_DOWNLOAD_URLS[process.platform] ??
    "https://www.google.com/chrome/beta/"
  );
}

// ---------------------------------------------------------------------------
// WebGPU Chromium Flags (for CEF / Chrome Beta)
// ---------------------------------------------------------------------------

/**
 * Returns the Chromium command-line flags needed to enable WebGPU.
 * These are only applicable to CEF or Chrome Beta — WKWebView does
 * not use Chromium flags.
 */
export function getWebGpuChromiumFlags(): string[] {
  const flags = ["--enable-unsafe-webgpu"];

  if (process.platform === "linux") {
    flags.push("--enable-features=Vulkan");
    flags.push("--use-angle=vulkan");
  }

  return flags;
}

// ---------------------------------------------------------------------------
// macOS Version Detection
// ---------------------------------------------------------------------------

/**
 * Returns the macOS major version (e.g. 26 for macOS 26 Tahoe).
 * Returns null if not on macOS or version cannot be determined.
 */
export function getMacOSMajorVersion(): number | null {
  if (process.platform !== "darwin") return null;
  try {
    const release = os.release(); // e.g. "25.0.0" for macOS 26
    const darwinMajor = Number.parseInt(release.split(".")[0], 10);
    if (Number.isNaN(darwinMajor)) return null;
    // Darwin kernel version = macOS version + 9 (approximately)
    // Darwin 25 = macOS 26 (Tahoe), Darwin 24 = macOS 15 (Sequoia wait that's wrong)
    // Actually: Darwin 20 = macOS 11, Darwin 21 = macOS 12, Darwin 22 = macOS 13,
    //           Darwin 23 = macOS 14, Darwin 24 = macOS 15, Darwin 25 = macOS 26
    // The offset is darwinMajor - 9 for macOS 11+
    if (darwinMajor >= 20) {
      return darwinMajor - 9;
    }
    // Older versions aren't relevant for WebGPU
    return null;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Main API
// ---------------------------------------------------------------------------

/**
 * Check WebGPU support for the current platform and renderer.
 *
 * @param rendererType - The active renderer ("native" for WKWebView, "cef" for Chromium)
 */
export function checkWebGpuSupport(
  rendererType: "native" | "cef" = process.platform === "darwin"
    ? "native"
    : "cef",
): WebGpuSupportStatus {
  const chromeBeta = detectChromeBeta();

  // macOS with WKWebView (native renderer)
  if (process.platform === "darwin" && rendererType === "native") {
    const macVersion = getMacOSMajorVersion();

    if (macVersion !== null && macVersion >= 26) {
      return {
        available: true,
        reason:
          "WebGPU is natively supported in WKWebView on macOS 26+ (Tahoe).",
        renderer: "native",
        chromeBetaPath: chromeBeta.path,
        downloadUrl: null,
      };
    }

    // macOS < 26 — WKWebView doesn't support WebGPU
    return {
      available: false,
      reason: `macOS ${macVersion ?? "unknown"} does not support WebGPU in WKWebView. macOS 26+ (Tahoe) is required.`,
      renderer: "native",
      chromeBetaPath: chromeBeta.path,
      downloadUrl: chromeBeta.downloadUrl,
    };
  }

  // Linux / Windows with CEF
  if (rendererType === "cef") {
    // CEF needs --enable-unsafe-webgpu which we can't inject yet
    // (upstream Electrobun feature needed)
    const flags = getWebGpuChromiumFlags();
    const flagList = flags.join(", ");

    return {
      available: false,
      reason: `CEF renderer requires WebGPU flags (${flagList}) which need upstream Electrobun support. ${chromeBeta.found ? "Chrome Beta is available as a fallback." : "Chrome Beta is not installed."}`,
      renderer: "cef",
      chromeBetaPath: chromeBeta.path,
      downloadUrl: chromeBeta.found ? null : chromeBeta.downloadUrl,
    };
  }

  // Unknown / fallback
  return {
    available: false,
    reason: "Unable to determine WebGPU support for this configuration.",
    renderer: "unknown",
    chromeBetaPath: chromeBeta.path,
    downloadUrl: chromeBeta.downloadUrl,
  };
}
