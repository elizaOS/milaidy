import { afterEach, describe, expect, it, vi } from "vitest";
import type { CloudClient } from "../lib/cloud-api";
import { openWebUIDirect, openWebUIWithPairing } from "../lib/open-web-ui";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("open-web-ui", () => {
  it("rewrites direct Web UI links to milady.ai", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    openWebUIDirect("https://agent-123.waifu.fun");

    expect(openSpy).toHaveBeenCalledWith(
      "https://agent-123.milady.ai/",
      "_blank",
      "noopener,noreferrer",
    );
  });

  it("rewrites pairing redirect URLs to milady.ai", async () => {
    const popup = {
      closed: false,
      document: {
        title: "",
        body: {
          style: { margin: "" },
          innerHTML: "",
        },
      },
      location: { href: "" },
      close: vi.fn(),
    };

    vi.spyOn(window, "open").mockImplementation(
      () => popup as unknown as Window,
    );

    const cloudClient = {
      getPairingToken: vi.fn().mockResolvedValue({
        token: "pair-token",
        redirectUrl: "https://agent-123.waifu.fun/pair?token=pair-token",
        expiresIn: 300,
      }),
    } as unknown as CloudClient;

    await openWebUIWithPairing("agent-123", cloudClient);

    expect(popup.location.href).toBe(
      "https://agent-123.milady.ai/pair?token=pair-token",
    );
  });
});
