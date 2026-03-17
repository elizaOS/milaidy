import type { IncomingMessage, ServerResponse } from "node:http";
import {
  applySignalQrOverride as applyAutonomousSignalQrOverride,
  handleSignalRoute as handleAutonomousSignalRoute,
  MAX_PAIRING_SESSIONS,
} from "@miladyai/autonomous/api/signal-routes";
import {
  SignalPairingSession,
  sanitizeAccountId,
  signalAuthExists,
  signalLogout,
} from "../services/signal-pairing";

export type { SignalRouteState } from "@miladyai/autonomous/api/signal-routes";
export { MAX_PAIRING_SESSIONS };

export async function handleSignalRoute(
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
  method: string,
  state: import("@miladyai/autonomous/api/signal-routes").SignalRouteState,
): Promise<boolean> {
  return handleAutonomousSignalRoute(req, res, pathname, method, state, {
    sanitizeAccountId,
    signalAuthExists,
    signalLogout,
    createSignalPairingSession: (options) =>
      new SignalPairingSession(options as never),
  });
}

export function applySignalQrOverride(
  plugins: {
    id: string;
    validationErrors: unknown[];
    configured: boolean;
    qrConnected?: boolean;
  }[],
  workspaceDir: string,
): void {
  applyAutonomousSignalQrOverride(plugins, workspaceDir, signalAuthExists);
}
