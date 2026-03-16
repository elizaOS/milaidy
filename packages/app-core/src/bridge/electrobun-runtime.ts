interface ElectrobunBrowserWindow extends Window {
  __electrobunWindowId?: number;
  __electrobunWebviewId?: number;
  __electrobun?: unknown;
  __MILADY_ELECTROBUN_RPC__?: unknown;
}

function getRuntimeWindow(): ElectrobunBrowserWindow | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window as ElectrobunBrowserWindow;
}

export function isElectrobunRuntime(): boolean {
  const runtimeWindow = getRuntimeWindow();
  if (!runtimeWindow) {
    return false;
  }

  return (
    typeof runtimeWindow.__electrobunWindowId === "number" ||
    typeof runtimeWindow.__electrobunWebviewId === "number"
  );
}

export function getBackendStartupTimeoutMs(): number {
  const runtimeWindow = getRuntimeWindow();
  if (
    isElectrobunRuntime() ||
    (runtimeWindow &&
      (typeof runtimeWindow.__electrobun !== "undefined" ||
        typeof runtimeWindow.__MILADY_ELECTROBUN_RPC__ !== "undefined"))
  ) {
    return 180_000;
  }
  return 60_000;
}
