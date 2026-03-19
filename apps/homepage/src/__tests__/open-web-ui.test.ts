import { afterEach, describe, expect, it, vi } from "vitest";
import type { CloudClient } from "../lib/cloud-api";
import { openWebUIDirect, openWebUIWithPairing } from "../lib/open-web-ui";

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

describe("open-web-ui", () => {
  it("preserves waifu.fun URLs when domain matches", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    openWebUIDirect("https://agent-123.waifu.fun");

    // URL may be normalized (trailing slash) by the URL constructor
    const url = (openSpy.mock.calls[0]?.[0] as string) ?? "";
    expect(url.startsWith("https://agent-123.waifu.fun")).toBe(true);
    expect(url).not.toContain("milady.ai");
  });

  it("appends api token to URL when provided", () => {
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    openWebUIDirect("https://agent-123.waifu.fun", "milady_abc123");

    const url = (openSpy.mock.calls[0]?.[0] as string) ?? "";
    expect(url).toContain("agent-123.waifu.fun");
    expect(url).toContain("token=milady_abc123");
  });

  it("preserves pairing redirect URLs from cloud backend", async () => {
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

    // When AGENT_UI_BASE_DOMAIN matches waifu.fun, redirect URL is preserved
    expect(popup.location.href).toContain("agent-123.waifu.fun");
    expect(popup.location.href).toContain("token=pair-token");
  });
});
