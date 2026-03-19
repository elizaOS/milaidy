import { describe, it, expect, beforeEach } from "vitest";

// Mock fetch globally before any imports
const fetchCalls: Array<[string, RequestInit]> = [];

globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
  fetchCalls.push([String(url), init ?? {}]);
  return {
    ok: true,
    json: async () => ({
      predictions: [{ bytesBase64Encoded: "abc" }],
      data: [{ url: "http://example.com/img.png" }],
      candidates: [{ content: { parts: [{ text: "desc" }] } }],
      choices: [{ message: { content: "desc" } }],
    }),
    text: async () => "",
  } as Response;
}) as typeof globalThis.fetch;

describe("S2: API keys must be in headers, not URLs", () => {
  beforeEach(() => {
    fetchCalls.length = 0;
  });

  it("GoogleImageProvider sends key via x-goog-api-key header", async () => {
    const { GoogleImageProvider } = await import("../media-provider");
    const provider = new GoogleImageProvider({
      apiKey: "test-key-123",
    } as any);
    await provider.generate({ prompt: "test" });

    expect(fetchCalls.length).toBeGreaterThan(0);
    const [url, init] = fetchCalls[0];
    expect(url).not.toContain("key=");
    expect(url).toContain(":predict");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "test-key-123",
    );
  });

  it("GoogleVideoProvider sends key via x-goog-api-key header", async () => {
    const { GoogleVideoProvider } = await import("../media-provider");
    const provider = new GoogleVideoProvider({
      apiKey: "test-key-456",
    } as any);
    await provider.generate({ prompt: "test" });

    expect(fetchCalls.length).toBeGreaterThan(0);
    const [url, init] = fetchCalls[0];
    expect(url).not.toContain("key=");
    expect(url).toContain(":predictLongRunning");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "test-key-456",
    );
  });

  it("GoogleVisionProvider sends key via x-goog-api-key header", async () => {
    const { GoogleVisionProvider } = await import("../media-provider");
    const provider = new GoogleVisionProvider({
      apiKey: "test-key-789",
    } as any);
    await provider.analyze({ imageBase64: "abc", prompt: "describe" });

    expect(fetchCalls.length).toBeGreaterThan(0);
    const [url, init] = fetchCalls[0];
    expect(url).not.toContain("key=");
    expect(url).toContain(":generateContent");
    expect((init.headers as Record<string, string>)["x-goog-api-key"]).toBe(
      "test-key-789",
    );
  });

  it("XAI providers already use Authorization header (not URL)", async () => {
    const { XAIImageProvider } = await import("../media-provider");
    const provider = new XAIImageProvider({
      apiKey: "xai-key-test",
    } as any);
    await provider.generate({ prompt: "test" });

    expect(fetchCalls.length).toBeGreaterThan(0);
    const [url, init] = fetchCalls[0];
    expect(url).not.toContain("key=");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer xai-key-test",
    );
  });
});

describe("S4: Providers reject empty API keys", () => {
  const providerNames = [
    "FalImageProvider",
    "FalVideoProvider",
    "OpenAIImageProvider",
    "OpenAIVideoProvider",
    "OpenAIVisionProvider",
    "GoogleImageProvider",
    "GoogleVideoProvider",
    "GoogleVisionProvider",
    "XAIImageProvider",
    "XAIVisionProvider",
    "AnthropicVisionProvider",
    "SunoAudioProvider",
  ] as const;

  for (const name of providerNames) {
    it(`${name} throws when apiKey is missing`, async () => {
      const mod = await import("../media-provider");
      const ProviderClass = (mod as Record<string, any>)[name];
      expect(() => new ProviderClass({})).toThrow("API key is required");
    });

    it(`${name} throws when apiKey is empty string`, async () => {
      const mod = await import("../media-provider");
      const ProviderClass = (mod as Record<string, any>)[name];
      expect(() => new ProviderClass({ apiKey: "" })).toThrow(
        "API key is required",
      );
    });
  }
});
