import { handleNfaReadRoutes } from "./nfa-routes-read";
import type { NfaRouteContext } from "./nfa-routes-shared";
import { handleNfaWriteRoutes } from "./nfa-routes-write";

export type {
  NfaLearningsResponse,
  NfaRouteContext,
  NfaStatusResponse,
} from "./nfa-routes-shared";

export async function handleNfaRoutes(ctx: NfaRouteContext): Promise<boolean> {
  if (await handleNfaReadRoutes(ctx)) {
    return true;
  }
  return handleNfaWriteRoutes(ctx);
}
