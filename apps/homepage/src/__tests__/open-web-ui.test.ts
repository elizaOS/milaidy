import { afterEach, describe, expect, it, vi } from "vitest";
import type { CloudClient } from "../lib/cloud-api";
import { openWebUIDirect, openWebUIWithPairing } from "../lib/open-web-ui";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("open-web-ui", () => {
  it("rewrites waifu.fun URLs to milady.ai", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    openWebUIDirect("https://agent-123.waifu.fun");

    const url = (openSpy.mock.calls[0]?.[0] as string) ?? "";
    expect(url).toContain("agent-123.milady.ai");
    expect(url).not.toContain("waifu.fun");
  });

  it("appends api token to rewritten URL when provided", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    openWebUIDirect("https://agent-123.waifu.fun", "milady_abc123");

    const url = (openSpy.mock.calls[0]?.[0] as string) ?? "";
    expect(url).toContain("agent-123.milady.ai");
    expect(url).toContain("token=milady_abc123");
    expect(url).not.toContain("waifu.fun");
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

    expect(popup.location.href).toContain("agent-123.milady.ai");
    expect(popup.location.href).toContain("token=pair-token");
    expect(popup.location.href).not.toContain("waifu.fun");
  });
});
