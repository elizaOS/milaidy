/**
 * Comprehensive tests for providers/media-provider.ts
 *
 * Tests all media providers:
 * - Vision Analysis: OpenAI, Google, Anthropic, xAI, Eliza Cloud
 * - Image Generation: FAL, OpenAI, Google, xAI, Eliza Cloud
 * - Video Generation: FAL, OpenAI, Google, Eliza Cloud
 * - Audio Generation: Suno, Eliza Cloud
 *
 * Also tests:
 * - Factory functions for provider creation
 * - Error handling for API failures
 * - Configuration parsing and defaults
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mock fetch globally
// ---------------------------------------------------------------------------

const fetchMock =
  vi.fn<
    (input: string | URL | Request, init?: RequestInit) => Promise<Response>
  >();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function errorResponse(text: string, status = 500): Response {
  return new Response(text, { status });
}

function _captureRequestUrl(): string[] {
  const urls: string[] = [];
  fetchMock.mockImplementation(async (input) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.href
          : input.url;
    urls.push(url);
    return jsonResponse({});
  });
  return urls;
}

// ---------------------------------------------------------------------------
// Import after mocking
// ---------------------------------------------------------------------------

import type {
  AudioGenConfig,
  ImageConfig,
  MediaConfig,
  VideoConfig,
  VisionConfig,
} from "../config/types.milady";
import {
  type AudioGenerationOptions,
  createAudioProvider,
  createImageProvider,
  createMediaProviders,
  createVideoProvider,
  createVisionProvider,
  type ImageGenerationOptions,
  type MediaProviderFactoryOptions,
  type VideoGenerationOptions,
  type VisionAnalysisOptions,
} from "./media-provider";

// ===========================================================================
// VISION PROVIDER TESTS
// ===========================================================================

describe("Vision Providers", () => {
  const factoryOptions: MediaProviderFactoryOptions = {
    elizaCloudBaseUrl: "https://test.elizacloud.ai/api/v1",
    elizaCloudApiKey: "test-api-key",
  };

  const defaultVisionOptions: VisionAnalysisOptions = {
    imageUrl: "https://example.com/image.jpg",
    prompt: "Describe this image",
    maxTokens: 512,
  };

  describe("Eliza Cloud Vision Provider (default)", () => {
    it("uses Eliza Cloud when no provider configured", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          description: "A beautiful sunset over mountains",
          labels: ["sunset", "mountains", "nature"],
          confidence: 0.95,
        }),
      );

      const provider = createVisionProvider(undefined, factoryOptions);
      expect(provider.name).toBe("eliza-cloud");

      const result = await provider.analyze(defaultVisionOptions);

      expect(result.success).toBe(true);
      expect(result.data?.description).toBe(
        "A beautiful sunset over mountains",
      );
      expect(result.data?.labels).toEqual(["sunset", "mountains", "nature"]);
      expect(result.data?.confidence).toBe(0.95);

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe(
        "https://test.elizacloud.ai/api/v1/media/vision/analyze",
      );
      expect(init?.method).toBe("POST");
      expect(init?.headers).toHaveProperty(
        "Authorization",
        "Bearer test-api-key",
      );
    });

    it("uses Eliza Cloud when mode is 'cloud'", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ description: "Test description" }),
      );

      const config: VisionConfig = { mode: "cloud" };
      const provider = createVisionProvider(config, factoryOptions);
      expect(provider.name).toBe("eliza-cloud");
    });

    it("handles Eliza Cloud API errors", async () => {
      fetchMock.mockResolvedValue(errorResponse("Internal Server Error", 500));

      const provider = createVisionProvider(undefined, factoryOptions);
      const result = await provider.analyze(defaultVisionOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Eliza Cloud error");
    });
  });

  describe("OpenAI Vision Provider", () => {
    const openaiConfig: VisionConfig = {
      mode: "own-key",
      provider: "openai",
      openai: {
        apiKey: "sk-test-openai-key",
        model: "gpt-4o",
        maxTokens: 1024,
      },
    };

    it("creates OpenAI provider with correct config", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          choices: [
            {
              message: {
                content: "This is an image of a cat sitting on a couch.",
              },
            },
          ],
        }),
      );

      const provider = createVisionProvider(openaiConfig, factoryOptions);
      expect(provider.name).toBe("openai");

      const result = await provider.analyze(defaultVisionOptions);

      expect(result.success).toBe(true);
      expect(result.data?.description).toBe(
        "This is an image of a cat sitting on a couch.",
      );

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/chat/completions");
      expect(init?.headers).toHaveProperty(
        "Authorization",
        "Bearer sk-test-openai-key",
      );
    });

    it("handles imageBase64 input for OpenAI", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          choices: [{ message: { content: "Base64 image analyzed" } }],
        }),
      );

      const provider = createVisionProvider(openaiConfig, factoryOptions);
      await provider.analyze({
        imageBase64:
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
        prompt: "What is this?",
      });

      const [, init] = fetchMock.mock.calls[0];
      const body = JSON.parse(init?.body as string);
      expect(body.messages[0].content[1].image_url.url).toContain(
        "data:image/jpeg;base64,",
      );
    });

    it("handles OpenAI API errors", async () => {
      fetchMock.mockResolvedValue(
        errorResponse('{"error": {"message": "Rate limit exceeded"}}', 429),
      );

      const provider = createVisionProvider(openaiConfig, factoryOptions);
      const result = await provider.analyze(defaultVisionOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("OpenAI error");
    });

    it("handles empty response from OpenAI", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ choices: [] }));

      const provider = createVisionProvider(openaiConfig, factoryOptions);
      const result = await provider.analyze(defaultVisionOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No description returned from OpenAI");
    });
  });

  describe("Google Vision Provider", () => {
    const googleConfig: VisionConfig = {
      mode: "own-key",
      provider: "google",
      google: {
        apiKey: "google-test-api-key",
        model: "gemini-2.0-flash",
      },
    };

    it("creates Google provider with correct config", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          candidates: [
            {
              content: {
                parts: [{ text: "A scenic mountain landscape with snow" }],
              },
            },
          ],
        }),
      );

      const provider = createVisionProvider(googleConfig, factoryOptions);
      expect(provider.name).toBe("google");

      const result = await provider.analyze(defaultVisionOptions);

      expect(result.success).toBe(true);
      expect(result.data?.description).toBe(
        "A scenic mountain landscape with snow",
      );

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url] = fetchMock.mock.calls[0];
      expect(url).toContain("generativelanguage.googleapis.com");
      expect(url).toContain("gemini-2.0-flash");
      expect(url).toContain("key=google-test-api-key");
    });

    it("handles Google API errors", async () => {
      fetchMock.mockResolvedValue(errorResponse("Invalid API key", 401));

      const provider = createVisionProvider(googleConfig, factoryOptions);
      const result = await provider.analyze(defaultVisionOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Google error");
    });
  });

  describe("Anthropic Vision Provider", () => {
    const anthropicConfig: VisionConfig = {
      mode: "own-key",
      provider: "anthropic",
      anthropic: {
        apiKey: "anthropic-test-key",
        model: "claude-sonnet-4-20250514",
      },
    };

    it("creates Anthropic provider with correct config", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          content: [{ type: "text", text: "The image shows a vibrant garden" }],
        }),
      );

      const provider = createVisionProvider(anthropicConfig, factoryOptions);
      expect(provider.name).toBe("anthropic");

      const result = await provider.analyze(defaultVisionOptions);

      expect(result.success).toBe(true);
      expect(result.data?.description).toBe("The image shows a vibrant garden");

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.anthropic.com/v1/messages");
      expect(init?.headers).toHaveProperty("x-api-key", "anthropic-test-key");
      expect(init?.headers).toHaveProperty("anthropic-version", "2023-06-01");
    });

    it("handles Anthropic API errors", async () => {
      fetchMock.mockResolvedValue(errorResponse("Overloaded", 529));

      const provider = createVisionProvider(anthropicConfig, factoryOptions);
      const result = await provider.analyze(defaultVisionOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Anthropic error");
    });
  });

  describe("xAI Vision Provider", () => {
    const xaiConfig: VisionConfig = {
      mode: "own-key",
      provider: "xai",
      xai: {
        apiKey: "xai-test-key",
        model: "grok-2-vision-1212",
      },
    };

    it("creates xAI provider with correct config", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          choices: [{ message: { content: "Image analysis from Grok" } }],
        }),
      );

      const provider = createVisionProvider(xaiConfig, factoryOptions);
      expect(provider.name).toBe("xai");

      const result = await provider.analyze(defaultVisionOptions);

      expect(result.success).toBe(true);
      expect(result.data?.description).toBe("Image analysis from Grok");

      expect(fetchMock).toHaveBeenCalledOnce();
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.x.ai/v1/chat/completions");
      expect(init?.headers).toHaveProperty(
        "Authorization",
        "Bearer xai-test-key",
      );
    });
  });

  describe("Provider fallback to Eliza Cloud", () => {
    it("falls back to Eliza Cloud when OpenAI key is missing", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ description: "Fallback description" }),
      );

      const config: VisionConfig = {
        mode: "own-key",
        provider: "openai",
        openai: { apiKey: "" }, // Empty key
      };

      const provider = createVisionProvider(config, factoryOptions);
      expect(provider.name).toBe("eliza-cloud");
    });

    it("falls back to Eliza Cloud when config is incomplete", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({ description: "Fallback description" }),
      );

      const config: VisionConfig = {
        mode: "own-key",
        provider: "google",
        // google config missing
      };

      const provider = createVisionProvider(config, factoryOptions);
      expect(provider.name).toBe("eliza-cloud");
    });
  });
});

// ===========================================================================
// IMAGE PROVIDER TESTS
// ===========================================================================

describe("Image Generation Providers", () => {
  const factoryOptions: MediaProviderFactoryOptions = {
    elizaCloudBaseUrl: "https://test.elizacloud.ai/api/v1",
    elizaCloudApiKey: "test-api-key",
  };

  const defaultImageOptions: ImageGenerationOptions = {
    prompt: "A beautiful sunset over mountains",
    size: "1024x1024",
    quality: "hd",
  };

  describe("Eliza Cloud Image Provider (default)", () => {
    it("generates images via Eliza Cloud", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          imageUrl: "https://example.com/generated-image.png",
          revisedPrompt: "A stunning sunset over majestic mountains",
        }),
      );

      const provider = createImageProvider(undefined, factoryOptions);
      expect(provider.name).toBe("eliza-cloud");

      const result = await provider.generate(defaultImageOptions);

      expect(result.success).toBe(true);
      expect(result.data?.imageUrl).toBe(
        "https://example.com/generated-image.png",
      );
      expect(result.data?.revisedPrompt).toBe(
        "A stunning sunset over majestic mountains",
      );
    });
  });

  describe("FAL Image Provider", () => {
    const falConfig: ImageConfig = {
      mode: "own-key",
      provider: "fal",
      fal: {
        apiKey: "fal-test-key",
        model: "fal-ai/flux-pro",
        baseUrl: "https://fal.run",
      },
    };

    it("generates images via FAL", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          images: [{ url: "https://fal.media/generated.png" }],
        }),
      );

      const provider = createImageProvider(falConfig, factoryOptions);
      expect(provider.name).toBe("fal");

      const result = await provider.generate(defaultImageOptions);

      expect(result.success).toBe(true);
      expect(result.data?.imageUrl).toBe("https://fal.media/generated.png");

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://fal.run/fal-ai/flux-pro");
      expect(init?.headers).toHaveProperty("Authorization", "Key fal-test-key");
    });

    it("handles FAL errors", async () => {
      fetchMock.mockResolvedValue(errorResponse("Model not found", 404));

      const provider = createImageProvider(falConfig, factoryOptions);
      const result = await provider.generate(defaultImageOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("FAL error");
    });

    it("handles empty FAL response", async () => {
      fetchMock.mockResolvedValue(jsonResponse({ images: [] }));

      const provider = createImageProvider(falConfig, factoryOptions);
      const result = await provider.generate(defaultImageOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("No image returned from FAL");
    });
  });

  describe("OpenAI Image Provider (DALL-E)", () => {
    const openaiConfig: ImageConfig = {
      mode: "own-key",
      provider: "openai",
      openai: {
        apiKey: "sk-openai-image-key",
        model: "dall-e-3",
        quality: "hd",
        style: "vivid",
      },
    };

    it("generates images via OpenAI DALL-E", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          data: [
            {
              url: "https://oaidalleapiprodscus.blob.core.windows.net/image.png",
              revised_prompt: "Enhanced prompt",
            },
          ],
        }),
      );

      const provider = createImageProvider(openaiConfig, factoryOptions);
      expect(provider.name).toBe("openai");

      const result = await provider.generate(defaultImageOptions);

      expect(result.success).toBe(true);
      expect(result.data?.imageUrl).toContain("oaidalleapiprodscus");

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/images/generations");
    });
  });

  describe("Google Image Provider (Imagen)", () => {
    const googleConfig: ImageConfig = {
      mode: "own-key",
      provider: "google",
      google: {
        apiKey: "google-imagen-key",
        model: "imagen-3.0-generate-002",
      },
    };

    it("generates images via Google Imagen", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          predictions: [{ bytesBase64Encoded: "iVBORw0KGgoAAAANS..." }],
        }),
      );

      const provider = createImageProvider(googleConfig, factoryOptions);
      expect(provider.name).toBe("google");

      const result = await provider.generate(defaultImageOptions);

      expect(result.success).toBe(true);
      expect(result.data?.imageBase64).toBe("iVBORw0KGgoAAAANS...");
    });
  });

  describe("xAI Image Provider (Grok)", () => {
    const xaiConfig: ImageConfig = {
      mode: "own-key",
      provider: "xai",
      xai: {
        apiKey: "xai-image-key",
        model: "grok-2-image",
      },
    };

    it("generates images via xAI", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          data: [{ url: "https://x.ai/generated.png" }],
        }),
      );

      const provider = createImageProvider(xaiConfig, factoryOptions);
      expect(provider.name).toBe("xai");

      const result = await provider.generate(defaultImageOptions);

      expect(result.success).toBe(true);
      expect(result.data?.imageUrl).toBe("https://x.ai/generated.png");

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.x.ai/v1/images/generations");
    });
  });
});

// ===========================================================================
// VIDEO PROVIDER TESTS
// ===========================================================================

describe("Video Generation Providers", () => {
  const factoryOptions: MediaProviderFactoryOptions = {
    elizaCloudBaseUrl: "https://test.elizacloud.ai/api/v1",
  };

  const defaultVideoOptions: VideoGenerationOptions = {
    prompt: "A serene ocean wave rolling onto beach",
    duration: 5,
    aspectRatio: "16:9",
  };

  describe("Eliza Cloud Video Provider (default)", () => {
    it("generates videos via Eliza Cloud", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          videoUrl: "https://example.com/generated-video.mp4",
          thumbnailUrl: "https://example.com/thumbnail.jpg",
          duration: 5,
        }),
      );

      const provider = createVideoProvider(undefined, factoryOptions);
      expect(provider.name).toBe("eliza-cloud");

      const result = await provider.generate(defaultVideoOptions);

      expect(result.success).toBe(true);
      expect(result.data?.videoUrl).toBe(
        "https://example.com/generated-video.mp4",
      );
      expect(result.data?.duration).toBe(5);
    });
  });

  describe("FAL Video Provider", () => {
    const falConfig: VideoConfig = {
      mode: "own-key",
      provider: "fal",
      fal: {
        apiKey: "fal-video-key",
        model: "fal-ai/minimax-video",
      },
    };

    it("generates videos via FAL", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          video: { url: "https://fal.media/video.mp4" },
          thumbnail: { url: "https://fal.media/thumb.jpg" },
          duration: 10,
        }),
      );

      const provider = createVideoProvider(falConfig, factoryOptions);
      expect(provider.name).toBe("fal");

      const result = await provider.generate(defaultVideoOptions);

      expect(result.success).toBe(true);
      expect(result.data?.videoUrl).toBe("https://fal.media/video.mp4");
    });
  });

  describe("OpenAI Video Provider (Sora)", () => {
    const openaiConfig: VideoConfig = {
      mode: "own-key",
      provider: "openai",
      openai: {
        apiKey: "sk-openai-sora-key",
        model: "sora-1.0-turbo",
      },
    };

    it("generates videos via OpenAI Sora", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          data: [{ url: "https://sora.openai.com/video.mp4", duration: 5 }],
        }),
      );

      const provider = createVideoProvider(openaiConfig, factoryOptions);
      expect(provider.name).toBe("openai");

      const result = await provider.generate(defaultVideoOptions);

      expect(result.success).toBe(true);
      expect(result.data?.videoUrl).toBe("https://sora.openai.com/video.mp4");

      const [url] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.openai.com/v1/videos/generations");
    });
  });

  describe("Google Video Provider (Veo)", () => {
    const googleConfig: VideoConfig = {
      mode: "own-key",
      provider: "google",
      google: {
        apiKey: "google-veo-key",
        model: "veo-2.0-generate-001",
      },
    };

    it("handles Google Veo long-running operations", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          name: "operations/video-gen-123",
          done: false,
        }),
      );

      const provider = createVideoProvider(googleConfig, factoryOptions);
      const result = await provider.generate(defaultVideoOptions);

      expect(result.success).toBe(true);
      expect(result.data?.videoUrl).toBe("pending:operations/video-gen-123");
    });

    it("returns video URL when operation is done", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          name: "operations/video-gen-123",
          done: true,
          response: {
            predictions: [{ videoUri: "gs://bucket/video.mp4" }],
          },
        }),
      );

      const provider = createVideoProvider(googleConfig, factoryOptions);
      const result = await provider.generate(defaultVideoOptions);

      expect(result.success).toBe(true);
      expect(result.data?.videoUrl).toBe("gs://bucket/video.mp4");
    });
  });
});

// ===========================================================================
// AUDIO PROVIDER TESTS
// ===========================================================================

describe("Audio Generation Providers", () => {
  const factoryOptions: MediaProviderFactoryOptions = {
    elizaCloudBaseUrl: "https://test.elizacloud.ai/api/v1",
  };

  const defaultAudioOptions: AudioGenerationOptions = {
    prompt: "An upbeat electronic dance track",
    duration: 30,
    instrumental: true,
  };

  describe("Eliza Cloud Audio Provider (default)", () => {
    it("generates audio via Eliza Cloud", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          audioUrl: "https://example.com/generated-audio.mp3",
          title: "Electronic Vibes",
          duration: 30,
        }),
      );

      const provider = createAudioProvider(undefined, factoryOptions);
      expect(provider.name).toBe("eliza-cloud");

      const result = await provider.generate(defaultAudioOptions);

      expect(result.success).toBe(true);
      expect(result.data?.audioUrl).toBe(
        "https://example.com/generated-audio.mp3",
      );
      expect(result.data?.title).toBe("Electronic Vibes");
    });
  });

  describe("Suno Audio Provider", () => {
    const sunoConfig: AudioGenConfig = {
      mode: "own-key",
      provider: "suno",
      suno: {
        apiKey: "suno-test-key",
        model: "chirp-v3.5",
        baseUrl: "https://api.suno.ai/v1",
      },
    };

    it("generates audio via Suno", async () => {
      fetchMock.mockResolvedValue(
        jsonResponse({
          audio_url: "https://cdn.suno.ai/generated.mp3",
          title: "My Generated Song",
          duration: 120,
        }),
      );

      const provider = createAudioProvider(sunoConfig, factoryOptions);
      expect(provider.name).toBe("suno");

      const result = await provider.generate(defaultAudioOptions);

      expect(result.success).toBe(true);
      expect(result.data?.audioUrl).toBe("https://cdn.suno.ai/generated.mp3");

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.suno.ai/v1/generate");
      expect(init?.headers).toHaveProperty(
        "Authorization",
        "Bearer suno-test-key",
      );
    });

    it("handles Suno API errors", async () => {
      fetchMock.mockResolvedValue(errorResponse("Invalid credentials", 401));

      const provider = createAudioProvider(sunoConfig, factoryOptions);
      const result = await provider.generate(defaultAudioOptions);

      expect(result.success).toBe(false);
      expect(result.error).toContain("Suno error");
    });
  });
});

// ===========================================================================
// FACTORY FUNCTION TESTS
// ===========================================================================

describe("createMediaProviders factory", () => {
  const factoryOptions: MediaProviderFactoryOptions = {
    elizaCloudBaseUrl: "https://test.elizacloud.ai/api/v1",
    elizaCloudApiKey: "factory-test-key",
  };

  it("creates all four providers from MediaConfig", async () => {
    const config: MediaConfig = {
      image: { mode: "cloud" },
      video: { mode: "cloud" },
      audio: { mode: "cloud" },
      vision: { mode: "cloud" },
    };

    const providers = createMediaProviders(config, factoryOptions);

    expect(providers.image.name).toBe("eliza-cloud");
    expect(providers.video.name).toBe("eliza-cloud");
    expect(providers.audio.name).toBe("eliza-cloud");
    expect(providers.vision.name).toBe("eliza-cloud");
  });

  it("creates mixed providers based on config", async () => {
    const config: MediaConfig = {
      image: {
        mode: "own-key",
        provider: "fal",
        fal: { apiKey: "fal-key" },
      },
      video: { mode: "cloud" },
      audio: {
        mode: "own-key",
        provider: "suno",
        suno: { apiKey: "suno-key" },
      },
      vision: {
        mode: "own-key",
        provider: "openai",
        openai: { apiKey: "openai-key" },
      },
    };

    const providers = createMediaProviders(config, factoryOptions);

    expect(providers.image.name).toBe("fal");
    expect(providers.video.name).toBe("eliza-cloud");
    expect(providers.audio.name).toBe("suno");
    expect(providers.vision.name).toBe("openai");
  });

  it("uses defaults when config is undefined", async () => {
    const providers = createMediaProviders(undefined, factoryOptions);

    expect(providers.image.name).toBe("eliza-cloud");
    expect(providers.video.name).toBe("eliza-cloud");
    expect(providers.audio.name).toBe("eliza-cloud");
    expect(providers.vision.name).toBe("eliza-cloud");
  });
});

// ===========================================================================
// ERROR HANDLING TESTS
// ===========================================================================

describe("Error handling across providers", () => {
  const factoryOptions: MediaProviderFactoryOptions = {
    elizaCloudBaseUrl: "https://test.elizacloud.ai/api/v1",
  };

  it("handles network errors gracefully", async () => {
    fetchMock.mockRejectedValue(new Error("Network request failed"));

    const provider = createVisionProvider(undefined, factoryOptions);

    await expect(
      provider.analyze({ imageUrl: "https://example.com/image.jpg" }),
    ).rejects.toThrow("Network request failed");
  });

  it("handles malformed JSON responses", async () => {
    fetchMock.mockResolvedValue(
      new Response("Not JSON", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      }),
    );

    const provider = createVisionProvider(undefined, factoryOptions);

    await expect(
      provider.analyze({ imageUrl: "https://example.com/image.jpg" }),
    ).rejects.toThrow();
  });

  it("includes error text in error messages", async () => {
    fetchMock.mockResolvedValue(errorResponse("Service Unavailable", 503));

    const provider = createImageProvider(undefined, factoryOptions);
    const result = await provider.generate({ prompt: "test" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Service Unavailable");
  });
});

// ===========================================================================
// CONFIGURATION DEFAULTS TESTS
// ===========================================================================

describe("Configuration defaults", () => {
  const factoryOptions: MediaProviderFactoryOptions = {
    elizaCloudBaseUrl: "https://test.elizacloud.ai/api/v1",
  };

  it("uses default Eliza Cloud URL when not specified", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ description: "test" }));

    const provider = createVisionProvider(undefined, {});
    await provider.analyze({ imageUrl: "https://example.com/image.jpg" });

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://www.elizacloud.ai/api/v1/media/vision/analyze");
  });

  it("uses default OpenAI model when not specified", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: "description" } }],
      }),
    );

    const config: VisionConfig = {
      mode: "own-key",
      provider: "openai",
      openai: { apiKey: "test-key" }, // No model specified
    };

    const provider = createVisionProvider(config, factoryOptions);
    await provider.analyze({ imageUrl: "https://example.com/image.jpg" });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.model).toBe("gpt-4o");
  });

  it("uses default max tokens when not specified", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        choices: [{ message: { content: "description" } }],
      }),
    );

    const config: VisionConfig = {
      mode: "own-key",
      provider: "openai",
      openai: { apiKey: "test-key" }, // No maxTokens specified
    };

    const provider = createVisionProvider(config, factoryOptions);
    await provider.analyze({ imageUrl: "https://example.com/image.jpg" });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init?.body as string);
    expect(body.max_tokens).toBe(1024);
  });
});

// ===========================================================================
// REQUEST PAYLOAD TESTS
// ===========================================================================

describe("Request payload construction", () => {
  const factoryOptions: MediaProviderFactoryOptions = {
    elizaCloudBaseUrl: "https://test.elizacloud.ai/api/v1",
  };

  it("includes all image generation parameters in request", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ images: [{ url: "https://example.com/image.png" }] }),
    );

    const config: ImageConfig = {
      mode: "own-key",
      provider: "fal",
      fal: { apiKey: "fal-key" },
    };

    const provider = createImageProvider(config, factoryOptions);
    await provider.generate({
      prompt: "A red car",
      size: "landscape_16_9",
      negativePrompt: "blurry, low quality",
      seed: 12345,
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init?.body as string);

    expect(body.prompt).toBe("A red car");
    expect(body.image_size).toBe("landscape_16_9");
    expect(body.negative_prompt).toBe("blurry, low quality");
    expect(body.seed).toBe(12345);
  });

  it("includes video generation parameters correctly", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ video: { url: "https://example.com/video.mp4" } }),
    );

    const config: VideoConfig = {
      mode: "own-key",
      provider: "fal",
      fal: { apiKey: "fal-key" },
    };

    const provider = createVideoProvider(config, factoryOptions);
    await provider.generate({
      prompt: "Ocean waves",
      duration: 10,
      aspectRatio: "9:16",
      imageUrl: "https://example.com/reference.jpg",
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init?.body as string);

    expect(body.prompt).toBe("Ocean waves");
    expect(body.duration).toBe(10);
    expect(body.aspect_ratio).toBe("9:16");
    expect(body.image_url).toBe("https://example.com/reference.jpg");
  });

  it("includes audio generation parameters correctly", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ audio_url: "https://example.com/audio.mp3" }),
    );

    const config: AudioGenConfig = {
      mode: "own-key",
      provider: "suno",
      suno: { apiKey: "suno-key" },
    };

    const provider = createAudioProvider(config, factoryOptions);
    await provider.generate({
      prompt: "Jazz piano",
      duration: 60,
      instrumental: true,
      genre: "jazz",
    });

    const [, init] = fetchMock.mock.calls[0];
    const body = JSON.parse(init?.body as string);

    expect(body.prompt).toBe("Jazz piano");
    expect(body.duration).toBe(60);
    expect(body.instrumental).toBe(true);
    expect(body.genre).toBe("jazz");
  });
});
