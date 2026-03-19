import type { IncomingMessage, ServerResponse } from "node:http";
import {
  applyWhatsAppQrOverride as applyAutonomousWhatsAppQrOverride,
  handleWhatsAppRoute as handleAutonomousWhatsAppRoute,
  MAX_PAIRING_SESSIONS,
} from "@elizaos/autonomous/api/whatsapp-routes";
import {
  sanitizeAccountId,
  WhatsAppPairingSession,
  whatsappAuthExists,
  whatsappLogout,
} from "../services/whatsapp-pairing";

export type { WhatsAppRouteState } from "@elizaos/autonomous/api/whatsapp-routes";
export { MAX_PAIRING_SESSIONS };

export async function handleWhatsAppRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  state: import("@elizaos/autonomous/api/whatsapp-routes").WhatsAppRouteState,
): Promise<boolean> {
  return handleAutonomousWhatsAppRoute(req, res, pathname, method, state, {
    sanitizeAccountId,
    whatsappAuthExists,
    whatsappLogout,
    createWhatsAppPairingSession: (options) =>
      new WhatsAppPairingSession(options as never),
  });
}

export function applyWhatsAppQrOverride(
  plugins: {
    id: string;
    validationErrors: unknown[];
    configured: boolean;
    qrConnected?: boolean;
  }[],
  workspaceDir: string,
): void {
  applyAutonomousWhatsAppQrOverride(plugins, workspaceDir);
}
