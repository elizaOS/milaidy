/**
 * DexScreener Actions — elizaOS actions for agent-driven token scanning.
 *
 * Actions:
 *   DEX_SCAN          — Scan for hot tokens across chains
 *   DEX_SEARCH         — Search for a specific token or pair
 *   DEX_INSPECT        — Deep-inspect a token on a chain
 *   DEX_CONFIGURE_ALERT — Create or update an alert rule with optional auto-hook
 *
 * @module plugins/dexscreener/actions
 */

import crypto from "node:crypto";
import type {
  Action,
  ActionResult,
  HandlerCallback,
  HandlerOptions,
  IAgentRuntime,
  Memory,
  State,
} from "@elizaos/core";
import { DexScreenerClient } from "./client";
import { loadConfig, saveConfig } from "./config-store";
import { DexScanner } from "./scanner";
import type {
  AlertRule,
  DexScreenerPluginConfig,
  ScanFilters,
  TokenCandidate,
} from "./types";
import { DEFAULT_ALERT_RULE, DEFAULT_SCAN_FILTERS } from "./types";

function buildFilters(
  config: DexScreenerPluginConfig,
  overrides?: Partial<ScanFilters>,
): ScanFilters {
  return {
    ...DEFAULT_SCAN_FILTERS,
    ...(config.filters ?? {}),
    ...(overrides ?? {}),
  };
}

function formatCandidate(c: TokenCandidate, idx: number): string {
  const risk =
    c.risk.flags.length > 0 ? ` [risk: ${c.risk.flags.join(", ")}]` : "";
  return (
    `${idx + 1}. **${c.pair.chainId}:${c.pair.baseSymbol}** — ` +
    `score ${c.score.toFixed(1)}, ` +
    `1h ${c.pair.priceChangeH1 >= 0 ? "+" : ""}${c.pair.priceChangeH1.toFixed(2)}%, ` +
    `vol24 $${c.pair.volumeH24.toLocaleString()}, ` +
    `liq $${c.pair.liquidityUsd.toLocaleString()}` +
    `${risk}` +
    (c.tags.length > 0 ? ` [${c.tags.join(", ")}]` : "") +
    (c.pair.pairUrl ? `\n   ${c.pair.pairUrl}` : "")
  );
}

// ---------- DEX_SCAN ----------

const SCAN_KEYWORDS = [
  "scan tokens",
  "scan dex",
  "hot tokens",
  "dex scan",
  "dexscreener scan",
  "token scan",
  "find hot",
  "scan for tokens",
  "scan solana",
  "scan base",
  "scan ethereum",
];

export const dexScanAction: Action = {
  name: "DEX_SCAN",
  similes: ["DEXSCREENER_SCAN", "SCAN_TOKENS", "HOT_TOKENS"],
  description:
    "Scan DexScreener for hot tokens across configured chains. Scores tokens 0-100 based on volume, liquidity, momentum, and flow pressure.",
  validate: async (_runtime, message) => {
    const text = message.content.text?.toLowerCase() ?? "";
    return SCAN_KEYWORDS.some((kw) => text.includes(kw));
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: HandlerOptions,
    callback?: HandlerCallback,
  ): Promise<ActionResult | undefined> => {
    const config = loadConfig(runtime);

    // Parse chains from message if mentioned
    const text = message.content.text?.toLowerCase() ?? "";
    const mentionedChains: string[] = [];
    for (const chain of [
      "solana",
      "base",
      "ethereum",
      "bsc",
      "arbitrum",
    ]) {
      if (text.includes(chain)) mentionedChains.push(chain);
    }

    const filters = buildFilters(config, {
      ...(mentionedChains.length > 0 ? { chains: mentionedChains } : {}),
    });

    try {
      const client = new DexScreenerClient(config.cacheTtlSeconds);
      const scanner = new DexScanner(client);
      const candidates = await scanner.scan(filters);

      if (candidates.length === 0) {
        const responseText =
          "No hot tokens found matching current filters. Try broadening your scan criteria.";
        if (callback) {
          await callback({ text: responseText, action: "DEX_SCAN" });
        }
        return { success: true, text: responseText };
      }

      const lines = candidates.map((c, i) => formatCandidate(c, i));
      const responseText = [
        `## DexScreener Scan Results`,
        `Found **${candidates.length}** hot tokens on ${filters.chains.join(", ")}:`,
        "",
        ...lines,
      ].join("\n");

      if (callback) {
        await callback({
          text: responseText,
          action: "DEX_SCAN",
          metadata: {
            candidateCount: candidates.length,
            chains: filters.chains,
          },
        });
      }

      return {
        success: true,
        text: responseText,
        data: {
          candidates: candidates.map((c) => ({
            chainId: c.pair.chainId,
            token: c.pair.baseSymbol,
            score: c.score,
            tags: c.tags,
            risk: c.risk.flags,
          })),
        },
      };
    } catch (error) {
      const errText =
        error instanceof Error ? error.message : "Scan failed";
      return { success: false, text: errText };
    }
  },
};

// ---------- DEX_SEARCH ----------

const SEARCH_KEYWORDS = [
  "search token",
  "search dex",
  "dex search",
  "find token",
  "look up token",
  "dexscreener search",
];

export const dexSearchAction: Action = {
  name: "DEX_SEARCH",
  similes: ["DEXSCREENER_SEARCH", "SEARCH_TOKEN", "FIND_TOKEN"],
  description: "Search DexScreener for a specific token or trading pair.",
  validate: async (_runtime, message) => {
    const text = message.content.text?.toLowerCase() ?? "";
    return SEARCH_KEYWORDS.some((kw) => text.includes(kw));
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: HandlerOptions,
    callback?: HandlerCallback,
  ): Promise<ActionResult | undefined> => {
    const config = loadConfig(runtime);
    const text = message.content.text ?? "";

    // Extract the search query — take everything after keyword
    let query = text;
    for (const kw of SEARCH_KEYWORDS) {
      const idx = text.toLowerCase().indexOf(kw);
      if (idx >= 0) {
        query = text.slice(idx + kw.length).trim();
        break;
      }
    }
    if (!query) {
      return {
        success: false,
        text: "Please provide a token name or symbol to search for.",
      };
    }

    try {
      const client = new DexScreenerClient(config.cacheTtlSeconds);
      const scanner = new DexScanner(client);
      const results = await scanner.searchTokens(query, 10);

      if (results.length === 0) {
        const responseText = `No results found for "${query}".`;
        if (callback) await callback({ text: responseText, action: "DEX_SEARCH" });
        return { success: true, text: responseText };
      }

      const lines = results.map((p, i) => {
        const vol = p.volumeH24 > 0 ? `vol24 $${p.volumeH24.toLocaleString()}` : "no volume";
        const liq = p.liquidityUsd > 0 ? `liq $${p.liquidityUsd.toLocaleString()}` : "";
        return `${i + 1}. **${p.chainId}:${p.baseSymbol}** (${p.baseName}) — $${p.priceUsd.toPrecision(4)}, ${vol}${liq ? `, ${liq}` : ""}${p.pairUrl ? `\n   ${p.pairUrl}` : ""}`;
      });

      const responseText = [
        `## Search Results for "${query}"`,
        "",
        ...lines,
      ].join("\n");

      if (callback) await callback({ text: responseText, action: "DEX_SEARCH" });
      return { success: true, text: responseText };
    } catch (error) {
      const errText = error instanceof Error ? error.message : "Search failed";
      return { success: false, text: errText };
    }
  },
};

// ---------- DEX_INSPECT ----------

const INSPECT_KEYWORDS = [
  "inspect token",
  "token details",
  "dex inspect",
  "token info",
  "pair info",
];

export const dexInspectAction: Action = {
  name: "DEX_INSPECT",
  similes: ["DEXSCREENER_INSPECT", "TOKEN_DETAILS", "TOKEN_INFO"],
  description:
    "Get detailed information about a specific token on a chain from DexScreener.",
  validate: async (_runtime, message) => {
    const text = message.content.text?.toLowerCase() ?? "";
    return INSPECT_KEYWORDS.some((kw) => text.includes(kw));
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: HandlerOptions,
    callback?: HandlerCallback,
  ): Promise<ActionResult | undefined> => {
    const config = loadConfig(runtime);
    const text = message.content.text ?? "";

    // Try to extract chain:address pattern
    const match = text.match(
      /\b(solana|base|ethereum|bsc|arbitrum)[:\s]+([a-zA-Z0-9]+)\b/i,
    );
    if (!match) {
      return {
        success: false,
        text: 'Please provide a chain and token address, e.g. "inspect token solana:EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"',
      };
    }

    const chainId = match[1].toLowerCase();
    const tokenAddress = match[2];

    try {
      const client = new DexScreenerClient(config.cacheTtlSeconds);
      const scanner = new DexScanner(client);
      const pairs = await scanner.inspectToken(chainId, tokenAddress);

      if (pairs.length === 0) {
        const responseText = `No pairs found for ${chainId}:${tokenAddress}`;
        if (callback) await callback({ text: responseText, action: "DEX_INSPECT" });
        return { success: true, text: responseText };
      }

      const top = pairs[0];
      const lines = [
        `## ${top.baseSymbol} (${top.baseName}) on ${top.chainId}`,
        "",
        `- **Price:** $${top.priceUsd}`,
        `- **Volume 24h:** $${top.volumeH24.toLocaleString()}`,
        `- **Volume 1h:** $${top.volumeH1.toLocaleString()}`,
        `- **Liquidity:** $${top.liquidityUsd.toLocaleString()}`,
        `- **Market Cap:** $${top.marketCap.toLocaleString()}`,
        `- **1h Change:** ${top.priceChangeH1 >= 0 ? "+" : ""}${top.priceChangeH1.toFixed(2)}%`,
        `- **24h Change:** ${top.priceChangeH24 >= 0 ? "+" : ""}${top.priceChangeH24.toFixed(2)}%`,
        `- **Buys/Sells 1h:** ${top.buysH1} / ${top.sellsH1}`,
        `- **Buys/Sells 24h:** ${top.buysH24} / ${top.sellsH24}`,
        `- **DEX:** ${top.dexId}`,
        top.pairUrl ? `- **Link:** ${top.pairUrl}` : "",
        "",
        pairs.length > 1
          ? `*${pairs.length} trading pairs found. Showing top pair by liquidity.*`
          : "",
      ];

      const responseText = lines.filter(Boolean).join("\n");
      if (callback) await callback({ text: responseText, action: "DEX_INSPECT" });
      return { success: true, text: responseText };
    } catch (error) {
      const errText = error instanceof Error ? error.message : "Inspect failed";
      return { success: false, text: errText };
    }
  },
};

// ---------- DEX_CONFIGURE_ALERT ----------

const ALERT_KEYWORDS = [
  "dex alert",
  "dexscreener alert",
  "token alert",
  "set alert",
  "create alert",
  "configure alert",
  "auto hook",
  "alert hook",
];

export const dexConfigureAlertAction: Action = {
  name: "DEX_CONFIGURE_ALERT",
  similes: [
    "DEXSCREENER_ALERT",
    "SET_TOKEN_ALERT",
    "CREATE_DEX_ALERT",
    "DEX_AUTO_HOOK",
  ],
  description:
    "Create or configure a DexScreener alert rule that fires as a Milady hook when conditions are met. " +
    "Specify minimum score, chains, required tags, and whether to auto-hook.",
  validate: async (_runtime, message) => {
    const text = message.content.text?.toLowerCase() ?? "";
    return ALERT_KEYWORDS.some((kw) => text.includes(kw));
  },
  handler: async (
    runtime: IAgentRuntime,
    message: Memory,
    _state?: State,
    _options?: HandlerOptions,
    callback?: HandlerCallback,
  ): Promise<ActionResult | undefined> => {
    const text = message.content.text ?? "";

    // Parse configuration from natural language
    const chains: string[] = [];
    for (const chain of ["solana", "base", "ethereum", "bsc", "arbitrum"]) {
      if (text.toLowerCase().includes(chain)) chains.push(chain);
    }

    // Extract min score
    let minScore = DEFAULT_ALERT_RULE.minScore;
    const scoreMatch = text.match(
      /(?:min(?:imum)?\s*)?score\s*(?:>=?\s*|above\s*|over\s*)?(\d+)/i,
    );
    if (scoreMatch) minScore = Number(scoreMatch[1]);

    // Extract cooldown
    let cooldownSeconds = DEFAULT_ALERT_RULE.cooldownSeconds;
    const cooldownMatch = text.match(
      /cooldown\s*(?:of\s*)?(\d+)\s*(s|sec|seconds?|m|min|minutes?)/i,
    );
    if (cooldownMatch) {
      const val = Number(cooldownMatch[1]);
      cooldownSeconds = cooldownMatch[2].startsWith("m") ? val * 60 : val;
    }

    // Determine if auto-hook is explicitly mentioned
    const wantsAutoHook =
      text.toLowerCase().includes("auto hook") ||
      text.toLowerCase().includes("autohook") ||
      text.toLowerCase().includes("automatic hook") ||
      text.toLowerCase().includes("hook");

    // Extract a name
    let name = "DexScreener Alert";
    const nameMatch = text.match(
      /(?:name|call(?:ed)?|titled?)\s*[:\s]?\s*"?([^"]+)"?/i,
    );
    if (nameMatch) name = nameMatch[1].trim().slice(0, 64);

    const rule: AlertRule = {
      id: crypto.randomUUID(),
      name,
      enabled: true,
      minScore,
      cooldownSeconds,
      chains,
      channels: wantsAutoHook
        ? ["hook", "log"]
        : ["log"],
      requiredTags: [],
      blockedRiskFlags: [],
      autoHook: wantsAutoHook,
      hookAction: "dexscreener:alert",
    };

    // Store rule in runtime settings
    const config = loadConfig(runtime);
    const existingRules = config.alertRules ?? [];
    const updatedRules = [...existingRules, rule];

    // Persist through runtime
    saveConfig(runtime, { ...config, alertRules: updatedRules });

    const hookStatus = wantsAutoHook
      ? "Alerts will fire as **Milady hooks** (`gateway:dexscreener:alert`) so other hooks/plugins can react automatically."
      : "Alerts will be logged. Add `auto hook` to enable automatic Milady hook integration.";

    const responseText = [
      `## Alert Rule Created`,
      "",
      `- **Name:** ${rule.name}`,
      `- **ID:** ${rule.id}`,
      `- **Min Score:** ${rule.minScore}`,
      `- **Cooldown:** ${rule.cooldownSeconds}s`,
      `- **Chains:** ${rule.chains.length > 0 ? rule.chains.join(", ") : "all configured"}`,
      `- **Auto-Hook:** ${rule.autoHook ? "enabled" : "disabled"}`,
      "",
      hookStatus,
    ].join("\n");

    if (callback) {
      await callback({
        text: responseText,
        action: "DEX_CONFIGURE_ALERT",
        metadata: { ruleId: rule.id },
      });
    }

    return {
      success: true,
      text: responseText,
      data: { ruleId: rule.id, autoHook: rule.autoHook },
    };
  },
};
