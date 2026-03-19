import { beforeEach, describe, expect, it } from "vitest";

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

type ProviderConfig = Record<string, unknown>;
type ProviderCtor = new (c: ProviderConfig) => Record<string, unknown>;

describe("S2: API keys must be in headers, not URLs", () => {
  beforeEach(() => {
    fetchCalls.length = 0;
  });

  it("GoogleImageProvider sends key via x-goog-api-key header", async () => {
    const { GoogleImageProvider } = await import("../media-provider");
    const provider = new GoogleImageProvider({
      apiKey: "test-key-123",
    } as ProviderConfig);
    await provider.generate({ prompt: "test" });

    expect(fetchCalls.length).toBeGreaterThan(0);
    const [url, init] = fetchCalls[0];
    expect(url).not.toContain("key=");
    expect(url).toContain(":predict");
    const h = init.headers as Record<string, string>;
    expect(h["x-goog-api-key"]).toBe("test-key-123");
  });

  it("GoogleVideoProvider sends key via header", async () => {
    const { GoogleVideoProvider } = await import("../media-provider");
    const provider = new GoogleVideoProvider({
      apiKey: "test-key-456",
    } as ProviderConfig);
    await provider.generate({ prompt: "test" });

    expect(fetchCalls.length).toBeGreaterThan(0);
    const [url, init] = fetchCalls[0];
    expect(url).not.toContain("key=");
    expect(url).toContain(":predictLongRunning");
    const h = init.headers as Record<string, string>;
    expect(h["x-goog-api-key"]).toBe("test-key-456");
  });

  it("GoogleVisionProvider sends key via header", async () => {
    const { GoogleVisionProvider } = await import("../media-provider");
    const provider = new GoogleVisionProvider({
      apiKey: "test-key-789",
    } as ProviderConfig);
    await provider.analyze({
      imageBase64: "abc",
      prompt: "describe",
    });

    expect(fetchCalls.length).toBeGreaterThan(0);
    const [url, init] = fetchCalls[0];
    expect(url).not.toContain("key=");
    expect(url).toContain(":generateContent");
    const h = init.headers as Record<string, string>;
    expect(h["x-goog-api-key"]).toBe("test-key-789");
  });

  it("XAI providers use Authorization header", async () => {
    const { XAIImageProvider } = await import("../media-provider");
    const provider = new XAIImageProvider({
      apiKey: "xai-key-test",
    } as ProviderConfig);
    await provider.generate({ prompt: "test" });

    expect(fetchCalls.length).toBeGreaterThan(0);
    const [url, init] = fetchCalls[0];
    expect(url).not.toContain("key=");
    const h = init.headers as Record<string, string>;
    expect(h.Authorization).toBe("Bearer xai-key-test");
  });
});

describe("S4: Providers reject empty API keys", () => {
  const names = [
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

  for (const name of names) {
    it(`${name} throws when apiKey is missing`, async () => {
      const mod = await import("../media-provider");
      const C = (mod as Record<string, ProviderCtor>)[name];
      expect(() => new C({})).toThrow("API key is required");
    });

    it(`${name} throws on empty apiKey`, async () => {
      const mod = await import("../media-provider");
      const C = (mod as Record<string, ProviderCtor>)[name];
      expect(() => new C({ apiKey: "" })).toThrow("API key is required");
    });
  }
});
