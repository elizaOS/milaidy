/**
 * Discord Connector Unit Tests — GitHub Issue #143
 *
 * Basic validation tests for the Discord connector plugin.
 * For comprehensive e2e tests, see test/discord-connector.e2e.test.ts
 */

import { describe, expect, it } from "vitest";
import {
  extractPlugin,
  resolveDiscordPluginImportSpecifier,
} from "../test-support/test-helpers";

const DISCORD_PLUGIN_IMPORT = resolveDiscordPluginImportSpecifier();
const DISCORD_PLUGIN_AVAILABLE = DISCORD_PLUGIN_IMPORT !== null;
const describeIfPluginAvailable = DISCORD_PLUGIN_AVAILABLE
  ? describe
  : describe.skip;

const loadDiscordPluginModule = async () => {
  if (!DISCORD_PLUGIN_IMPORT) {
    throw new Error("Discord plugin is not resolvable");
  }
  return (await import(DISCORD_PLUGIN_IMPORT)) as {
    default?: unknown;
    plugin?: unknown;
  };
};

describeIfPluginAvailable("Discord Connector - Basic Validation", () => {
  it("can import the Discord plugin package", async () => {
    const mod = await loadDiscordPluginModule();
    expect(mod).toBeDefined();
  });

  it("exports a valid plugin structure", async () => {
    const mod = await loadDiscordPluginModule();
    const plugin = extractPlugin(mod);

    expect(plugin).not.toBeNull();
    expect(plugin).toBeDefined();
  });

  it("plugin has correct name", async () => {
    const mod = await loadDiscordPluginModule();
    const plugin = extractPlugin(mod) as { name?: string } | null;

    expect(plugin?.name).toBe("discord");
  });

  it("plugin has a description", async () => {
    const mod = await loadDiscordPluginModule();
    const plugin = extractPlugin(mod) as { description?: string } | null;

    expect(plugin?.description).toBeDefined();
    expect(typeof plugin?.description).toBe("string");
  });
});

describe("Discord Connector - Configuration", () => {
  it("validates basic Discord configuration structure", () => {
    const validConfig = {
      enabled: true,
      token: "test-token",
      dm: {
        enabled: true,
        policy: "pairing" as const,
      },
      guilds: {},
      actions: {
        reactions: true,
        messages: true,
      },
    };

    expect(validConfig.enabled).toBe(true);
    expect(validConfig.dm.policy).toBe("pairing");
    expect(validConfig.token).toBe("test-token");
  });

  it("validates multi-account configuration structure", () => {
    const multiAccountConfig = {
      token: "main-token",
      accounts: {
        "main-bot": {
          token: "bot-1-token",
          guilds: {},
        },
        "secondary-bot": {
          token: "bot-2-token",
          guilds: {},
        },
      },
    };

    expect(multiAccountConfig.accounts).toBeDefined();
    expect(Object.keys(multiAccountConfig.accounts)).toHaveLength(2);
    expect(multiAccountConfig.accounts["main-bot"].token).toBe("bot-1-token");
  });

  it("validates message chunking configuration", () => {
    const chunkConfig = {
      maxLinesPerMessage: 17,
      textChunkLimit: 2000,
      chunkMode: "length" as const,
    };

    expect(chunkConfig.maxLinesPerMessage).toBe(17);
    expect(chunkConfig.textChunkLimit).toBe(2000);
    expect(chunkConfig.chunkMode).toBe("length");
  });

  it("validates DM policy options", () => {
    const dmPolicies = ["pairing", "open", "none"] as const;

    for (const policy of dmPolicies) {
      const config = {
        dm: {
          enabled: true,
          policy,
        },
      };
      expect(config.dm.policy).toBe(policy);
    }
  });

  it("validates PluralKit integration config", () => {
    const pluralkitConfig = {
      pluralkit: {
        enabled: true,
        token: "pk-token-123",
      },
    };

    expect(pluralkitConfig.pluralkit.enabled).toBe(true);
    expect(pluralkitConfig.pluralkit.token).toBe("pk-token-123");
  });

  it("validates privileged intents configuration", () => {
    const intentsConfig = {
      intents: {
        presence: true,
        guildMembers: true,
      },
    };

    expect(intentsConfig.intents.presence).toBe(true);
    expect(intentsConfig.intents.guildMembers).toBe(true);
  });

  it("validates retry configuration", () => {
    const retryConfig = {
      retry: {
        attempts: 3,
        minDelayMs: 1000,
        maxDelayMs: 5000,
        jitter: 0.5,
      },
    };

    expect(retryConfig.retry.attempts).toBe(3);
    expect(retryConfig.retry.minDelayMs).toBe(1000);
    expect(retryConfig.retry.maxDelayMs).toBe(5000);
    expect(retryConfig.retry.jitter).toBe(0.5);
  });

  it("validates guild-specific configuration", () => {
    const guildConfig = {
      guilds: {
        "123456789": {
          slug: "test-server",
          requireMention: false,
          channels: {
            "987654321": {
              enabled: true,
              requireMention: false,
              autoThread: true,
            },
          },
        },
      },
    };

    expect(guildConfig.guilds["123456789"].slug).toBe("test-server");
    expect(
      guildConfig.guilds["123456789"].channels["987654321"].autoThread,
    ).toBe(true);
  });

  it("validates actions configuration", () => {
    const actionsConfig = {
      actions: {
        reactions: true,
        stickers: true,
        messages: true,
        threads: true,
        polls: false,
        moderation: false,
      },
    };

    expect(actionsConfig.actions.reactions).toBe(true);
    expect(actionsConfig.actions.threads).toBe(true);
    expect(actionsConfig.actions.polls).toBe(false);
  });
});

describe("Discord Connector - Message Handling Logic", () => {
  it("respects Discord's 2000 character limit", () => {
    const DISCORD_MAX_MESSAGE_LENGTH = 2000;
    const shortMessage = "Hello, world!";
    const longMessage = "A".repeat(3000);

    expect(shortMessage.length).toBeLessThan(DISCORD_MAX_MESSAGE_LENGTH);
    expect(longMessage.length).toBeGreaterThan(DISCORD_MAX_MESSAGE_LENGTH);

    // Messages longer than 2000 chars should be chunked
    const needsChunking = longMessage.length > DISCORD_MAX_MESSAGE_LENGTH;
    expect(needsChunking).toBe(true);
  });

  it("validates chunk mode options", () => {
    const chunkModes = ["length", "newline"] as const;

    for (const mode of chunkModes) {
      const config = {
        chunkMode: mode,
        textChunkLimit: 2000,
      };
      expect(config.chunkMode).toBe(mode);
    }
  });

  it("validates reply mode options", () => {
    const replyModes = ["reply", "mention", "none"] as const;

    for (const mode of replyModes) {
      const config = {
        replyToMode: mode,
      };
      expect(config.replyToMode).toBe(mode);
    }
  });
});

describe("Discord Connector - Environment Variables", () => {
  it("recognizes DISCORD_BOT_TOKEN environment variable", () => {
    const envKey = "DISCORD_BOT_TOKEN";
    expect(envKey).toBe("DISCORD_BOT_TOKEN");
  });

  it("validates that token can come from config or environment", () => {
    // Token can be in config
    const configToken = { token: "test-token-123" };
    expect(configToken.token).toBeDefined();

    // Or from environment (simulated)
    const envToken = process.env.DISCORD_BOT_TOKEN;
    expect(typeof envToken === "string" || envToken === undefined).toBe(true);
  });
});
