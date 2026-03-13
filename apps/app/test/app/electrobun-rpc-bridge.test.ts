// @vitest-environment jsdom

import {
  type ElectrobunRendererRpc,
  type ElectronIpcRenderer,
  invokeDesktopBridgeRequest,
  subscribeDesktopBridgeEvent,
} from "@milady/app-core/bridge";
import { afterEach, describe, expect, it, vi } from "vitest";

type TestWindow = Window & {
  __MILADY_ELECTROBUN_RPC__?: ElectrobunRendererRpc;
  electron?: { ipcRenderer?: ElectronIpcRenderer };
};

describe("electrobun rpc bridge", () => {
  afterEach(() => {
    delete (window as TestWindow).__MILADY_ELECTROBUN_RPC__;
    delete (window as TestWindow).electron;
    vi.restoreAllMocks();
  });

  it("prefers direct Electrobun RPC requests over Electron IPC", async () => {
    const rpcRequest = vi.fn().mockResolvedValue({ ok: true });
    const ipcInvoke = vi.fn().mockResolvedValue({ ok: false });
    (window as TestWindow).__MILADY_ELECTROBUN_RPC__ = {
      request: { desktopOpenExternal: rpcRequest },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    };
    (window as TestWindow).electron = { ipcRenderer: { invoke: ipcInvoke } };

    await expect(
      invokeDesktopBridgeRequest({
        rpcMethod: "desktopOpenExternal",
        ipcChannel: "desktop:openExternal",
        params: { url: "https://example.com" },
      }),
    ).resolves.toEqual({ ok: true });

    expect(rpcRequest).toHaveBeenCalledWith({ url: "https://example.com" });
    expect(ipcInvoke).not.toHaveBeenCalled();
  });

  it("falls back to Electron IPC when direct Electrobun RPC is unavailable", async () => {
    const ipcInvoke = vi.fn().mockResolvedValue({ ok: true });
    (window as TestWindow).electron = { ipcRenderer: { invoke: ipcInvoke } };

    await expect(
      invokeDesktopBridgeRequest({
        rpcMethod: "desktopOpenExternal",
        ipcChannel: "desktop:openExternal",
        params: { url: "https://example.com" },
      }),
    ).resolves.toEqual({ ok: true });

    expect(ipcInvoke).toHaveBeenCalledWith("desktop:openExternal", {
      url: "https://example.com",
    });
  });

  it("subscribes to direct Electrobun RPC messages when available", () => {
    const listeners = new Map<string, Set<(payload: unknown) => void>>();
    (window as TestWindow).__MILADY_ELECTROBUN_RPC__ = {
      request: {},
      onMessage: vi.fn(
        (messageName: string, listener: (payload: unknown) => void) => {
          const entry = listeners.get(messageName) ?? new Set();
          entry.add(listener);
          listeners.set(messageName, entry);
        },
      ),
      offMessage: vi.fn(
        (messageName: string, listener: (payload: unknown) => void) => {
          listeners.get(messageName)?.delete(listener);
        },
      ),
    };

    const listener = vi.fn();
    const unsubscribe = subscribeDesktopBridgeEvent({
      rpcMessage: "contextMenuSaveAsCommand",
      ipcChannel: "contextMenu:saveAsCommand",
      listener,
    });

    listeners.get("contextMenuSaveAsCommand")?.forEach((fn) => {
      fn({ text: "hello" });
    });

    expect(listener).toHaveBeenCalledWith({ text: "hello" });

    unsubscribe();
    expect(listeners.get("contextMenuSaveAsCommand")?.size ?? 0).toBe(0);
  });
});
