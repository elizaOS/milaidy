/**
 * Re-export from @milady/app-core/autonomy.
 * @deprecated Import directly from "@milady/app-core/autonomy" instead.
 */
export {
  type AutonomyEventStore,
  type AutonomyGapReplayRequest,
  type AutonomyRunHealth,
  type AutonomyRunHealthMap,
  type AutonomyRunHealthStatus,
  buildAutonomyGapReplayRequests,
  hasPendingAutonomyGaps,
  type MergeAutonomyEventsOptions,
  type MergeAutonomyEventsResult,
  markPendingAutonomyGapsPartial,
  mergeAutonomyEvents,
} from "@milady/app-core/autonomy";
