/**
 * Milady WhatsApp Plugin — Baileys-based WhatsApp integration.
 *
 * Uses QR-authenticated Baileys sessions (created via the pairing service)
 * to send and receive WhatsApp messages through the ElizaOS runtime.
 *
 * Loaded as `@milady/plugin-whatsapp` via CHANNEL_PLUGIN_MAP when
 * `config.connectors.whatsapp` is present.
 */

import type { Plugin, IAgentRuntime, ServiceClass } from "@elizaos/core";
import { WhatsAppBaileysService } from "./service";
import { sendWhatsAppMessage } from "./actions";

export const whatsappPlugin: Plugin = {
  name: "whatsapp",
  description: "WhatsApp messaging via Baileys (QR code auth)",

  services: [WhatsAppBaileysService as unknown as ServiceClass],

  actions: [sendWhatsAppMessage],

  init: async (_config: Record<string, string>, runtime: IAgentRuntime) => {
    runtime.logger.info("[whatsapp] Plugin initialized");
  },
};

export default whatsappPlugin;
