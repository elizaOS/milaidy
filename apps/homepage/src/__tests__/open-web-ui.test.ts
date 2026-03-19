import { afterEach, describe, expect, it, vi } from "vitest";
import { openWebUI, openWebUIDirect } from "../lib/open-web-ui";

// Mock auth module so we can control getToken()
vi.mock("../lib/auth", () => ({
  getToken: vi.fn(() => null),
}));

// Need to import after mock setup so the mock takes effect
const { getToken } = await import("../lib/auth");

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

  it("opens directly for local agents even when authenticated", () => {
    vi.mocked(getToken).mockReturnValue("test-api-key");
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    openWebUI("https://localhost:2138", "local");

    // Should open directly without pairing token flow
    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = (openSpy.mock.calls[0]?.[0] as string) ?? "";
    expect(url).toContain("localhost:2138");
  });

  it("opens directly for remote agents when not authenticated", () => {
    vi.mocked(getToken).mockReturnValue(null);
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    openWebUI("https://abc-123.milady.ai", "remote");

    expect(openSpy).toHaveBeenCalledTimes(1);
    const url = (openSpy.mock.calls[0]?.[0] as string) ?? "";
    expect(url).toContain("abc-123.milady.ai");
  });

  it("uses pairing token flow for remote agents when authenticated", async () => {
    vi.mocked(getToken).mockReturnValue("test-api-key");

    const popup = {
      closed: false,
      document: {
        title: "",
        body: { style: { margin: "" }, innerHTML: "" },
      },
      location: { href: "" },
      close: vi.fn(),
    };
    vi.spyOn(window, "open").mockImplementation(
      () => popup as unknown as Window,
    );

    // Mock fetch to return a pairing token response
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          success: true,
          data: {
            token: "pair-token",
            redirectUrl:
              "https://abcd1234-1234-1234-1234-123456789abc.waifu.fun/pair?token=pair-token",
            expiresIn: 60,
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    openWebUI(
      "https://abcd1234-1234-1234-1234-123456789abc.milady.ai",
      "remote",
    );

    // Wait for the async pairing token fetch
    await vi.waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    // Should have called the backend pairing-token endpoint
    const fetchUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(fetchUrl).toContain(
      "/api/v1/milady/agents/abcd1234-1234-1234-1234-123456789abc/pairing-token",
    );

    // Wait for redirect
    await vi.waitFor(() => {
      expect(popup.location.href).toBeTruthy();
    });

    // Pairing redirect URL is rewritten to milady.ai (canonical domain)
    expect(popup.location.href).toContain("waifu.fun");
    expect(popup.location.href).toContain("token=pair-token");
  });
});
