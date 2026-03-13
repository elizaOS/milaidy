// @vitest-environment jsdom

import type { ElectrobunRendererRpc } from "@milady/app-core/bridge";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DesktopElectron } from "../../plugins/desktop/electron/src/index.ts";

type TestWindow = Window & {
  __MILADY_ELECTROBUN_RPC__?: ElectrobunRendererRpc;
};

describe("DesktopElectron desktop bridge", () => {
  afterEach(() => {
    delete (window as TestWindow).__MILADY_ELECTROBUN_RPC__;
    vi.restoreAllMocks();
  });

  it("prefers direct Electrobun RPC for desktop requests", async () => {
    const desktopGetVersion = vi.fn().mockResolvedValue({
      version: "1.2.3",
      name: "Milady",
      runtime: "electrobun",
    });
    (window as TestWindow).__MILADY_ELECTROBUN_RPC__ = {
      request: {
        desktopGetVersion,
      },
      onMessage: vi.fn(),
      offMessage: vi.fn(),
    };

    const plugin = new DesktopElectron();
    await expect(plugin.getVersion()).resolves.toEqual({
      version: "1.2.3",
      name: "Milady",
      electron: "electrobun",
      chrome: "N/A",
      node: "N/A",
    });

    expect(desktopGetVersion).toHaveBeenCalledWith(undefined);
  });

  it("subscribes window events through direct Electrobun RPC when available", async () => {
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

    const plugin = new DesktopElectron();
    const focusListener = vi.fn();
    await plugin.addListener("windowFocus", focusListener);

    listeners.get("desktopWindowFocus")?.forEach((listener) => {
      listener(undefined);
    });

    expect(focusListener).toHaveBeenCalledWith(undefined);
  });

  it("throws when desktop-only requests are called without direct Electrobun RPC", async () => {
    const plugin = new DesktopElectron();
    await expect(plugin.beep()).rejects.toThrow(
      "beep is not available: Electron IPC bridge not found.",
    );
  });

  it("does not emit unsupported desktop events without direct Electrobun RPC", async () => {
    const plugin = new DesktopElectron();
    const suspendListener = vi.fn();
    await plugin.addListener("powerSuspend", suspendListener);

    expect(suspendListener).not.toHaveBeenCalled();
  });
});
