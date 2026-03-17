import type { AgentRuntime } from "@elizaos/core";
import {
  type TriggerRouteContext as AutonomousTriggerRouteContext,
  handleTriggerRoutes as handleAutonomousTriggerRoutes,
} from "@miladyai/autonomous/api/trigger-routes";
import {
  executeTriggerTask,
  getTriggerHealthSnapshot,
  getTriggerLimit,
  listTriggerTasks,
  readTriggerConfig,
  readTriggerRuns,
  TRIGGER_TASK_NAME,
  TRIGGER_TASK_TAGS,
  taskToTriggerSummary,
  triggersFeatureEnabled,
} from "../triggers/runtime";
import {
  buildTriggerConfig,
  buildTriggerMetadata,
  DISABLED_TRIGGER_INTERVAL_MS,
  normalizeTriggerDraft,
} from "../triggers/scheduling";
import type { RouteHelpers, RouteRequestContext } from "./route-helpers";

export type TriggerRouteHelpers = RouteHelpers;

export interface TriggerRouteContext extends RouteRequestContext {
  runtime: AgentRuntime | null;
}

function toAutonomousContext(
  ctx: TriggerRouteContext,
): AutonomousTriggerRouteContext {
  return {
    ...ctx,
    executeTriggerTask: executeTriggerTask as never,
    getTriggerHealthSnapshot,
    getTriggerLimit: getTriggerLimit as never,
    listTriggerTasks: listTriggerTasks as never,
    readTriggerConfig,
    readTriggerRuns,
    taskToTriggerSummary: taskToTriggerSummary as never,
    triggersFeatureEnabled,
    buildTriggerConfig: buildTriggerConfig as never,
    buildTriggerMetadata: buildTriggerMetadata as never,
    normalizeTriggerDraft: normalizeTriggerDraft as never,
    DISABLED_TRIGGER_INTERVAL_MS,
    TRIGGER_TASK_NAME,
    TRIGGER_TASK_TAGS: [...TRIGGER_TASK_TAGS],
  };
}

export async function handleTriggerRoutes(
  ctx: TriggerRouteContext,
): Promise<boolean> {
  return handleAutonomousTriggerRoutes(toAutonomousContext(ctx));
}
