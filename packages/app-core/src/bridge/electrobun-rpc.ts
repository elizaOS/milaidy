export type ElectrobunRequestHandler = (params?: unknown) => Promise<unknown>;

export type ElectrobunMessageListener = (payload: unknown) => void;

export interface ElectrobunRendererRpc {
  request: Record<string, ElectrobunRequestHandler>;
  onMessage: (messageName: string, listener: ElectrobunMessageListener) => void;
  offMessage: (
    messageName: string,
    listener: ElectrobunMessageListener,
  ) => void;
}

export interface ElectronIpcRenderer {
  invoke: (channel: string, params?: unknown) => Promise<unknown>;
  on?: (
    channel: string,
    listener: (event: unknown, payload: unknown) => void,
  ) => void;
  removeListener?: (
    channel: string,
    listener: (event: unknown, payload: unknown) => void,
  ) => void;
  removeAllListeners?: (channel: string) => void;
}

interface DesktopBridgeWindow extends Window {
  __MILADY_ELECTROBUN_RPC__?: ElectrobunRendererRpc;
  electron?: {
    ipcRenderer?: ElectronIpcRenderer;
  };
}

function getDesktopBridgeWindow(): DesktopBridgeWindow | null {
  if (typeof window === "undefined") {
    return null;
  }

  return window as DesktopBridgeWindow;
}

export function getElectrobunRendererRpc(): ElectrobunRendererRpc | undefined {
  return getDesktopBridgeWindow()?.__MILADY_ELECTROBUN_RPC__;
}

export function getElectronIpcRenderer(): ElectronIpcRenderer | undefined {
  return getDesktopBridgeWindow()?.electron?.ipcRenderer;
}

export async function invokeDesktopBridgeRequest<T>(options: {
  rpcMethod: string;
  ipcChannel: string;
  params?: unknown;
}): Promise<T | null> {
  const rpc = getElectrobunRendererRpc();
  const request = rpc?.request?.[options.rpcMethod];
  if (request) {
    return (await request(options.params)) as T;
  }

  const ipc = getElectronIpcRenderer();
  if (ipc) {
    return (await ipc.invoke(options.ipcChannel, options.params)) as T;
  }

  return null;
}

export function subscribeDesktopBridgeEvent(options: {
  rpcMessage: string;
  ipcChannel: string;
  listener: ElectrobunMessageListener;
}): () => void {
  const rpc = getElectrobunRendererRpc();
  if (rpc) {
    rpc.onMessage(options.rpcMessage, options.listener);
    return () => {
      rpc.offMessage(options.rpcMessage, options.listener);
    };
  }

  const ipc = getElectronIpcRenderer();
  if (!ipc?.on) {
    return () => {};
  }

  const ipcListener = (_event: unknown, payload: unknown) => {
    options.listener(payload);
  };

  ipc.on(options.ipcChannel, ipcListener);

  return () => {
    if (ipc.removeListener) {
      ipc.removeListener(options.ipcChannel, ipcListener);
      return;
    }

    ipc.removeAllListeners?.(options.ipcChannel);
  };
}
