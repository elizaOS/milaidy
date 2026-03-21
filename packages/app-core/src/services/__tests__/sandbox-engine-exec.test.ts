import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execSync: vi.fn(),
  spawn: vi.fn(),
}));

import { spawn } from "node:child_process";
import { AppleContainerEngine, DockerEngine } from "../sandbox-engine";

function createMockProcess(opts?: {
  exitCode?: number;
  stdout?: string;
  stderr?: string;
}) {
  const { exitCode = 0, stdout, stderr } = opts ?? {};
  const stdoutEmitter = new EventEmitter();
  const stderrEmitter = new EventEmitter();
  const proc = new EventEmitter() as {
    stdout: EventEmitter;
    stderr: EventEmitter;
    stdin: { write: (chunk: string) => void; end: () => void };
    kill: (signal?: string) => void;
  };

  proc.stdout = stdoutEmitter;
  proc.stderr = stderrEmitter;
  proc.stdin = {
    write: vi.fn(),
    end: vi.fn(),
  };
  proc.kill = vi.fn();

  setTimeout(() => {
    if (stdout) {
      stdoutEmitter.emit("data", Buffer.from(stdout));
    }
    if (stderr) {
      stderrEmitter.emit("data", Buffer.from(stderr));
    }
    proc.emit("close", exitCode);
  }, 0);

  return proc;
}

describe("SandboxEngine container exec command dispatch", () => {
  beforeEach(() => {
    vi.mocked(spawn).mockReset();
    vi.mocked(spawn).mockImplementation(() => createMockProcess());
  });

  afterEach(() => {
    vi.mocked(spawn).mockReset();
  });

  it("executes docker command without shell wrapper", async () => {
    const engine = new DockerEngine();
    const spawnMock = vi.mocked(spawn);

    await engine.execInContainer({
      containerId: "cid-1",
      workdir: "/workspace",
      command: `echo 'hello world'`,
    });

    const [, args] = spawnMock.mock.calls.at(-1) ?? [];
    expect(args).toEqual([
      "exec",
      "-w",
      "/workspace",
      "cid-1",
      "echo",
      "hello world",
    ]);
    expect(args).not.toContain("sh");
    expect(args).not.toContain("-c");
  });

  it("executes Apple container command without shell wrapper", async () => {
    const engine = new AppleContainerEngine();
    const spawnMock = vi.mocked(spawn);

    await engine.execInContainer({
      containerId: "cid-2",
      command: `python -c "print(42)"`,
    });

    const [binary, args] = spawnMock.mock.calls.at(-1) ?? [];
    expect(binary).toBe("container");
    expect(args).toEqual(["exec", "cid-2", "python", "-c", "print(42)"]);
    expect(args).not.toContain("sh");
  });

  it("preserves empty single-quoted argument", async () => {
    const engine = new DockerEngine();
    const spawnMock = vi.mocked(spawn);

    await engine.execInContainer({
      containerId: "cid-3",
      command: "printf ''",
    });

    const [, args] = spawnMock.mock.calls.at(-1) ?? [];
    expect(args).toEqual(["exec", "cid-3", "printf", ""]);
  });

  it("preserves empty double-quoted argument", async () => {
    const engine = new DockerEngine();
    const spawnMock = vi.mocked(spawn);

    await engine.execInContainer({
      containerId: "cid-5",
      command: 'python -c ""',
    });

    const [, args] = spawnMock.mock.calls.at(-1) ?? [];
    expect(args).toEqual(["exec", "cid-5", "python", "-c", ""]);
  });

  it("preserves escaped spaces in arguments", async () => {
    const engine = new DockerEngine();
    const spawnMock = vi.mocked(spawn);

    await engine.execInContainer({
      containerId: "cid-6",
      command: "printf hello\\ world",
    });

    const [, args] = spawnMock.mock.calls.at(-1) ?? [];
    expect(args).toEqual(["exec", "cid-6", "printf", "hello world"]);
  });

  it("preserves escaped quotes inside double-quoted argument", async () => {
    const engine = new DockerEngine();
    const spawnMock = vi.mocked(spawn);

    await engine.execInContainer({
      containerId: "cid-7",
      command: 'python -c "foo\\"bar"',
    });

    const [, args] = spawnMock.mock.calls.at(-1) ?? [];
    expect(args).toEqual(["exec", "cid-7", "python", "-c", 'foo"bar']);
  });

  it("rejects shell metacharacters before spawn", async () => {
    const engine = new DockerEngine();

    await expect(
      engine.execInContainer({
        containerId: "cid-3",
        command: "echo ok; whoami",
      }),
    ).rejects.toThrow(
      "Container exec command contains unsupported shell syntax",
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("preserves explicit empty argument from paired quotes", async () => {
    const engine = new DockerEngine();
    const spawnMock = vi.mocked(spawn);

    await engine.execInContainer({
      containerId: "cid-8",
      command: "printf '' \"\"",
    });

    const [, args] = spawnMock.mock.calls.at(-1) ?? [];
    expect(args).toEqual(["exec", "cid-8", "printf", "", ""]);
  });
});
