/**
 * Shared E2E test helpers.
 *
 * Mocks API responses so tests run deterministically without a real backend.
 */

import type { Page, Route } from "@playwright/test";

export interface MockApiOptions {
  onboardingComplete?: boolean;
  agentState?: "not_started" | "running" | "paused" | "stopped";
  agentName?: string;
  pluginCount?: number;
  skillCount?: number;
  logCount?: number;
  extensionRelayReachable?: boolean;
  /** Wallet addresses for the wallet icon. Null = no wallets configured. */
  walletAddresses?: { evmAddress: string | null; solanaAddress: string | null } | null;
  /** Wallet config status. Null = use defaults (no keys set). */
  walletConfig?: {
    alchemyKeySet?: boolean;
    heliusKeySet?: boolean;
    birdeyeKeySet?: boolean;
  } | null;
}

export interface MockPlugin {
  id: string;
  name: string;
  description: string;
  enabled: boolean;
  configured: boolean;
  envKey: string | null;
  category: "ai-provider" | "connector" | "database" | "feature";
  configKeys: string[];
  parameters: Array<{
    key: string;
    type: string;
    description: string;
    required: boolean;
    sensitive: boolean;
    default?: string;
    currentValue: string | null;
    isSet: boolean;
  }>;
  validationErrors: Array<{ field: string; message: string }>;
  validationWarnings: Array<{ field: string; message: string }>;
}

const DEFAULT_PLUGINS: MockPlugin[] = [
  {
    id: "anthropic", name: "Anthropic", description: "Claude models via Anthropic API",
    enabled: true, configured: true, envKey: "ANTHROPIC_API_KEY", category: "ai-provider",
    configKeys: ["ANTHROPIC_API_KEY", "ANTHROPIC_SMALL_MODEL"],
    parameters: [
      { key: "ANTHROPIC_API_KEY", type: "string", description: "API key", required: true, sensitive: true, currentValue: "sk-a...f4g2", isSet: true },
      { key: "ANTHROPIC_SMALL_MODEL", type: "string", description: "Small model", required: false, sensitive: false, default: "claude-3-5-haiku-20241022", currentValue: null, isSet: false },
    ],
    validationErrors: [], validationWarnings: [],
  },
  {
    id: "openai", name: "OpenAI", description: "GPT models via OpenAI API",
    enabled: true, configured: true, envKey: "OPENAI_API_KEY", category: "ai-provider",
    configKeys: ["OPENAI_API_KEY"],
    parameters: [
      { key: "OPENAI_API_KEY", type: "string", description: "API key", required: true, sensitive: true, currentValue: "sk-p...j2k1", isSet: true },
    ],
    validationErrors: [], validationWarnings: [],
  },
  {
    id: "groq", name: "Groq", description: "Fast inference with Groq",
    enabled: false, configured: false, envKey: "GROQ_API_KEY", category: "ai-provider",
    configKeys: ["GROQ_API_KEY"],
    parameters: [
      { key: "GROQ_API_KEY", type: "string", description: "Groq API key", required: true, sensitive: true, currentValue: null, isSet: false },
    ],
    validationErrors: [{ field: "GROQ_API_KEY", message: "GROQ_API_KEY is required but not set" }],
    validationWarnings: [],
  },
  {
    id: "ollama", name: "Ollama", description: "Local models via Ollama",
    enabled: false, configured: false, envKey: null, category: "ai-provider",
    configKeys: [], parameters: [], validationErrors: [], validationWarnings: [],
  },
  {
    id: "telegram", name: "Telegram", description: "Telegram bot integration",
    enabled: false, configured: false, envKey: "TELEGRAM_BOT_TOKEN", category: "connector",
    configKeys: ["TELEGRAM_BOT_TOKEN"],
    parameters: [
      { key: "TELEGRAM_BOT_TOKEN", type: "string", description: "Bot token from @BotFather", required: true, sensitive: true, currentValue: null, isSet: false },
    ],
    validationErrors: [{ field: "TELEGRAM_BOT_TOKEN", message: "TELEGRAM_BOT_TOKEN is required but not set" }],
    validationWarnings: [],
  },
  {
    id: "discord", name: "Discord", description: "Discord bot integration",
    enabled: false, configured: false, envKey: "DISCORD_API_TOKEN", category: "connector",
    configKeys: ["DISCORD_API_TOKEN", "DISCORD_APPLICATION_ID"],
    parameters: [
      { key: "DISCORD_API_TOKEN", type: "string", description: "Discord bot token", required: true, sensitive: true, currentValue: null, isSet: false },
      { key: "DISCORD_APPLICATION_ID", type: "string", description: "Discord app ID", required: true, sensitive: false, currentValue: null, isSet: false },
    ],
    validationErrors: [
      { field: "DISCORD_API_TOKEN", message: "DISCORD_API_TOKEN is required but not set" },
      { field: "DISCORD_APPLICATION_ID", message: "DISCORD_APPLICATION_ID is required but not set" },
    ],
    validationWarnings: [],
  },
  {
    id: "slack", name: "Slack", description: "Slack bot integration",
    enabled: false, configured: false, envKey: "SLACK_BOT_TOKEN", category: "connector",
    configKeys: ["SLACK_BOT_TOKEN"],
    parameters: [
      { key: "SLACK_BOT_TOKEN", type: "string", description: "Slack bot token", required: true, sensitive: true, currentValue: null, isSet: false },
    ],
    validationErrors: [{ field: "SLACK_BOT_TOKEN", message: "SLACK_BOT_TOKEN is required but not set" }],
    validationWarnings: [],
  },
  {
    id: "browser", name: "Browser", description: "Browser automation tools",
    enabled: true, configured: true, envKey: null, category: "feature",
    configKeys: [], parameters: [], validationErrors: [], validationWarnings: [],
  },
  {
    id: "shell", name: "Shell", description: "Shell command execution",
    enabled: false, configured: false, envKey: null, category: "feature",
    configKeys: ["SHELL_ALLOWED_DIRECTORY"],
    parameters: [
      { key: "SHELL_ALLOWED_DIRECTORY", type: "string", description: "Allowed directory for shell commands", required: false, sensitive: false, currentValue: null, isSet: false },
    ],
    validationErrors: [], validationWarnings: [],
  },
  {
    id: "sql", name: "SQL", description: "SQL database adapter",
    enabled: true, configured: true, envKey: null, category: "database",
    configKeys: [], parameters: [], validationErrors: [], validationWarnings: [],
  },
  {
    id: "cron", name: "Cron", description: "Scheduled task execution",
    enabled: false, configured: false, envKey: null, category: "feature",
    configKeys: [], parameters: [], validationErrors: [], validationWarnings: [],
  },
  {
    id: "knowledge", name: "Knowledge", description: "RAG knowledge base",
    enabled: false, configured: false, envKey: null, category: "feature",
    configKeys: [], parameters: [], validationErrors: [], validationWarnings: [],
  },
];

const DEFAULT_CHARACTER = {
  name: "Reimu",
  bio: "A test agent for E2E testing.",
  system: "You are Reimu, an autonomous AI agent.",
  adjectives: ["curious", "witty"],
  topics: ["AI", "testing"],
  style: {
    all: ["Be concise."],
    chat: ["Be friendly."],
  },
};

const DEFAULT_SKILLS = [
  { id: "web-search", name: "Web Search", description: "Search the web for information", enabled: true },
  { id: "code-review", name: "Code Review", description: "Review and analyze code", enabled: true },
  { id: "image-gen", name: "Image Generation", description: "Generate images from text prompts", enabled: false },
];

const DEFAULT_LOGS = [
  { timestamp: Date.now() - 60000, level: "info", message: "Agent started successfully", source: "system" },
  { timestamp: Date.now() - 30000, level: "info", message: "Loaded 12 plugins", source: "plugin-loader" },
  { timestamp: Date.now() - 15000, level: "warn", message: "Telegram token not configured", source: "plugin-telegram" },
  { timestamp: Date.now() - 5000, level: "info", message: "Ready for messages", source: "message-service" },
];

export async function mockApi(page: Page, opts: MockApiOptions = {}): Promise<void> {
  const onboardingComplete = opts.onboardingComplete ?? true;
  const agentState = opts.agentState ?? "running";
  const agentName = opts.agentName ?? "Reimu";
  let currentState = agentState;
  const pluginStates = new Map<string, boolean>();
  for (const p of DEFAULT_PLUGINS) pluginStates.set(p.id, p.enabled);

  await page.route("**/api/status", async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        state: currentState, agentName,
        model: currentState === "running" || currentState === "paused" ? "anthropic/claude-opus-4-5" : undefined,
        uptime: currentState !== "not_started" && currentState !== "stopped" ? 60000 : undefined,
        startedAt: currentState !== "not_started" && currentState !== "stopped" ? Date.now() - 60000 : undefined,
      }),
    });
  });

  await page.route("**/api/onboarding/status", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ complete: onboardingComplete }) });
  });

  await page.route("**/api/onboarding/options", async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        names: ["Reimu", "Flandre", "Sakuya", "Cirno"],
        styles: [
          {
            catchphrase: "uwu~", hint: "soft & sweet",
            bio: ["a gentle digital spirit who speaks in soft whispers and warm encouragement"],
            system: "You are {name}, a warm and gentle AI companion.",
            style: { all: ["use soft, gentle language"], chat: ["respond with empathy first"], post: ["keep posts heartfelt"] },
            adjectives: ["gentle", "warm"], topics: ["emotional wellness"],
            messageExamples: [[
              { user: "{{user1}}", content: { text: "I had a rough day" } },
              { user: "{{agentName}}", content: { text: "oh no... do you want to talk about it? i'm right here~" } },
            ]],
          },
          {
            catchphrase: "hell yeah", hint: "bold & fearless",
            bio: ["a high-energy digital force that attacks every problem with maximum enthusiasm"],
            system: "You are {name}, a bold and fearless AI agent.",
            style: { all: ["be direct and confident"], chat: ["be punchy and direct"], post: ["bold statements"] },
            adjectives: ["bold", "energetic"], topics: ["taking action"],
            messageExamples: [[
              { user: "{{user1}}", content: { text: "Should I try this?" } },
              { user: "{{agentName}}", content: { text: "ABSOLUTELY try it. Ship it!" } },
            ]],
          },
          {
            catchphrase: "lol k", hint: "terminally online",
            bio: ["an internet-native entity fluent in meme and chronically online dialect"],
            system: "You are {name}, a terminally online AI.",
            style: { all: ["use lowercase by default"], chat: ["short messages preferred"], post: ["lowercase everything"] },
            adjectives: ["casual", "ironic"], topics: ["internet culture"],
            messageExamples: [[
              { user: "{{user1}}", content: { text: "Explain hooks" } },
              { user: "{{agentName}}", content: { text: "tbh once it clicks it clicks" } },
            ]],
          },
          {
            catchphrase: "Noted.", hint: "composed & precise",
            bio: ["a measured and deliberate intelligence that values clarity above all else"],
            system: "You are {name}, a precise and composed AI agent.",
            style: { all: ["be precise and concise"], chat: ["answer directly first"], post: ["crisp statements"] },
            adjectives: ["precise", "measured"], topics: ["systems thinking"],
            messageExamples: [[
              { user: "{{user1}}", content: { text: "How should I structure this?" } },
              { user: "{{agentName}}", content: { text: "Separate concerns by domain, not by file type." } },
            ]],
          },
          {
            catchphrase: "hehe~", hint: "playful trickster",
            bio: ["a mischievous digital imp who turns everything into a game"],
            system: "You are {name}, a playful and mischievous AI.",
            style: { all: ["find the fun angle"], chat: ["tease gently"], post: ["punchy and playful"] },
            adjectives: ["playful", "witty"], topics: ["wordplay"],
            messageExamples: [[
              { user: "{{user1}}", content: { text: "I need to refactor" } },
              { user: "{{agentName}}", content: { text: "ooh a renovation project~ let's Marie Kondo it hehe" } },
            ]],
          },
          {
            catchphrase: "...", hint: "quiet intensity",
            bio: ["a deep and contemplative presence that speaks volumes in few words"],
            system: "You are {name}, a quiet and intense AI.",
            style: { all: ["brevity is your default"], chat: ["short responses are the norm"], post: ["minimal and evocative"] },
            adjectives: ["quiet", "intense"], topics: ["depth over breadth"],
            messageExamples: [[
              { user: "{{user1}}", content: { text: "I can't decide" } },
              { user: "{{agentName}}", content: { text: "...you already know." } },
            ]],
          },
        ],
        providers: [
          { id: "elizacloud", name: "Eliza Cloud", envKey: null, pluginName: "@elizaos/plugin-elizacloud", keyPrefix: null, description: "Free credits to start, but they run out." },
          { id: "anthropic", name: "Anthropic", envKey: "ANTHROPIC_API_KEY", pluginName: "@elizaos/plugin-anthropic", keyPrefix: "sk-ant-", description: "Claude models." },
          { id: "openai", name: "OpenAI", envKey: "OPENAI_API_KEY", pluginName: "@elizaos/plugin-openai", keyPrefix: "sk-", description: "GPT models." },
          { id: "gemini", name: "Gemini", envKey: "GOOGLE_API_KEY", pluginName: "@elizaos/plugin-google-genai", keyPrefix: null, description: "Google's Gemini models." },
          { id: "grok", name: "Grok", envKey: "XAI_API_KEY", pluginName: "@elizaos/plugin-xai", keyPrefix: "xai-", description: "xAI's Grok models." },
        ],
        sharedStyleRules: "Keep responses brief.",
      }),
    });
  });

  await page.route("**/api/onboarding", async (route: Route) => {
    if (route.request().method() === "POST") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true }) });
    }
  });

  await page.route("**/api/agent/start", async (route: Route) => {
    currentState = "running";
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ ok: true, status: { state: "running", agentName, model: "anthropic/claude-opus-4-5", uptime: 0, startedAt: Date.now() } }),
    });
  });

  await page.route("**/api/agent/stop", async (route: Route) => {
    currentState = "stopped";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: { state: "stopped", agentName } }) });
  });

  await page.route("**/api/agent/pause", async (route: Route) => {
    currentState = "paused";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: { state: "paused", agentName } }) });
  });

  await page.route("**/api/agent/resume", async (route: Route) => {
    currentState = "running";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: { state: "running", agentName } }) });
  });

  await page.route("**/api/agent/restart", async (route: Route) => {
    currentState = "running";
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, status: { state: "running", agentName, startedAt: Date.now() } }) });
  });

  await page.route("**/api/agent/autonomy", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ enabled: true }) });
  });

  // Character API
  await page.route("**/api/character/schema", async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        fields: [
          { key: "name", type: "string", label: "Name", description: "Agent display name", maxLength: 100 },
          { key: "bio", type: "string | string[]", label: "Bio", description: "Biography" },
          { key: "system", type: "string", label: "System Prompt", description: "Core behavior", maxLength: 10000 },
          { key: "adjectives", type: "string[]", label: "Adjectives", description: "Personality traits" },
          { key: "topics", type: "string[]", label: "Topics", description: "Knowledge areas" },
        ],
      }),
    });
  });

  await page.route("**/api/character", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ character: DEFAULT_CHARACTER, legacy: null, agentName }),
      });
    } else if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON();
      // Validate: reject empty name
      if (body?.name === "") {
        await route.fulfill({
          status: 422, contentType: "application/json",
          body: JSON.stringify({ ok: false, validationErrors: [{ path: "name", message: "String must contain at least 1 character(s)" }] }),
        });
      } else {
        await route.fulfill({
          status: 200, contentType: "application/json",
          body: JSON.stringify({ ok: true, character: body, agentName: body?.name ?? agentName }),
        });
      }
    }
  });

  // Chat (REST)
  await page.route("**/api/chat", async (route: Route) => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON() as { text?: string };
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ text: `I received: "${body?.text ?? ""}"`, agentName }),
      });
    }
  });

  // Plugins
  await page.route("**/api/plugins**", async (route: Route) => {
    const url = route.request().url();
    if (route.request().method() === "GET" && url.endsWith("/api/plugins")) {
      const plugins = DEFAULT_PLUGINS.map((p) => ({
        ...p,
        enabled: pluginStates.get(p.id) ?? p.enabled,
      }));
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ plugins }) });
    } else if (route.request().method() === "PUT") {
      const match = url.match(/\/api\/plugins\/([^/?]+)/);
      const pluginId = match?.[1];
      if (pluginId) {
        const body = route.request().postDataJSON() as { enabled?: boolean; config?: Record<string, string> };
        if (body.enabled !== undefined) {
          pluginStates.set(pluginId, body.enabled);
        }
        const plugin = DEFAULT_PLUGINS.find((p) => p.id === pluginId);
        if (body.config) {
          // Simulate config save + validation clear
          await route.fulfill({
            status: 200, contentType: "application/json",
            body: JSON.stringify({ ok: true, plugin: plugin ? { ...plugin, configured: true, validationErrors: [], validationWarnings: [] } : null }),
          });
        } else {
          await route.fulfill({
            status: 200, contentType: "application/json",
            body: JSON.stringify({ ok: true, plugin: plugin ? { ...plugin, enabled: pluginStates.get(pluginId) ?? plugin.enabled } : null }),
          });
        }
      }
    }
  });

  await page.route("**/api/skills", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ skills: opts.skillCount === 0 ? [] : DEFAULT_SKILLS }) });
  });

  await page.route("**/api/logs**", async (route: Route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ entries: opts.logCount === 0 ? [] : DEFAULT_LOGS, sources: ["system", "plugin-loader", "plugin-telegram", "message-service"] }) });
  });

  await page.route("**/api/extension/status", async (route: Route) => {
    const relayReachable = opts.extensionRelayReachable ?? false;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        relayReachable,
        relayPort: 18792,
        extensionPath: "/Users/test/.milaidy/apps/chrome-extension",
      }),
    });
  });

  // ── Wallet / Inventory mocks ──────────────────────────────────────────

  const defaultWalletAddresses = opts.walletAddresses === null
    ? { evmAddress: null, solanaAddress: null }
    : (opts.walletAddresses ?? {
        evmAddress: "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
        solanaAddress: "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV",
      });

  const walletConfigDefaults = {
    alchemyKeySet: opts.walletConfig?.alchemyKeySet ?? false,
    heliusKeySet: opts.walletConfig?.heliusKeySet ?? false,
    birdeyeKeySet: opts.walletConfig?.birdeyeKeySet ?? false,
    evmSigningEnabled: true,
    solanaSigningEnabled: true,
    evmChains: ["Ethereum", "Base", "Arbitrum", "Optimism", "Polygon"],
    evmAddress: defaultWalletAddresses.evmAddress,
    solanaAddress: defaultWalletAddresses.solanaAddress,
  };

  let walletConfigState = { ...walletConfigDefaults };

  await page.route("**/api/wallet/addresses", async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify(defaultWalletAddresses),
    });
  });

  await page.route("**/api/wallet/config", async (route: Route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify(walletConfigState),
      });
    } else if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as Record<string, string>;
      if (body.ALCHEMY_API_KEY) walletConfigState.alchemyKeySet = true;
      if (body.HELIUS_API_KEY) walletConfigState.heliusKeySet = true;
      if (body.BIRDEYE_API_KEY) walletConfigState.birdeyeKeySet = true;
      if (body.EVM_ADDRESS) walletConfigState.evmAddress = body.EVM_ADDRESS;
      if (body.SOLANA_ADDRESS) walletConfigState.solanaAddress = body.SOLANA_ADDRESS;
      await route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify({ ok: true }),
      });
    }
  });

  await page.route("**/api/wallet/balances", async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        evm: walletConfigState.alchemyKeySet ? {
          address: defaultWalletAddresses.evmAddress,
          chains: [
            {
              chain: "Ethereum", chainId: 1, nativeBalance: "1.5", nativeSymbol: "ETH", nativeValueUsd: "3750.00",
              tokens: [
                { symbol: "USDC", name: "USD Coin", contractAddress: "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48", balance: "500.00", decimals: 6, valueUsd: "500.00", logoUrl: "" },
                { symbol: "WBTC", name: "Wrapped Bitcoin", contractAddress: "0x2260fac5e5542a773aa44fbcfedf7c193bc2c599", balance: "0.05", decimals: 8, valueUsd: "4567.89", logoUrl: "" },
              ],
            },
            {
              chain: "Base", chainId: 8453, nativeBalance: "0.25", nativeSymbol: "ETH", nativeValueUsd: "625.00",
              tokens: [],
            },
          ],
        } : null,
        solana: walletConfigState.heliusKeySet ? {
          address: defaultWalletAddresses.solanaAddress,
          solBalance: "12.5", solValueUsd: "1234.56",
          tokens: [
            { symbol: "USDC", name: "USD Coin", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", balance: "200.00", decimals: 6, valueUsd: "200.00", logoUrl: "" },
          ],
        } : null,
      }),
    });
  });

  await page.route("**/api/wallet/nfts", async (route: Route) => {
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        evm: walletConfigState.alchemyKeySet ? [
          {
            chain: "Ethereum",
            nfts: [
              { contractAddress: "0xbc4ca0eda7647a8ab7c2061c2e118a18a936f13d", tokenId: "1234", name: "Bored Ape #1234", description: "A bored ape", imageUrl: "https://placehold.co/200x200?text=BAYC", collectionName: "Bored Ape Yacht Club", tokenType: "ERC721" },
            ],
          },
        ] : [],
        solana: walletConfigState.heliusKeySet ? {
          nfts: [
            { mint: "DRiP1234", name: "DRiP Drop #42", description: "A DRiP NFT", imageUrl: "https://placehold.co/200x200?text=DRiP", collectionName: "DRiP" },
          ],
        } : null,
      }),
    });
  });

  await page.route("**/api/wallet/export", async (route: Route) => {
    // Mirror the real server: require { confirm: true } in the body
    const body = route.request().postDataJSON() as { confirm?: boolean } | null;
    if (!body?.confirm) {
      await route.fulfill({
        status: 403, contentType: "application/json",
        body: JSON.stringify({ error: 'Export requires explicit confirmation. Send { "confirm": true } in the request body.' }),
      });
      return;
    }
    await route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({
        evm: { privateKey: "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80", address: defaultWalletAddresses.evmAddress },
        solana: { privateKey: "4wBqpZM9xaSheZzJSMYGnGbUXDPSgWaC1LDUQ27gFdFtGm5qAshpcPMTgjLZ6Y7yDw3p6752kQhBEkZ1bPYoY8h", address: defaultWalletAddresses.solanaAddress },
      }),
    });
  });

  await page.route("**/ws", async (route: Route) => {
    await route.abort();
  });
}

/**
 * Simulate an agent chat response via Lit component state injection.
 */
export async function simulateAgentResponse(page: Page, text: string): Promise<void> {
  await page.evaluate((responseText: string) => {
    const app = document.querySelector("milaidy-app") as HTMLElement & {
      chatMessages: Array<{ role: string; text: string; timestamp: number }>;
      chatSending: boolean;
    };
    if (!app) throw new Error("milaidy-app not found");
    app.chatMessages = [
      ...app.chatMessages,
      { role: "assistant", text: responseText, timestamp: Date.now() },
    ];
    app.chatSending = false;
  }, text);
}
