/**
 * Screen Capture Native Module for Electrobun
 *
 * Graceful degradation — screen capture requires platform-specific
 * integration (ScreenCaptureKit on macOS) not yet available in Electrobun.
 * All methods return { available: false } with descriptive reasons.
 *
 * Future: ScreenCaptureKit FFI integration on macOS.
 */

type SendToWebview = (message: string, payload?: unknown) => void;

const UNAVAILABLE_REASON =
  "Screen capture requires platform-specific integration not yet available in Electrobun";

export class ScreenCaptureManager {
  private sendToWebview: SendToWebview | null = null;

  setSendToWebview(fn: SendToWebview): void {
    this.sendToWebview = fn;
  }

  async getSources() {
    return { sources: [], available: false, reason: UNAVAILABLE_REASON };
  }

  async takeScreenshot() {
    return { available: false, reason: UNAVAILABLE_REASON };
  }

  async captureWindow(_options?: { windowId?: string }) {
    return { available: false, reason: UNAVAILABLE_REASON };
  }

  async startRecording() {
    return { available: false, reason: UNAVAILABLE_REASON };
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

  async startFrameCapture(_options?: Record<string, unknown>) {
    return { available: false, reason: UNAVAILABLE_REASON };
  }

  async stopFrameCapture() {
    return { available: false };
  }

  async isFrameCaptureActive() {
    return { active: false };
  }

  async saveScreenshot(_options: { data: string; filename?: string }) {
    return { available: false };
  }

  async switchSource(_options: { sourceId: string }) {
    return { available: false };
  }

  dispose(): void {
    this.sendToWebview = null;
  }
}

let screenCaptureManager: ScreenCaptureManager | null = null;

export function getScreenCaptureManager(): ScreenCaptureManager {
  if (!screenCaptureManager) {
    screenCaptureManager = new ScreenCaptureManager();
  }
  return screenCaptureManager;
}
