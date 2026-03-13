// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { copyTextToClipboard } from "../../src/utils/clipboard";
import {
  alertDesktopMessage,
  confirmDesktopAction,
} from "../../src/utils/desktop-dialogs";

type TestWindow = Window & {
  electron?: {
    ipcRenderer?: {
      invoke: (channel: string, params?: unknown) => Promise<unknown>;
    };
  };
};

describe("desktop dialog and clipboard helpers", () => {
  beforeEach(() => {
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, "clipboard", {
        value: {
          writeText: vi.fn().mockResolvedValue(undefined),
        },
        configurable: true,
      });
      return;
    }

    if (!navigator.clipboard.writeText) {
      Object.defineProperty(navigator.clipboard, "writeText", {
        value: vi.fn().mockResolvedValue(undefined),
        configurable: true,
      });
    }
  });

  afterEach(() => {
    delete (window as TestWindow).electron;
    vi.restoreAllMocks();
  });

  it("uses the Electrobun message-box RPC for confirm dialogs", async () => {
    const invoke = vi.fn().mockResolvedValue({ response: 0 });
    (window as TestWindow).electron = { ipcRenderer: { invoke } };
    const confirmSpy = vi.spyOn(window, "confirm");

    await expect(
      confirmDesktopAction({
        title: "Delete Item",
        message: "Delete this item?",
      }),
    ).resolves.toBe(true);

    expect(invoke).toHaveBeenCalledWith("desktop:showMessageBox", {
      type: "question",
      title: "Delete Item",
      message: "Delete this item?",
      detail: undefined,
      buttons: ["Confirm", "Cancel"],
      defaultId: 0,
      cancelId: 1,
    });
    expect(confirmSpy).not.toHaveBeenCalled();
  });

  it("falls back to window.confirm on web", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);

    await expect(
      confirmDesktopAction({
        title: "Disconnect",
        message: "Disconnect now?",
      }),
    ).resolves.toBe(true);

    expect(confirmSpy).toHaveBeenCalledWith("Disconnect\n\nDisconnect now?");
  });

  it("uses the Electrobun message-box RPC for alerts", async () => {
    const invoke = vi.fn().mockResolvedValue({ response: 0 });
    (window as TestWindow).electron = { ipcRenderer: { invoke } };
    const alertSpy = vi.spyOn(window, "alert");

    await expect(
      alertDesktopMessage({
        title: "Reset Failed",
        message: "Check the logs.",
        type: "error",
      }),
    ).resolves.toBeUndefined();

    expect(invoke).toHaveBeenCalledWith("desktop:showMessageBox", {
      type: "error",
      title: "Reset Failed",
      message: "Check the logs.",
      detail: undefined,
      buttons: ["OK"],
      defaultId: 0,
      cancelId: 0,
    });
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it("uses the Electrobun clipboard RPC when available", async () => {
    const invoke = vi.fn().mockResolvedValue(undefined);
    (window as TestWindow).electron = { ipcRenderer: { invoke } };
    const clipboardSpy = vi.spyOn(navigator.clipboard, "writeText");

    await copyTextToClipboard("milady");

    expect(invoke).toHaveBeenCalledWith("desktop:writeToClipboard", {
      text: "milady",
    });
    expect(clipboardSpy).not.toHaveBeenCalled();
  });

  it("falls back to navigator.clipboard on web", async () => {
    const clipboardSpy = vi
      .spyOn(navigator.clipboard, "writeText")
      .mockResolvedValue(undefined);

    await copyTextToClipboard("desktopless");

    expect(clipboardSpy).toHaveBeenCalledWith("desktopless");
  });
});
