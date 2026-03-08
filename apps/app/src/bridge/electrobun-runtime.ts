interface ElectrobunBrowserWindow extends Window {
  __ELECTROBUN__?: boolean;
  __MILADY_RUNTIME__?: string;
  __electrobunWindowId?: number;
  __electrobunWebviewId?: number;
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
    runtimeWindow.__ELECTROBUN__ === true ||
    runtimeWindow.__MILADY_RUNTIME__ === "electrobun" ||
    typeof runtimeWindow.__electrobunWindowId === "number" ||
    typeof runtimeWindow.__electrobunWebviewId === "number"
  );
}

export function getBackendStartupTimeoutMs(): number {
  return isElectrobunRuntime() ? 180_000 : 30_000;
}
