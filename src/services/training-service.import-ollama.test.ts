import { describe, expect, test, vi } from "vitest";
import {
  type TrainingModelRecord,
  TrainingService,
} from "../../plugins/plugin-training/src/services/trainingService";
import type { MiladyConfig } from "../config/config";

describe("training service importModelToOllama", () => {
  test("uses manual redirect mode to prevent redirect-based SSRF escapes", async () => {
    const config = {} as MiladyConfig;
    const service = new TrainingService({
      getRuntime: () => null,
      getConfig: () => config,
      setConfig: () => undefined,
    });

    vi.spyOn(
      service as object as { initialize: () => Promise<void> },
      "initialize",
    ).mockResolvedValue(undefined);
    vi.spyOn(
      service as object as { saveState: () => Promise<void> },
      "saveState",
    ).mockResolvedValue(undefined);

    const model: TrainingModelRecord = {
      id: "model-1",
      createdAt: new Date(0).toISOString(),
      jobId: "job-1",
      outputDir: "/tmp/out",
      modelPath: "/tmp/out/model",
      adapterPath: "/tmp/out/adapter",
      sourceModel: "qwen2.5:7b-instruct",
      backend: "cpu",
      ollamaModel: null,
      active: false,
      benchmark: { status: "not_run", lastRunAt: null, output: null },
    };
    (
      service as unknown as {
        models: Map<string, TrainingModelRecord>;
      }
    ).models.set(model.id, model);

    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      text: async () => "",
    } as Response);

    try {
      await service.importModelToOllama("model-1", {
        ollamaUrl: "http://localhost:11434",
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        "http://localhost:11434/api/create",
        expect.objectContaining({
          method: "POST",
          redirect: "manual",
        }),
      );
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
