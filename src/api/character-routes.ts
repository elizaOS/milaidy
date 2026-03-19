import {
  type CharacterRouteContext as AutonomousCharacterRouteContext,
  type CharacterRouteState as AutonomousCharacterRouteState,
  handleCharacterRoutes as handleAutonomousCharacterRoutes,
} from "@elizaos/autonomous/api/character-routes";
import type { ElizaConfig } from "../config/types";
import { CharacterSchema } from "../config/zod-schema";
import type { RouteRequestContext } from "./route-helpers";

export interface CharacterRouteState extends AutonomousCharacterRouteState {
  config?: ElizaConfig;
}

export interface CharacterRouteContext extends RouteRequestContext {
  state: CharacterRouteState;
  pickRandomNames: (count: number) => string[];
  saveConfig?: (config: ElizaConfig) => void;
}

function toAutonomousContext(
  ctx: CharacterRouteContext,
): AutonomousCharacterRouteContext {
  return {
    ...ctx,
    saveConfig: ctx.saveConfig
      ? (config) => ctx.saveConfig?.(config as ElizaConfig)
      : undefined,
    validateCharacter: (body) => CharacterSchema.safeParse(body) as never,
  };
}

export async function handleCharacterRoutes(
  ctx: CharacterRouteContext,
): Promise<boolean> {
  return handleAutonomousCharacterRoutes(toAutonomousContext(ctx));
}
