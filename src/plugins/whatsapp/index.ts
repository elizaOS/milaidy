/**
 * Milady WhatsApp Plugin — Baileys-based WhatsApp integration.
 *
 * Uses QR-authenticated Baileys sessions (created via the pairing service)
 * to send and receive WhatsApp messages through the ElizaOS runtime.
 *
 * Loaded as `@milady/plugin-whatsapp` via CHANNEL_PLUGIN_MAP when
 * `config.connectors.whatsapp` is present.
 *
 * ## Security & Terms of Service Notice
 *
 * This plugin uses **Baileys** (`@whiskeysockets/baileys`), an unofficial,
 * reverse-engineered WhatsApp Web API client.
 *
 * - **WhatsApp ToS risk**: Using unofficial APIs may violate WhatsApp's Terms of
 *   Service. Accounts used with this plugin could be banned. Use a dedicated
 *   phone number — do not connect your primary personal account.
 *
 * - **libsignal dependency**: Baileys pulls `@pnowy/signal` (Signal protocol
 *   library) from a Git URL, bypassing npm registry integrity checks. Review
 *   the lockfile to verify the resolved commit hash before deploying.
 */

import type { Plugin, IAgentRuntime, ServiceClass } from "@elizaos/core";
import { WhatsAppBaileysService } from "./service";
import { sendWhatsAppMessage } from "./actions";

export const whatsappPlugin: Plugin = {
  name: "whatsapp",
  description: "WhatsApp messaging via Baileys (QR code auth)",

  // TypeScript cannot verify static+constructor ServiceClass shape; the class
  // properly extends Service and implements all required static methods.
  services: [WhatsAppBaileysService as unknown as ServiceClass],

  actions: [sendWhatsAppMessage],

  init: async (_config: Record<string, string>, runtime: IAgentRuntime) => {
    runtime.logger.info("[whatsapp] Plugin initialized");
  },
};

export default whatsappPlugin;
