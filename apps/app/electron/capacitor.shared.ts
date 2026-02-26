import type { CapacitorConfig } from "@capacitor/cli";

export const sharedCapacitorConfig: CapacitorConfig = {
  appId: "com.miladyai.milady",
  appName: "Milady",
  webDir: "dist",
  server: {
    androidScheme: "https",
    iosScheme: "https",
    // Allow the webview to connect to the embedded API server on localhost/loopback
    allowNavigation: ["localhost", "127.0.0.1"],
  },
  plugins: {
    Keyboard: {
      resize: "body",
      resizeOnFullScreen: true,
    },
    StatusBar: {
      style: "dark",
      backgroundColor: "#0a0a0a",
    },
  },
  ios: {
    contentInset: "automatic",
    preferredContentMode: "mobile",
    backgroundColor: "#0a0a0a",
    allowsLinkPreview: false,
  },
  android: {
    backgroundColor: "#0a0a0a",
    allowMixedContent: false,
    captureInput: true,
    webContentsDebuggingEnabled: false,
  },
};
