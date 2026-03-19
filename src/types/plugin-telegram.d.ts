/**
 * Type declarations for @elizaos/plugin-telegram.
 *
 * The published package ships JS-only (no .d.ts). These declarations are
 * derived from ../plugins/plugin-telegram/src and cover the exports that
 * src/plugins/telegram-enhanced/ actually imports.
 *
 * TODO: remove once plugin-telegram publishes its own declarations.
 */
declare module "@elizaos/plugin-telegram" {
  import type { Plugin, Service } from "@elizaos/core";

  export class TelegramService extends Service {
    bot: unknown;
    messageManager: unknown;
    options: Record<string, unknown>;
    static serviceType: string;
  }

  export class MessageManager {
    sendMessageInChunks(
      ctx: unknown,
      content: unknown,
      replyToMessageId?: number,
    ): Promise<unknown[]>;
  }

  const telegramPlugin: Plugin;
  export default telegramPlugin;
}
