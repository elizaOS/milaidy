/**
 * Camera Native Module for Electrobun
 *
 * Camera access in Electrobun uses getUserMedia directly in the renderer
 * WebView (WKWebKit supports it on macOS). The Bun side only manages
 * permission status — actual capture happens client-side.
 */

type SendToWebview = (message: string, payload?: unknown) => void;

export class CameraManager {
  setSendToWebview(fn: SendToWebview): void {
    this.sendToWebview = fn;
  }

  async getDevices() {
    // Renderer uses navigator.mediaDevices.enumerateDevices() directly
    return { devices: [], available: true };
  }

  async startPreview(_options?: { deviceId?: string }) {
    // Renderer handles getUserMedia directly
    return { available: true };
  }

  async stopPreview() {}

  async switchCamera(_options: { deviceId: string }) {
    return { available: true };
  }

  async capturePhoto() {
    // Renderer captures via canvas.toDataURL()
    return { available: true };
  }

  async startRecording() {
    // Renderer uses MediaRecorder API
    return { available: true };
  }

  async stopRecording() {
    return { available: true };
  }

  async getRecordingState() {
    return { recording: false, duration: 0 };
  }

  async checkPermissions() {
    return { status: "prompt" };
  }

  async requestPermissions() {
    return { status: "prompt" };
  }

  dispose(): void {
    this.sendToWebview = null;
  }
}

let cameraManager: CameraManager | null = null;

export function getCameraManager(): CameraManager {
  if (!cameraManager) {
    cameraManager = new CameraManager();
  }
  return cameraManager;
}
