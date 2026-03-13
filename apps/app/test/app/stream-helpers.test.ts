// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { toggleAlwaysOnTop } from "../../src/components/stream/helpers";

type TestWindow = Window & {
  electron?: {
    ipcRenderer?: {
      invoke: (channel: string, params?: unknown) => Promise<unknown>;
    };
  };
};

describe("toggleAlwaysOnTop", () => {
  afterEach(() => {
    delete (window as typeof window & { Capacitor?: unknown }).Capacitor;
    delete (window as TestWindow).electron;
    vi.restoreAllMocks();
  });

  it("uses the Electrobun ipcRenderer fallback", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    (window as TestWindow).electron = { ipcRenderer: { invoke } };

    await expect(toggleAlwaysOnTop(true)).resolves.toBe(true);

    expect(invoke).toHaveBeenCalledWith("desktop:setAlwaysOnTop", {
      flag: true,
    });
  });
});
