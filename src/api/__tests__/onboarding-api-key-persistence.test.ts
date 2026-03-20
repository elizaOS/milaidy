import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../config/config", () => ({
  loadElizaConfig: vi.fn(),
  saveElizaConfig: vi.fn(),
}));

import { loadElizaConfig, saveElizaConfig } from "../../config/config";
import { extractAndPersistOnboardingApiKey } from "../server";

const mockLoadElizaConfig = loadElizaConfig as ReturnType<typeof vi.fn>;
const mockSaveElizaConfig = saveElizaConfig as ReturnType<typeof vi.fn>;

describe("extractAndPersistOnboardingApiKey", () => {
  let envSnapshot: Record<string, string | undefined>;

  beforeEach(() => {
    envSnapshot = {
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
      OPENAI_API_KEY: process.env.OPENAI_API_KEY,
      GROQ_API_KEY: process.env.GROQ_API_KEY,
    };
    mockLoadElizaConfig.mockReturnValue({ env: {} });
    mockSaveElizaConfig.mockClear();
  });

  afterEach(() => {
    for (const [key, value] of Object.entries(envSnapshot)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  });

  it("persists Anthropic API key from connection.apiKey to config and process.env", () => {
    const config = { env: {} } as Record<string, unknown>;
    mockLoadElizaConfig.mockReturnValue(config);

    const result = extractAndPersistOnboardingApiKey({
      name: "TestAgent",
      connection: {
        kind: "local-provider",
        provider: "anthropic",
        apiKey: "sk-ant-test-key-123",
      },
    });

    expect(result).toBe("ANTHROPIC_API_KEY");
    expect(mockSaveElizaConfig).toHaveBeenCalledTimes(1);

    const savedConfig = mockSaveElizaConfig.mock.calls[0][0];
    expect(savedConfig.env.ANTHROPIC_API_KEY).toBe("sk-ant-test-key-123");
    expect(savedConfig.subscriptionProvider).toBe("anthropic");
    expect(process.env.ANTHROPIC_API_KEY).toBe("sk-ant-test-key-123");
  });

  it("persists OpenAI API key", () => {
    const config = { env: {} } as Record<string, unknown>;
    mockLoadElizaConfig.mockReturnValue(config);

    const result = extractAndPersistOnboardingApiKey({
      connection: {
        provider: "openai",
        apiKey: "sk-openai-test-key",
      },
    });

    expect(result).toBe("OPENAI_API_KEY");
    const savedConfig = mockSaveElizaConfig.mock.calls[0][0];
    expect(savedConfig.env.OPENAI_API_KEY).toBe("sk-openai-test-key");
    expect(savedConfig.subscriptionProvider).toBe("openai");
  });

  it("returns null when connection field is missing", () => {
    const result = extractAndPersistOnboardingApiKey({
      name: "TestAgent",
    });

    expect(result).toBeNull();
    expect(mockSaveElizaConfig).not.toHaveBeenCalled();
  });

  it("returns null when apiKey is empty", () => {
    const result = extractAndPersistOnboardingApiKey({
      connection: {
        provider: "anthropic",
        apiKey: "   ",
      },
    });

    expect(result).toBeNull();
    expect(mockSaveElizaConfig).not.toHaveBeenCalled();
  });

  it("returns null when apiKey is missing", () => {
    const result = extractAndPersistOnboardingApiKey({
      connection: {
        provider: "anthropic",
      },
    });

    expect(result).toBeNull();
    expect(mockSaveElizaConfig).not.toHaveBeenCalled();
  });

  it("returns null for unknown provider", () => {
    const result = extractAndPersistOnboardingApiKey({
      connection: {
        provider: "unknown-provider",
        apiKey: "some-key",
      },
    });

    expect(result).toBeNull();
    expect(mockSaveElizaConfig).not.toHaveBeenCalled();
  });

  it("creates env object on config if missing", () => {
    const config = {} as Record<string, unknown>;
    mockLoadElizaConfig.mockReturnValue(config);

    const result = extractAndPersistOnboardingApiKey({
      connection: {
        provider: "groq",
        apiKey: "gsk-groq-test",
      },
    });

    expect(result).toBe("GROQ_API_KEY");
    const savedConfig = mockSaveElizaConfig.mock.calls[0][0];
    expect(savedConfig.env.GROQ_API_KEY).toBe("gsk-groq-test");
  });

  it("handles google-genai provider", () => {
    const config = { env: {} } as Record<string, unknown>;
    mockLoadElizaConfig.mockReturnValue(config);

    const result = extractAndPersistOnboardingApiKey({
      connection: {
        provider: "google-genai",
        apiKey: "AIza-google-key",
      },
    });

    expect(result).toBe("GOOGLE_GENERATIVE_AI_API_KEY");
  });

  it("returns null when provider is not a string", () => {
    const result = extractAndPersistOnboardingApiKey({
      connection: {
        provider: 123,
        apiKey: "some-key",
      },
    });

    expect(result).toBeNull();
  });
});
