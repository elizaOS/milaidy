export interface ElectrobunRendererRpc {
  request?: Record<string, (params?: unknown) => Promise<unknown> | unknown>;
  onMessage: (event: string, listener: (payload: unknown) => void) => void;
  offMessage: (event: string, listener: (payload: unknown) => void) => void;
}

interface RuntimeWindow extends Window {
  __ELIZA_ELECTROBUN_RPC__?: ElectrobunRendererRpc;
  __MILADY_ELECTROBUN_RPC__?: ElectrobunRendererRpc;
  __electrobunWindowId?: number;
  __electrobunWebviewId?: number;
}

function getRuntimeWindow(): RuntimeWindow | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window as RuntimeWindow;
}

export function getElectrobunRendererRpc(): ElectrobunRendererRpc | null {
  const runtimeWindow = getRuntimeWindow();
  return (
    runtimeWindow?.__ELIZA_ELECTROBUN_RPC__ ??
    runtimeWindow?.__MILADY_ELECTROBUN_RPC__ ??
    null
  );
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
  return isElectrobunRuntime() ? 180_000 : 30_000;
}

export async function invokeDesktopBridgeRequest<T = unknown>(options: {
  rpcMethod: string;
  params?: unknown;
}): Promise<T | null> {
  const request = getElectrobunRendererRpc()?.request?.[options.rpcMethod];
  if (!request) {
    return null;
  }

  return (await request(options.params)) as T;
}

export function subscribeDesktopBridgeEvent(options: {
  rpcMessage: string;
  listener: (payload: unknown) => void;
}): () => void {
  const rpc = getElectrobunRendererRpc();
  if (!rpc) {
    return () => {};
  }

  rpc.onMessage(options.rpcMessage, options.listener);
  return () => {
    rpc.offMessage(options.rpcMessage, options.listener);
  };
}

export function initializeCapacitorBridge(): void {}

export async function initializeStorageBridge(): Promise<void> {}

export async function scanProviderCredentials(): Promise<unknown[]> {
  return [];
}
