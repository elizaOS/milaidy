import type { Plugin } from "@elizaos/core";
// @ts-expect-error - plugin package currently ships without type declarations
import telegramPlugin from "@elizaos/plugin-telegram";
import { TelegramEnhancedService } from "./service.js";

const basePlugin = telegramPlugin as Plugin;

export const telegramEnhancedPlugin: Plugin = {
  ...basePlugin,
  name: `${basePlugin.name}-enhanced`,
  description:
    "Enhanced Telegram plugin with typing indicators, draft streaming, smarter chunking, receipt reactions, and friendlier errors",
  // biome-ignore lint/suspicious/noExplicitAny: Service class extends untyped external module — Plugin.services typing requires this cast
  services: [TelegramEnhancedService as any],
};

export default telegramEnhancedPlugin;
