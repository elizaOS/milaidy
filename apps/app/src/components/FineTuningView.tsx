import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import { createTranslator } from "../i18n";
import {
  client,
  type StartTrainingOptions,
  type StreamEventEnvelope,
  type TrainingDatasetRecord,
  type TrainingJobRecord,
  type TrainingModelRecord,
  type TrainingStatus,
  type TrainingStreamEvent,
  type TrainingTrajectoryDetail,
  type TrainingTrajectoryList,
} from "../api-client";
import {
  parsePositiveFloat,
  parsePositiveInteger,
} from "../../../../src/utils/number-parsing.js";
import { formatTime } from "./shared/format";

const TRAINING_EVENT_KINDS = new Set<TrainingStreamEvent["kind"]>([
  "job_started",
  "job_progress",
  "job_log",
  "job_completed",
  "job_failed",
  "job_cancelled",
  "dataset_built",
  "model_activated",
  "model_imported",
]);

function formatDate(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}

function formatProgress(value: number): string {
  const bounded = Math.max(0, Math.min(1, value));
  return `${Math.round(bounded * 100)}%`;
}

function asTrainingEvent(
  envelope: Partial<StreamEventEnvelope>,
): TrainingStreamEvent | null {
  if (envelope.type !== "training_event") return null;
  const payloadValue = envelope.payload;
  if (!payloadValue || typeof payloadValue !== "object") return null;
  const payload = payloadValue as Partial<TrainingStreamEvent>;
  if (typeof payload.kind !== "string") return null;
  if (!TRAINING_EVENT_KINDS.has(payload.kind as TrainingStreamEvent["kind"])) {
    return null;
  }
  if (typeof payload.ts !== "number") return null;
  if (typeof payload.message !== "string") return null;
  return {
    kind: payload.kind as TrainingStreamEvent["kind"],
    ts: payload.ts,
    message: payload.message,
    jobId: typeof payload.jobId === "string" ? payload.jobId : undefined,
    modelId: typeof payload.modelId === "string" ? payload.modelId : undefined,
    datasetId:
      typeof payload.datasetId === "string" ? payload.datasetId : undefined,
    progress:
      typeof payload.progress === "number" ? payload.progress : undefined,
    phase: typeof payload.phase === "string" ? payload.phase : undefined,
  };
}

function summarizeAvailability(
  reason: string | undefined,
  t: ReturnType<typeof createTranslator>,
): string {
  if (!reason) return t("fineTuning.ui.unavailable");
  if (reason === "runtime_not_started") {
    return t("fineTuning.ui.runtimeNotStarted");
  }
  if (reason === "trajectories_table_missing") {
    return t("fineTuning.ui.trajectoriesTableMissing");
  }
  return reason;
}

export function FineTuningView() {
  const { handleRestart, setActionNotice, uiLanguage } = useApp();
  const t = useMemo(() => createTranslator(uiLanguage), [uiLanguage]);

  const [pageLoading, setPageLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [status, setStatus] = useState<TrainingStatus | null>(null);
  const [trajectoryList, setTrajectoryList] = useState<TrainingTrajectoryList>({
    available: false,
    total: 0,
    trajectories: [],
  });
  const [selectedTrajectory, setSelectedTrajectory] =
    useState<TrainingTrajectoryDetail | null>(null);
  const [trajectoryLoading, setTrajectoryLoading] = useState(false);

  const [datasets, setDatasets] = useState<TrainingDatasetRecord[]>([]);
  const [jobs, setJobs] = useState<TrainingJobRecord[]>([]);
  const [models, setModels] = useState<TrainingModelRecord[]>([]);

  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [selectedJobId, setSelectedJobId] = useState("");
  const [selectedModelId, setSelectedModelId] = useState("");

  const [buildLimit, setBuildLimit] = useState("250");
  const [buildMinCalls, setBuildMinCalls] = useState("1");
  const [datasetBuilding, setDatasetBuilding] = useState(false);

  const [startBackend, setStartBackend] = useState<"mlx" | "cuda" | "cpu">(
    "cpu",
  );
  const [startModel, setStartModel] = useState("");
  const [startIterations, setStartIterations] = useState("");
  const [startBatchSize, setStartBatchSize] = useState("");
  const [startLearningRate, setStartLearningRate] = useState("");
  const [startingJob, setStartingJob] = useState(false);
  const [cancellingJobId, setCancellingJobId] = useState("");

  const [importModelName, setImportModelName] = useState("");
  const [importBaseModel, setImportBaseModel] = useState("");
  const [importOllamaUrl, setImportOllamaUrl] = useState("http://localhost:11434");
  const [activateProviderModel, setActivateProviderModel] = useState("");
  const [modelAction, setModelAction] = useState("");
  const [smokeResult, setSmokeResult] = useState<string | null>(null);

  const [trainingEvents, setTrainingEvents] = useState<TrainingStreamEvent[]>(
    [],
  );

  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobId) ?? null,
    [jobs, selectedJobId],
  );
  const selectedModel = useMemo(
    () => models.find((model) => model.id === selectedModelId) ?? null,
    [models, selectedModelId],
  );
  const activeRunningJob = useMemo(
    () => jobs.find((job) => job.status === "running" || job.status === "queued") ?? null,
    [jobs],
  );

  const loadStatus = useCallback(async () => {
    const nextStatus = await client.getTrainingStatus();
    setStatus(nextStatus);
  }, []);

  const loadTrajectories = useCallback(async () => {
    const listed = await client.listTrainingTrajectories({ limit: 100, offset: 0 });
    setTrajectoryList(listed);
  }, []);

  const loadDatasets = useCallback(async () => {
    const listed = await client.listTrainingDatasets();
    setDatasets(listed.datasets);
    setSelectedDatasetId((prev) => {
      if (prev && listed.datasets.some((dataset) => dataset.id === prev)) {
        return prev;
      }
      return listed.datasets[0]?.id ?? "";
    });
  }, []);

  const loadJobs = useCallback(async () => {
    const listed = await client.listTrainingJobs();
    setJobs(listed.jobs);
    setSelectedJobId((prev) => {
      if (prev && listed.jobs.some((job) => job.id === prev)) return prev;
      return listed.jobs[0]?.id ?? "";
    });
  }, []);

  const loadModels = useCallback(async () => {
    const listed = await client.listTrainingModels();
    setModels(listed.models);
    setSelectedModelId((prev) => {
      if (prev && listed.models.some((model) => model.id === prev)) return prev;
      return listed.models[0]?.id ?? "";
    });
  }, []);

  const refreshAll = useCallback(async () => {
    setPageLoading(true);
    setErrorMessage(null);
    try {
      await Promise.all([
        loadStatus(),
        loadTrajectories(),
        loadDatasets(),
        loadJobs(),
        loadModels(),
      ]);
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : t("fineTuning.error.refreshStateFailed"),
      );
    } finally {
      setPageLoading(false);
    }
  }, [loadDatasets, loadJobs, loadModels, loadStatus, loadTrajectories, t]);

  const loadTrajectoryDetail = useCallback(
    async (trajectoryId: string) => {
      setTrajectoryLoading(true);
      try {
        const result = await client.getTrainingTrajectory(trajectoryId);
        setSelectedTrajectory(result.trajectory);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : t("fineTuning.error.loadTrajectoryDetailFailed");
        setActionNotice(message, "error", 4200);
      } finally {
        setTrajectoryLoading(false);
      }
    },
    [setActionNotice, t],
  );

  const handleBuildDataset = useCallback(async () => {
    setDatasetBuilding(true);
    try {
      const limit = parsePositiveInteger(buildLimit);
      const minLlmCallsPerTrajectory = parsePositiveInteger(buildMinCalls);
      const request: { limit?: number; minLlmCallsPerTrajectory?: number } = {};
      if (typeof limit === "number") request.limit = limit;
      if (typeof minLlmCallsPerTrajectory === "number") {
        request.minLlmCallsPerTrajectory = minLlmCallsPerTrajectory;
      }

      const result = await client.buildTrainingDataset(request);
      setSelectedDatasetId(result.dataset.id);
      await Promise.all([loadDatasets(), loadStatus()]);
      setActionNotice(
        t("fineTuning.notice.datasetBuilt", {
          id: result.dataset.id,
          count: result.dataset.sampleCount,
        }),
        "success",
        3800,
      );
    } catch (err) {
      setActionNotice(
        err instanceof Error ? err.message : t("fineTuning.error.buildDatasetFailed"),
        "error",
        4200,
      );
    } finally {
      setDatasetBuilding(false);
    }
  }, [buildLimit, buildMinCalls, loadDatasets, loadStatus, setActionNotice, t]);

  const handleStartJob = useCallback(async () => {
    setStartingJob(true);
    try {
      const options: StartTrainingOptions = {
        datasetId: selectedDatasetId || undefined,
        backend: startBackend,
        model: startModel.trim() || undefined,
        iterations: parsePositiveInteger(startIterations),
        batchSize: parsePositiveInteger(startBatchSize),
        learningRate: parsePositiveFloat(startLearningRate),
      };
      const result = await client.startTrainingJob(options);
      setSelectedJobId(result.job.id);
      await Promise.all([loadJobs(), loadStatus()]);
      setActionNotice(
        t("fineTuning.notice.startedTrainingJob", { id: result.job.id }),
        "success",
        3200,
      );
    } catch (err) {
      setActionNotice(
        err instanceof Error ? err.message : t("fineTuning.error.startTrainingJobFailed"),
        "error",
        4200,
      );
    } finally {
      setStartingJob(false);
    }
  }, [
    loadJobs,
    loadStatus,
    selectedDatasetId,
    setActionNotice,
    startBackend,
    startBatchSize,
    startIterations,
    startLearningRate,
    startModel,
    t,
  ]);

  const handleCancelJob = useCallback(
    async (jobId: string) => {
      setCancellingJobId(jobId);
      try {
        await client.cancelTrainingJob(jobId);
        await Promise.all([loadJobs(), loadStatus()]);
        setActionNotice(t("fineTuning.notice.cancelledJob", { id: jobId }), "success", 2600);
      } catch (err) {
        setActionNotice(
          err instanceof Error ? err.message : t("fineTuning.error.cancelJobFailed", { id: jobId }),
          "error",
          4200,
        );
      } finally {
        setCancellingJobId("");
      }
    },
    [loadJobs, loadStatus, setActionNotice, t],
  );

  const handleImportSelectedModel = useCallback(async () => {
    if (!selectedModel) return;
    const actionId = `import:${selectedModel.id}`;
    setModelAction(actionId);
    try {
      const result = await client.importTrainingModelToOllama(selectedModel.id, {
        modelName: importModelName.trim() || undefined,
        baseModel: importBaseModel.trim() || undefined,
        ollamaUrl: importOllamaUrl.trim() || undefined,
      });
      await loadModels();
      setActivateProviderModel(
        result.model.ollamaModel ? `ollama/${result.model.ollamaModel}` : "",
      );
      setActionNotice(
        t("fineTuning.notice.importedModelToOllama", {
          modelId: result.model.id,
          alias: result.model.ollamaModel ? ` ${t("common.as")} ${result.model.ollamaModel}` : "",
        }),
        "success",
        4200,
      );
    } catch (err) {
      setActionNotice(
        err instanceof Error ? err.message : t("fineTuning.error.importModelToOllamaFailed"),
        "error",
        4200,
      );
    } finally {
      setModelAction("");
    }
  }, [
    importBaseModel,
    importModelName,
    importOllamaUrl,
    loadModels,
    selectedModel,
    setActionNotice,
    t,
  ]);

  const handleActivateSelectedModel = useCallback(async () => {
    if (!selectedModel) return;
    const actionId = `activate:${selectedModel.id}`;
    setModelAction(actionId);
    try {
      const result = await client.activateTrainingModel(
        selectedModel.id,
        activateProviderModel.trim() || undefined,
      );
      await loadModels();
      setActionNotice(
        t("fineTuning.notice.activatedModel", {
          modelId: result.modelId,
          providerModel: result.providerModel,
        }),
        "success",
        4200,
      );
      if (result.needsRestart) {
        const shouldRestart = window.confirm(
          t("fineTuning.confirm.restartAfterActivation"),
        );
        if (shouldRestart) {
          await handleRestart();
        }
      }
    } catch (err) {
      setActionNotice(
        err instanceof Error ? err.message : t("fineTuning.error.activateModelFailed"),
        "error",
        4200,
      );
    } finally {
      setModelAction("");
    }
  }, [
    activateProviderModel,
    handleRestart,
    loadModels,
    selectedModel,
    setActionNotice,
    t,
  ]);

  const handleBenchmarkSelectedModel = useCallback(async () => {
    if (!selectedModel) return;
    const actionId = `benchmark:${selectedModel.id}`;
    setModelAction(actionId);
    try {
      const result = await client.benchmarkTrainingModel(selectedModel.id);
      await loadModels();
      setActionNotice(
        t("fineTuning.notice.benchmarkResult", {
          status: result.status,
          modelId: selectedModel.id,
        }),
        result.status === "passed" ? "success" : "error",
        4200,
      );
    } catch (err) {
      setActionNotice(
        err instanceof Error ? err.message : t("fineTuning.error.benchmarkModelFailed"),
        "error",
        4200,
      );
    } finally {
      setModelAction("");
    }
  }, [loadModels, selectedModel, setActionNotice, t]);

  const handleSmokeTestSelectedModel = useCallback(async () => {
    if (!selectedModel) return;
    const actionId = `smoke:${selectedModel.id}`;
    setModelAction(actionId);
    try {
      const result = await client.sendChatRest(
        "Model smoke test. Reply with exactly: MODEL_OK",
      );
      setSmokeResult(result.text);
      setActionNotice(t("fineTuning.notice.smokeTestCompleted"), "success", 3200);
    } catch (err) {
      setSmokeResult(null);
      setActionNotice(
        err instanceof Error ? err.message : t("fineTuning.error.smokeTestFailed"),
        "error",
        4200,
      );
    } finally {
      setModelAction("");
    }
  }, [selectedModel, setActionNotice, t]);

  useEffect(() => {
    void refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void loadStatus();
      void loadJobs();
      void loadModels();
    }, 5000);
    return () => {
      window.clearInterval(timer);
    };
  }, [loadJobs, loadModels, loadStatus]);

  useEffect(() => {
    const unbind = client.onWsEvent("training_event", (rawEnvelope) => {
      const event = asTrainingEvent(rawEnvelope as Partial<StreamEventEnvelope>);
      if (!event) return;
      setTrainingEvents((prev) => {
        const merged = [event, ...prev];
        return merged.slice(0, 240);
      });
      if (event.kind !== "job_log") {
        void loadStatus();
        void loadJobs();
        void loadModels();
        if (event.kind === "dataset_built") {
          void loadDatasets();
        }
      }
    });
    return () => {
      unbind();
    };
  }, [loadDatasets, loadJobs, loadModels, loadStatus]);

  if (pageLoading) {
    return <div className="text-sm text-muted">{t("fineTuning.ui.loadingWorkspace")}</div>;
  }

  return (
    <div className="space-y-6 pb-8">
      <section className="border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold">{t("fineTuning.ui.title")}</h2>
            <p className="text-xs text-muted mt-1">
              {t("fineTuning.ui.subtitle")}
            </p>
          </div>
          <button
            className="btn btn-ghost text-xs py-1"
            onClick={() => {
              void refreshAll();
            }}
          >
            {t("fineTuning.ui.refreshAll")}
          </button>
        </div>
        {errorMessage && (
          <div className="mt-3 text-xs text-danger border border-danger p-2">
            {errorMessage}
          </div>
        )}
      </section>

      <section className="border border-border bg-card p-4">
        <h3 className="text-sm font-bold mb-3">{t("fineTuning.ui.status")}</h3>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2 text-xs">
          <div>
            {t("fineTuning.ui.runtimeLabel")}{" "}
            {status?.runtimeAvailable ? t("fineTuning.ui.runtimeReady") : t("fineTuning.ui.runtimeOffline")}
          </div>
          <div>{t("fineTuning.ui.runningJobsLabel")} {status?.runningJobs ?? 0}</div>
          <div>{t("fineTuning.ui.queuedJobsLabel")} {status?.queuedJobs ?? 0}</div>
          <div>{t("fineTuning.ui.datasetsLabel")} {status?.datasetCount ?? 0}</div>
          <div>{t("fineTuning.ui.modelsLabel")} {status?.modelCount ?? 0}</div>
          <div>{t("fineTuning.ui.failedJobsLabel")} {status?.failedJobs ?? 0}</div>
        </div>
      </section>

      <section className="border border-border bg-card p-4">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h3 className="text-sm font-bold">{t("fineTuning.ui.trajectories")}</h3>
          <button
            className="btn btn-ghost text-xs py-1"
            onClick={() => {
              void loadTrajectories();
            }}
          >
            {t("fineTuning.ui.refresh")}
          </button>
        </div>
        {!trajectoryList.available ? (
          <div className="text-xs text-muted">
            {summarizeAvailability(trajectoryList.reason, t)}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="text-xs text-muted">
              {t("fineTuning.ui.trajectoryRowsAvailable", { count: trajectoryList.total })}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
              <div className="border border-border">
                <div className="px-2 py-1 text-[11px] border-b border-border text-muted">
                  {t("fineTuning.ui.latestTrajectories")}
                </div>
                <div className="max-h-72 overflow-auto">
                  {trajectoryList.trajectories.length === 0 ? (
                    <div className="p-3 text-xs text-muted">
                      {t("fineTuning.ui.noTrajectoriesYet")}
                    </div>
                  ) : (
                    trajectoryList.trajectories.map((trajectory) => (
                      <button
                        key={trajectory.trajectoryId}
                        className="w-full text-left px-2 py-2 border-b border-border hover:bg-bg-hover text-xs"
                        onClick={() => {
                          void loadTrajectoryDetail(trajectory.trajectoryId);
                        }}
                      >
                        <div className="font-mono">{trajectory.trajectoryId}</div>
                        <div className="text-muted mt-1">
                          {t("fineTuning.ui.callsLabel")} {trajectory.llmCallCount} · {t("fineTuning.ui.rewardLabel")}{" "}
                          {trajectory.totalReward ?? t("apps.ui.notAvailable")} ·{" "}
                          {formatDate(trajectory.createdAt)}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
              <div className="border border-border p-2">
                <div className="text-[11px] text-muted mb-2">{t("fineTuning.ui.selectedTrajectory")}</div>
                {trajectoryLoading ? (
                  <div className="text-xs text-muted">{t("fineTuning.ui.loadingTrajectoryDetail")}</div>
                ) : !selectedTrajectory ? (
                  <div className="text-xs text-muted">{t("fineTuning.ui.chooseTrajectoryToInspect")}</div>
                ) : (
                  <div className="space-y-2">
                    <div className="text-xs">
                      <span className="font-semibold">{t("fineTuning.ui.trajectoryLabel")}</span>{" "}
                      <span className="font-mono">{selectedTrajectory.trajectoryId}</span>
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold">{t("fineTuning.ui.agentLabel")}</span>{" "}
                      <span className="font-mono">{selectedTrajectory.agentId}</span>
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold">{t("fineTuning.ui.rewardLabel")}</span>{" "}
                      {selectedTrajectory.totalReward ?? t("apps.ui.notAvailable")}
                    </div>
                    <textarea
                      readOnly
                      value={selectedTrajectory.stepsJson}
                      className="w-full min-h-56 px-2 py-1 border border-border bg-bg text-[11px] font-mono"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="border border-border bg-card p-4">
        <h3 className="text-sm font-bold mb-3">{t("fineTuning.ui.datasets")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2 mb-3">
          <input
            className="px-2 py-1 border border-border bg-bg text-sm"
            value={buildLimit}
            onChange={(event) => setBuildLimit(event.target.value)}
            placeholder={t("fineTuning.ui.limitTrajectoriesPlaceholder")}
          />
          <input
            className="px-2 py-1 border border-border bg-bg text-sm"
            value={buildMinCalls}
            onChange={(event) => setBuildMinCalls(event.target.value)}
            placeholder={t("fineTuning.ui.minLlmCallsPlaceholder")}
          />
          <button
            className="btn text-xs py-1"
            disabled={datasetBuilding}
            onClick={() => {
              void handleBuildDataset();
            }}
          >
            {datasetBuilding ? t("fineTuning.ui.building") : t("fineTuning.ui.buildDataset")}
          </button>
          <button
            className="btn btn-ghost text-xs py-1"
            onClick={() => {
              void loadDatasets();
            }}
          >
            {t("fineTuning.ui.refreshDatasets")}
          </button>
        </div>
        <div className="space-y-2 max-h-52 overflow-auto">
          {datasets.length === 0 ? (
            <div className="text-xs text-muted">{t("fineTuning.ui.noDatasetsYet")}</div>
          ) : (
            datasets.map((dataset) => (
              <label
                key={dataset.id}
                className="flex items-center gap-2 text-xs border border-border px-2 py-2 cursor-pointer"
              >
                <input
                  type="radio"
                  name="dataset-select"
                  checked={selectedDatasetId === dataset.id}
                  onChange={() => setSelectedDatasetId(dataset.id)}
                />
                <span className="font-mono">{dataset.id}</span>
                <span className="text-muted">
                  {t("fineTuning.ui.samplesCount", { count: dataset.sampleCount })} · {t("fineTuning.ui.trajectoriesCount", { count: dataset.trajectoryCount })}
                </span>
              </label>
            ))
          )}
        </div>
      </section>

      <section className="border border-border bg-card p-4">
        <h3 className="text-sm font-bold mb-3">{t("fineTuning.ui.trainingJobs")}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2 mb-3">
          <select
            className="px-2 py-1 border border-border bg-bg text-sm"
            value={selectedDatasetId}
            onChange={(event) => setSelectedDatasetId(event.target.value)}
          >
            <option value="">{t("fineTuning.ui.autoBuildDatasetOption")}</option>
            {datasets.map((dataset) => (
              <option key={dataset.id} value={dataset.id}>
                {dataset.id}
              </option>
            ))}
          </select>
          <select
            className="px-2 py-1 border border-border bg-bg text-sm"
            value={startBackend}
            onChange={(event) =>
              setStartBackend(event.target.value as "mlx" | "cuda" | "cpu")
            }
          >
            <option value="cpu">cpu</option>
            <option value="mlx">mlx</option>
            <option value="cuda">cuda</option>
          </select>
          <input
            className="px-2 py-1 border border-border bg-bg text-sm"
            value={startModel}
            onChange={(event) => setStartModel(event.target.value)}
            placeholder={t("fineTuning.ui.baseModelOptionalPlaceholder")}
          />
          <input
            className="px-2 py-1 border border-border bg-bg text-sm"
            value={startIterations}
            onChange={(event) => setStartIterations(event.target.value)}
            placeholder={t("fineTuning.ui.iterationsOptionalPlaceholder")}
          />
          <input
            className="px-2 py-1 border border-border bg-bg text-sm"
            value={startBatchSize}
            onChange={(event) => setStartBatchSize(event.target.value)}
            placeholder={t("fineTuning.ui.batchSizeOptionalPlaceholder")}
          />
          <input
            className="px-2 py-1 border border-border bg-bg text-sm"
            value={startLearningRate}
            onChange={(event) => setStartLearningRate(event.target.value)}
            placeholder={t("fineTuning.ui.learningRateOptionalPlaceholder")}
          />
        </div>
        <div className="flex gap-2 mb-3">
          <button
            className="btn text-xs py-1"
            disabled={startingJob || Boolean(activeRunningJob)}
            onClick={() => {
              void handleStartJob();
            }}
          >
            {startingJob ? t("fineTuning.ui.starting") : t("fineTuning.ui.startTrainingJob")}
          </button>
          <button
            className="btn btn-ghost text-xs py-1"
            onClick={() => {
              void loadJobs();
              void loadStatus();
            }}
          >
            {t("fineTuning.ui.refreshJobs")}
          </button>
          {activeRunningJob && (
            <div className="text-xs text-warn flex items-center">
              {t("fineTuning.ui.activeJobLabel")} <span className="font-mono ml-1">{activeRunningJob.id}</span>
            </div>
          )}
        </div>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="border border-border max-h-72 overflow-auto">
            {jobs.length === 0 ? (
              <div className="p-3 text-xs text-muted">{t("fineTuning.ui.noJobsYet")}</div>
            ) : (
              jobs.map((job) => (
                <div
                  key={job.id}
                  className={`px-2 py-2 border-b border-border text-xs ${
                    selectedJobId === job.id ? "bg-bg-hover" : ""
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <button
                      className="font-mono text-left hover:text-accent"
                      onClick={() => setSelectedJobId(job.id)}
                    >
                      {job.id}
                    </button>
                    {(job.status === "running" || job.status === "queued") && (
                      <button
                        className="btn btn-danger text-[11px] py-0.5"
                        disabled={cancellingJobId === job.id}
                        onClick={() => {
                          void handleCancelJob(job.id);
                        }}
                      >
                        {cancellingJobId === job.id ? t("fineTuning.ui.cancelling") : t("fineTuning.ui.cancel")}
                      </button>
                    )}
                  </div>
                  <div className="text-muted mt-1">
                    {job.status} · {formatProgress(job.progress)} · {job.phase}
                  </div>
                  <div className="text-muted">{formatDate(job.createdAt)}</div>
                </div>
              ))
            )}
          </div>
          <div className="border border-border p-2">
            <div className="text-[11px] text-muted mb-2">{t("fineTuning.ui.selectedJobLogs")}</div>
            {!selectedJob ? (
              <div className="text-xs text-muted">{t("fineTuning.ui.selectJobToInspectLogs")}</div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs">
                  <span className="font-semibold">{t("fineTuning.ui.statusLabel")}</span> {selectedJob.status} ·{" "}
                  {formatProgress(selectedJob.progress)} · {selectedJob.phase}
                </div>
                <div className="text-xs">
                  <span className="font-semibold">{t("fineTuning.ui.datasetLabel")}</span>{" "}
                  <span className="font-mono">{selectedJob.datasetId}</span>
                </div>
                <textarea
                  readOnly
                  value={selectedJob.logs.join("\n")}
                  className="w-full min-h-56 px-2 py-1 border border-border bg-bg text-[11px] font-mono"
                />
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="border border-border bg-card p-4">
        <h3 className="text-sm font-bold mb-3">{t("fineTuning.ui.trainedModels")}</h3>
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <div className="border border-border max-h-72 overflow-auto">
            {models.length === 0 ? (
              <div className="p-3 text-xs text-muted">{t("fineTuning.ui.noTrainedModelsYet")}</div>
            ) : (
              models.map((model) => (
                <button
                  key={model.id}
                  className={`w-full text-left px-2 py-2 border-b border-border text-xs ${
                    selectedModelId === model.id ? "bg-bg-hover" : "hover:bg-bg-hover"
                  }`}
                  onClick={() => setSelectedModelId(model.id)}
                >
                  <div className="font-mono">
                    {model.id} {model.active ? `· ${t("fineTuning.ui.active")}` : ""}
                  </div>
                  <div className="text-muted mt-1">
                    {t("fineTuning.ui.backendLabel")} {model.backend}
                    {model.ollamaModel ? ` · ollama: ${model.ollamaModel}` : ""}
                  </div>
                  <div className="text-muted">
                    {t("fineTuning.ui.benchmarkLabel")} {model.benchmark.status}
                    {model.benchmark.lastRunAt
                      ? ` · ${formatDate(model.benchmark.lastRunAt)}`
                      : ""}
                  </div>
                </button>
              ))
            )}
          </div>
          <div className="border border-border p-2">
            <div className="text-[11px] text-muted mb-2">{t("fineTuning.ui.modelActions")}</div>
            {!selectedModel ? (
              <div className="text-xs text-muted">{t("fineTuning.ui.selectModelToImportOrActivate")}</div>
            ) : (
              <div className="space-y-2">
                <div className="text-xs">
                  <span className="font-semibold">{t("fineTuning.ui.modelLabel")}</span>{" "}
                  <span className="font-mono">{selectedModel.id}</span>
                </div>
                <div className="text-xs">
                  <span className="font-semibold">{t("fineTuning.ui.adapterPathLabel")}</span>{" "}
                  <span className="font-mono">{selectedModel.adapterPath ?? t("apps.ui.notAvailable")}</span>
                </div>

                <input
                  className="w-full px-2 py-1 border border-border bg-bg text-sm"
                  value={importModelName}
                  onChange={(event) => setImportModelName(event.target.value)}
                  placeholder={t("fineTuning.ui.ollamaModelNameOptionalPlaceholder")}
                />
                <input
                  className="w-full px-2 py-1 border border-border bg-bg text-sm"
                  value={importBaseModel}
                  onChange={(event) => setImportBaseModel(event.target.value)}
                  placeholder={t("fineTuning.ui.baseModelForOllamaOptionalPlaceholder")}
                />
                <input
                  className="w-full px-2 py-1 border border-border bg-bg text-sm"
                  value={importOllamaUrl}
                  onChange={(event) => setImportOllamaUrl(event.target.value)}
                  placeholder={t("fineTuning.ui.ollamaUrlPlaceholder")}
                />
                <button
                  className="btn text-xs py-1"
                  disabled={modelAction === `import:${selectedModel.id}`}
                  onClick={() => {
                    void handleImportSelectedModel();
                  }}
                >
                  {modelAction === `import:${selectedModel.id}`
                    ? t("fineTuning.ui.importing")
                    : t("fineTuning.ui.importToOllama")}
                </button>

                <input
                  className="w-full px-2 py-1 border border-border bg-bg text-sm"
                  value={activateProviderModel}
                  onChange={(event) => setActivateProviderModel(event.target.value)}
                  placeholder={t("fineTuning.ui.providerModelPlaceholder")}
                />
                <div className="flex gap-2">
                  <button
                    className="btn text-xs py-1"
                    disabled={modelAction === `activate:${selectedModel.id}`}
                    onClick={() => {
                      void handleActivateSelectedModel();
                    }}
                  >
                    {modelAction === `activate:${selectedModel.id}`
                      ? t("fineTuning.ui.activating")
                      : t("fineTuning.ui.activateModel")}
                  </button>
                  <button
                    className="btn btn-ghost text-xs py-1"
                    disabled={modelAction === `benchmark:${selectedModel.id}`}
                    onClick={() => {
                      void handleBenchmarkSelectedModel();
                    }}
                  >
                    {modelAction === `benchmark:${selectedModel.id}`
                      ? t("fineTuning.ui.benchmarking")
                      : t("fineTuning.ui.benchmark")}
                  </button>
                  <button
                    className="btn btn-ghost text-xs py-1"
                    disabled={modelAction === `smoke:${selectedModel.id}`}
                    onClick={() => {
                      void handleSmokeTestSelectedModel();
                    }}
                  >
                    {modelAction === `smoke:${selectedModel.id}`
                      ? t("fineTuning.ui.testing")
                      : t("fineTuning.ui.runSmokePrompt")}
                  </button>
                </div>
                {smokeResult && (
                  <textarea
                    readOnly
                    value={smokeResult}
                    className="w-full min-h-24 px-2 py-1 border border-border bg-bg text-[11px] font-mono"
                  />
                )}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="border border-border bg-card p-4">
        <h3 className="text-sm font-bold mb-3">{t("fineTuning.ui.liveTrainingEvents")}</h3>
        <div className="max-h-56 overflow-auto border border-border">
          {trainingEvents.length === 0 ? (
            <div className="p-3 text-xs text-muted">
              {t("fineTuning.ui.noLiveEventsYet")}
            </div>
          ) : (
            trainingEvents.map((event, index) => (
              <div key={`${event.ts}-${event.kind}-${index}`} className="px-2 py-1.5 border-b border-border text-xs">
                <span className="font-mono text-muted mr-2">
                  {formatTime(event.ts, { fallback: "—" })}
                </span>
                <span className="font-semibold">{event.kind}</span>
                {typeof event.progress === "number" && (
                  <span className="text-muted"> · {formatProgress(event.progress)}</span>
                )}
                {event.phase && <span className="text-muted"> · {event.phase}</span>}
                <div className="text-muted mt-0.5">{event.message}</div>
              </div>
            ))
          )}
        </div>
      </section>
    </div>
  );
}
