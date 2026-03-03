/**
 * Local bridge to the training plugin source so runtime imports work in
 * test/dev environments without requiring a prebuilt plugin dist/.
 */

export {
  type ActivateModelResult,
  type DatasetBuildOptions,
  type ServiceOptions,
  type StartTrainingOptions,
  type TrainingDatasetRecord,
  type TrainingEventKind,
  type TrainingJobRecord,
  type TrainingJobStatus,
  type TrainingModelRecord,
  TrainingService,
  type TrainingStreamEvent,
  type TrainingTrajectoryDetail,
  type TrainingTrajectoryList,
  type TrainingTrajectorySummary,
  type TrajectoryQueryOptions,
} from "../../plugins/plugin-training/src/services/trainingService";
