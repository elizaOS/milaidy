/**
 * Tests for sandbox-engine shell execution safety.
 *
 * Verifies command construction avoids shell interpolation by passing
 * arguments as arrays to child_process.execFileSync.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:os", () => ({
  platform: () => "darwin",
  arch: () => "arm64",
}));

// Mock command execution primitives before module import
vi.mock("node:child_process", () => ({
  execFileSync: vi.fn(),
  spawn: vi.fn(),
}));

import { execFileSync } from "node:child_process";
import { AppleContainerEngine, DockerEngine } from "./sandbox-engine.js";

function mockError(
  message: string,
  opts?: { stderr?: string; status?: number },
): Error & { stderr?: string; status?: number } {
  const error = new Error(message) as Error & {
    stderr?: string;
    status?: number;
  };
  error.stderr = opts?.stderr;
  error.status = opts?.status;
  return error;
}

describe("sandbox-engine command safety", () => {
  beforeEach(() => {
    vi.mocked(execFileSync).mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("runs image existence checks with argument array (no shell string)", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("not found");
    });

    const engine = new DockerEngine();
    const maliciousImage = "node:latest; touch /tmp/injected";
    const exists = engine.imageExists(maliciousImage);

    expect(exists).toBe(false);
    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith(
      "docker",
      ["image", "inspect", maliciousImage],
      expect.objectContaining({ stdio: "ignore", timeout: 10000 }),
    );
  });

  it("runs containers with unescaped image strings as a single arg", async () => {
    vi.mocked(execFileSync).mockReturnValueOnce("runner-id\n");

    const engine = new DockerEngine();
    const opts = {
      image: "repo/image; touch /tmp/injected",
      name: "test-container",
      detach: true,
      mounts: [],
      env: {
        A: "1",
      },
      network: "bridge",
      user: "1000:1000",
      capDrop: [],
      memory: undefined,
      cpus: undefined,
      pidsLimit: undefined,
      readOnlyRoot: false,
    };

    await expect(engine.runContainer(opts)).resolves.toBe("runner-id");

    const call = vi.mocked(execFileSync).mock.calls[0];
    expect(call[0]).toBe("docker");
    expect(Array.isArray(call[1])).toBe(true);
    expect(call[1]).toContain("repo/image; touch /tmp/injected");
    expect((call[1] as string[]).join(" ")).toContain(
      "repo/image; touch /tmp/injected",
    );
    expect((call[1] as string[]).join(" ")).not.toContain(" && ");
  });

  it("falls back from unsupported --version probe to help check for Apple Container", () => {
    const unsupported = mockError("container: unknown option --version", {
      stderr: "unknown option --version",
      status: 1,
    });

    vi.mocked(execFileSync)
      .mockImplementationOnce(() => {
        throw unsupported;
      })
      .mockReturnValueOnce("Apple Container Toolkit");

    const engine = new AppleContainerEngine();
    const available = engine.isAvailable();

    expect(available).toBe(true);
    expect(vi.mocked(execFileSync)).toHaveBeenNthCalledWith(
      1,
      "container",
      ["--version"],
      expect.objectContaining({ stdio: "ignore", timeout: 5000 }),
    );
    expect(vi.mocked(execFileSync)).toHaveBeenNthCalledWith(
      2,
      "container",
      ["help"],
      expect.objectContaining({ stdio: "ignore", timeout: 5000 }),
    );
  });

  it("runs Apple Container image checks with argument array", () => {
    vi.mocked(execFileSync).mockImplementation(() => {
      throw new Error("not found");
    });

    const engine = new AppleContainerEngine();
    const maliciousImage = "node:latest; touch /tmp/injected";
    const exists = engine.imageExists(maliciousImage);

    expect(exists).toBe(false);
    expect(vi.mocked(execFileSync)).toHaveBeenCalledWith(
      "container",
      ["image", "inspect", maliciousImage],
      expect.objectContaining({ stdio: "ignore", timeout: 10000 }),
    );
  });
});
