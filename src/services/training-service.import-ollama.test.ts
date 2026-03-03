import { describe, expect, test, vi } from "vitest";
import type { MiladyConfig } from "../config/config";

// Skip this test when the plugin-training submodule isn't available (CI)
let TrainingService: new (
  ctx: unknown,
) => {
  importModelToOllama: (id: string, opts: unknown) => Promise<void>;
  models: Map<string, TrainingModelRecord>;
};
type TrainingModelRecord = {
  id: string;
  createdAt: string;
  jobId: string;
  outputDir: string;
  modelPath: string;
  adapterPath: string;
  sourceModel: string;
  backend: string;
  ollamaModel: null | string;
  active: boolean;
  benchmark: { status: string; lastRunAt: null; output: null };
};

let hasModule = false;
try {
  const mod = await import(
    "../../plugins/plugin-training/src/services/trainingService"
  );
  TrainingService = mod.TrainingService;
  hasModule = true;
} catch {
  hasModule = false;
}

describe.skipIf(!hasModule)("training service importModelToOllama", () => {
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
