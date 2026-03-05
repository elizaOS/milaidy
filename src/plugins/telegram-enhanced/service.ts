// @ts-expect-error - plugin package currently ships without type declarations
import { TelegramService } from "@elizaos/plugin-telegram";
import { EnhancedTelegramMessageManager } from "./message-manager.js";

/**
 * Minimal facade for TelegramService which ships without type declarations.
 * We deliberately use `unknown` casts and biome-ignore directives for the
 * class-extension pattern; this is the only reasonable approach when wrapping
 * an untyped external module.
 */

// biome-ignore lint/suspicious/noExplicitAny: TelegramService ships without type declarations — extending it requires an untyped cast
export class TelegramEnhancedService extends (TelegramService as any) {
  static serviceType =
    // biome-ignore lint/suspicious/noExplicitAny: accessing static property on untyped external class
    (TelegramService as any).serviceType;

  static async start(runtime: unknown) {
    // biome-ignore lint/suspicious/noExplicitAny: untyped external module returns unknown shape
    const service = (await (TelegramService as any).start(runtime)) as Record<
      string,
      unknown
    >;
    if (service?.bot) {
      // biome-ignore lint/suspicious/noExplicitAny: EnhancedTelegramMessageManager extends untyped base class
      service.messageManager = new (EnhancedTelegramMessageManager as any)(
        service.bot,
        runtime,
      );
    }
    return service;
  }

  static async stop(runtime: unknown) {
    // biome-ignore lint/suspicious/noExplicitAny: untyped external module method access
    return (TelegramService as any).stop(runtime);
  }

  constructor(runtime: unknown) {
    super(runtime);

    // biome-ignore lint/suspicious/noExplicitAny: accessing inherited untyped properties
    const self = this as any;
    if (self.bot) {
      // biome-ignore lint/suspicious/noExplicitAny: EnhancedTelegramMessageManager extends untyped base class
      self.messageManager = new (EnhancedTelegramMessageManager as any)(
        self.bot,
        runtime,
      );
    }
  }
}
