/**
 * Electrobun Renderer Bridge
 *
 * Exposes the direct Milady Electrobun RPC surface in the webview context.
 *
 * This script runs in the webview context (injected as a preload).
 * It uses `Electroview.defineRPC()` + `new Electroview()` to connect to
 * the Bun main process via the Electrobun WebSocket RPC channel.
 *
 * `window.__MILADY_ELECTROBUN_RPC__` is the only public desktop bridge exposed
 * to renderer code. It mirrors the native Electrobun RPC surface directly:
 * `request.<method>(params)` plus `onMessage(<message>, listener)`.
 */

import { Electroview } from "electrobun/view";

type RpcMessageListener = (payload: unknown) => void;
type RendererRequestHandler = (params: unknown) => Promise<unknown>;
type RendererBridgeRpc = {
  request: Record<string, RendererRequestHandler>;
};

const listenersByRpcMessage: Record<string, Set<RpcMessageListener>> = {};

// Electrobun's native layer sets these globals before preloads run.
// __electrobun must exist before Electroview.init() tries to write to it.
// If the built-in preload hasn't fired yet (rare edge case), stub it.
if (typeof window.__electrobun === "undefined") {
  (
    window as {
      __electrobun: {
        receiveMessageFromBun: (m: unknown) => void;
        receiveInternalMessageFromBun: (m: unknown) => void;
      };
    }
  ).__electrobun = {
    receiveMessageFromBun: (_m: unknown) => {},
    receiveInternalMessageFromBun: (_m: unknown) => {},
  };
}

function dispatchMessage(messageName: string, payload: unknown): void {
  if (messageName === "apiBaseUpdate") {
    const apiBaseUpdate = payload as { base: string; token?: string };
    window.__MILADY_API_BASE__ = apiBaseUpdate.base;
    if (apiBaseUpdate.token) {
      window.__MILADY_API_TOKEN__ = apiBaseUpdate.token;
    }
  }

  const listeners = listenersByRpcMessage[messageName];
  if (!listeners) {
    return;
  }

  for (const listener of Array.from(listeners)) {
    try {
      listener(payload);
    } catch (err) {
      console.error(
        `[ElectrobunBridge] Listener error for ${messageName}:`,
        err,
      );
    }
  }
}

function handleWildcardMessage(messageName: unknown, payload: unknown): void {
  if (typeof messageName === "string") {
    dispatchMessage(messageName, payload);
  }
}

const rpc = Electroview.defineRPC({
  handlers: {
    requests: {},
    messages: {
      "*": handleWildcardMessage,
    },
  },
}) as RendererBridgeRpc;

new Electroview({ rpc });

const miladyElectrobunRpc = {
  request: rpc.request,
  onMessage: (messageName: string, listener: RpcMessageListener): void => {
    if (!listenersByRpcMessage[messageName]) {
      listenersByRpcMessage[messageName] = new Set();
    }
    listenersByRpcMessage[messageName].add(listener);
  },
  offMessage: (messageName: string, listener: RpcMessageListener): void => {
    listenersByRpcMessage[messageName]?.delete(listener);
    if (listenersByRpcMessage[messageName]?.size === 0) {
      delete listenersByRpcMessage[messageName];
    }
  },
};

declare global {
  interface Window {
    __MILADY_API_BASE__: string;
    __MILADY_API_TOKEN__: string;
    __MILADY_ELECTROBUN_RPC__: typeof miladyElectrobunRpc;
  }
}

window.__MILADY_ELECTROBUN_RPC__ = miladyElectrobunRpc;
