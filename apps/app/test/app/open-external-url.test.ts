// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { openExternalUrl } from "../../src/utils/openExternalUrl";

type TestWindow = Window & {
  electron?: {
    ipcRenderer?: {
      invoke: (channel: string, params?: unknown) => Promise<unknown>;
    };
  };
};

describe("openExternalUrl", () => {
  afterEach(() => {
    delete (window as TestWindow).electron;
    vi.restoreAllMocks();
  });

  it("uses the Electrobun desktop bridge when available", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    (window as TestWindow).electron = { ipcRenderer: { invoke } };
    const openSpy = vi.spyOn(window, "open");

    await openExternalUrl("https://claude.ai");

    expect(invoke).toHaveBeenCalledWith("desktop:openExternal", {
      url: "https://claude.ai",
    });
    expect(openSpy).not.toHaveBeenCalled();
  });

  it("falls back to window.open on web", async () => {
    const popup = {} as Window;
    const openSpy = vi.spyOn(window, "open").mockReturnValue(popup);

    await expect(openExternalUrl("https://platform.openai.com")).resolves.toBe(
      undefined,
    );

    expect(openSpy).toHaveBeenCalledWith(
      "https://platform.openai.com",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("throws when the browser blocks the fallback popup", async () => {
    vi.spyOn(window, "open").mockReturnValue(null);

    await expect(openExternalUrl("https://claude.ai")).rejects.toThrow(
      "Popup blocked. Allow popups and try again.",
    );
  });
});
