import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  clearBackendCache,
  detectAvailableBackends,
} from "./training-backend-check";

// Mock child_process.execFile
vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

import { execFile } from "node:child_process";

const mockExecFile = vi.mocked(execFile);

beforeEach(() => {
  clearBackendCache();
  mockExecFile.mockReset();
});

afterEach(() => {
  vi.restoreAllMocks();
});

function succeedExec() {
  mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
    (cb as (err: Error | null) => void)(null);
    return {} as ReturnType<typeof execFile>;
  });
}

function failExec() {
  mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
    (cb as (err: Error | null) => void)(new Error("not found"));
    return {} as ReturnType<typeof execFile>;
  });
}

describe("detectAvailableBackends", () => {
  test("cpu is always true", async () => {
    failExec();
    const result = await detectAvailableBackends();
    expect(result.cpu).toBe(true);
  });

  test("non-darwin reports mlx as false", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "linux" });

    failExec();
    const result = await detectAvailableBackends();
    expect(result.mlx).toBe(false);

    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  test("darwin with mlx import succeeds", async () => {
    const originalPlatform = process.platform;
    Object.defineProperty(process, "platform", { value: "darwin" });

    succeedExec();
    const result = await detectAvailableBackends();
    expect(result.mlx).toBe(true);

    Object.defineProperty(process, "platform", { value: originalPlatform });
  });

  test("cuda detected via nvidia-smi", async () => {
    succeedExec();
    const result = await detectAvailableBackends();
    expect(result.cuda).toBe(true);
  });

  test("cuda false when nvidia-smi fails", async () => {
    failExec();
    const result = await detectAvailableBackends();
    expect(result.cuda).toBe(false);
  });

  test("cache returns same result without re-probing", async () => {
    failExec();
    const first = await detectAvailableBackends();
    mockExecFile.mockReset();
    succeedExec();
    const second = await detectAvailableBackends();
    expect(second).toEqual(first);
    // execFile should NOT have been called again (cached)
    expect(mockExecFile).not.toHaveBeenCalled();
  });

  test("cache expires after clearBackendCache", async () => {
    failExec();
    await detectAvailableBackends();
    clearBackendCache();
    succeedExec();
    const result = await detectAvailableBackends();
    expect(result.cuda).toBe(true);
  });
});
