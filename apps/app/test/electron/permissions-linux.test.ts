/**
 * Unit tests for Linux permission detection
 * (apps/app/electron/src/native/permissions-linux.ts)
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const execFn = vi.fn();
  // biome-ignore lint/style/noNonNullAssertion: promisify.custom is defined
  // biome-ignore lint/suspicious/noExplicitAny: test mock
  (execFn as any)[promisify.custom!] = (...args: unknown[]) =>
    new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
      const cb = (err: Error | null, stdout = "", stderr = "") => {
        if (err) {
          Object.assign(err, { stdout, stderr });
          reject(err);
        } else {
          resolve({ stdout, stderr });
        }
      };
      execFn(...args, cb);
    });
  return { exec: execFn };
});

vi.mock("node:fs/promises", () => ({
  access: vi.fn(),
  constants: { R_OK: 4 },
}));

vi.mock("electron", () => ({
  shell: {
    openPath: vi.fn(),
  },
}));

import { access } from "node:fs/promises";
import { shell } from "electron";
import {
  checkCamera,
  checkMicrophone,
  checkPermission,
  checkScreenRecording,
  openPrivacySettings,
  requestPermission,
} from "../../electron/src/native/permissions-linux";
import { execMock, mockExecSequence } from "./helpers/exec-mock";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const accessMock = access as unknown as Mock;
const openPathMock = shell.openPath as Mock;

/** Save and restore env vars modified by tests */
const envBackup: Record<string, string | undefined> = {};

function setEnv(key: string, value: string | undefined) {
  if (!(key in envBackup)) envBackup[key] = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function restoreEnv() {
  for (const [key, value] of Object.entries(envBackup)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  for (const key of Object.keys(envBackup)) delete envBackup[key];
}

beforeEach(() => {
  vi.clearAllMocks();
  openPathMock.mockResolvedValue("");
});

afterEach(() => {
  restoreEnv();
});

// ---------------------------------------------------------------------------
// checkMicrophone
// ---------------------------------------------------------------------------

describe("checkMicrophone", () => {
  it("returns granted when PulseAudio is available with sources", async () => {
    mockExecSequence([
      {
        pattern: "pactl info",
        result: { stdout: "Server Name: PulseAudio" },
      },
      {
        pattern: "pactl list sources",
        result: { stdout: "0\talsa_input.pci\tRUNNING" },
      },
    ]);

    const result = await checkMicrophone();
    expect(result.status).toBe("granted");
  });

  it("falls back to PipeWire when PulseAudio fails", async () => {
    mockExecSequence([
      {
        pattern: "pactl info",
        result: new Error("connection refused"),
      },
      {
        pattern: "pw-cli",
        result: { stdout: "id: 0, type: PipeWire:Interface:Core/4" },
      },
    ]);

    const result = await checkMicrophone();
    expect(result.status).toBe("granted");
  });

  it("falls back to ALSA when PulseAudio and PipeWire fail", async () => {
    mockExecSequence([
      {
        pattern: "pactl info",
        result: new Error("failed"),
      },
      {
        pattern: "pw-cli",
        result: { stdout: "" },
      },
      {
        pattern: "arecord",
        result: { stdout: "card 0: Intel [HDA Intel], device 0" },
      },
    ]);

    const result = await checkMicrophone();
    expect(result.status).toBe("granted");
  });

  it("falls back to audio group membership", async () => {
    mockExecSequence([
      {
        pattern: "pactl info",
        result: new Error("failed"),
      },
      {
        pattern: "pw-cli",
        result: { stdout: "" },
      },
      {
        pattern: "arecord",
        result: { stdout: "" },
      },
      {
        pattern: "groups",
        result: { stdout: "user audio video" },
      },
    ]);

    const result = await checkMicrophone();
    expect(result.status).toBe("granted");
  });

  it("returns denied when all checks fail", async () => {
    mockExecSequence([
      {
        pattern: "pactl info",
        result: new Error("failed"),
      },
      {
        pattern: "pw-cli",
        result: { stdout: "" },
      },
      {
        pattern: "arecord",
        result: { stdout: "" },
      },
      {
        pattern: "groups",
        result: { stdout: "user video" },
      },
    ]);

    const result = await checkMicrophone();
    expect(result.status).toBe("denied");
  });

  it("returns granted when PulseAudio available but no sources falls through to PipeWire", async () => {
    mockExecSequence([
      {
        pattern: "pactl info",
        result: { stdout: "Server Name: PulseAudio" },
      },
      {
        pattern: "pactl list sources",
        result: { stdout: "" },
      },
      {
        pattern: "pw-cli",
        result: { stdout: "id: 0" },
      },
    ]);

    const result = await checkMicrophone();
    expect(result.status).toBe("granted");
  });
});

// ---------------------------------------------------------------------------
// checkCamera
// ---------------------------------------------------------------------------

describe("checkCamera", () => {
  it("returns denied when no /dev/video* devices", async () => {
    mockExecSequence([
      {
        pattern: "ls /dev/video",
        result: new Error("No such file or directory"),
      },
      {
        pattern: "groups",
        result: { stdout: "user" },
      },
    ]);

    const result = await checkCamera();
    expect(result.status).toBe("denied");
  });

  it("returns granted when device exists and is readable", async () => {
    mockExecSequence([
      {
        pattern: "ls /dev/video",
        result: { stdout: "/dev/video0\n/dev/video1" },
      },
    ]);
    accessMock.mockResolvedValue(undefined);

    const result = await checkCamera();
    expect(result.status).toBe("granted");
  });

  it("falls back to video group when device not readable", async () => {
    mockExecSequence([
      {
        pattern: "ls /dev/video",
        result: { stdout: "/dev/video0" },
      },
      {
        pattern: "groups",
        result: { stdout: "user audio video" },
      },
    ]);
    accessMock.mockRejectedValue(new Error("EACCES"));

    const result = await checkCamera();
    expect(result.status).toBe("granted");
  });

  it("returns denied when no device and no video group", async () => {
    mockExecSequence([
      {
        pattern: "ls /dev/video",
        result: { stdout: "" },
      },
      {
        pattern: "groups",
        result: { stdout: "user audio" },
      },
    ]);

    const result = await checkCamera();
    expect(result.status).toBe("denied");
  });

  it("returns denied when ls returns error", async () => {
    mockExecSequence([
      {
        pattern: "ls /dev/video",
        result: new Error("No such file"),
      },
      {
        pattern: "groups",
        result: { stdout: "user" },
      },
    ]);

    const result = await checkCamera();
    expect(result.status).toBe("denied");
  });
});

// ---------------------------------------------------------------------------
// checkScreenRecording
// ---------------------------------------------------------------------------

describe("checkScreenRecording", () => {
  it("returns not-determined when WAYLAND_DISPLAY is set", async () => {
    setEnv("WAYLAND_DISPLAY", "wayland-0");
    setEnv("XDG_SESSION_TYPE", undefined);

    const result = await checkScreenRecording();
    expect(result.status).toBe("not-determined");
    expect(result.canRequest).toBe(true);
  });

  it("returns not-determined when XDG_SESSION_TYPE=wayland", async () => {
    setEnv("WAYLAND_DISPLAY", undefined);
    setEnv("XDG_SESSION_TYPE", "wayland");

    const result = await checkScreenRecording();
    expect(result.status).toBe("not-determined");
    expect(result.canRequest).toBe(true);
  });

  it("returns not-applicable on X11", async () => {
    setEnv("WAYLAND_DISPLAY", undefined);
    setEnv("XDG_SESSION_TYPE", "x11");

    const result = await checkScreenRecording();
    expect(result.status).toBe("not-applicable");
  });

  it("returns not-applicable when no display vars set", async () => {
    setEnv("WAYLAND_DISPLAY", undefined);
    setEnv("XDG_SESSION_TYPE", undefined);

    const result = await checkScreenRecording();
    expect(result.status).toBe("not-applicable");
  });
});

// ---------------------------------------------------------------------------
// openPrivacySettings
// ---------------------------------------------------------------------------

describe("openPrivacySettings", () => {
  it("tries gnome-control-center for GNOME desktop", async () => {
    setEnv("XDG_CURRENT_DESKTOP", "GNOME");
    mockExecSequence([
      {
        pattern: "which gnome-control-center",
        result: { stdout: "/usr/bin/gnome-control-center" },
      },
      {
        pattern: "gnome-control-center",
        result: { stdout: "" },
      },
    ]);

    await openPrivacySettings("microphone");
    expect(execMock).toHaveBeenCalled();
  });

  it("tries systemsettings5 for KDE desktop", async () => {
    setEnv("XDG_CURRENT_DESKTOP", "KDE");
    mockExecSequence([
      {
        pattern: "which systemsettings5",
        result: { stdout: "/usr/bin/systemsettings5" },
      },
      {
        pattern: "systemsettings5",
        result: { stdout: "" },
      },
    ]);

    await openPrivacySettings("microphone");
    expect(execMock).toHaveBeenCalled();
  });

  it("tries pavucontrol for microphone on generic desktop", async () => {
    setEnv("XDG_CURRENT_DESKTOP", "sway");
    mockExecSequence([
      {
        pattern: "which pavucontrol",
        result: { stdout: "/usr/bin/pavucontrol" },
      },
      {
        pattern: "pavucontrol",
        result: { stdout: "" },
      },
    ]);

    await openPrivacySettings("microphone");
    expect(execMock).toHaveBeenCalled();
  });

  it("falls back to shell.openPath when no command found", async () => {
    setEnv("XDG_CURRENT_DESKTOP", "sway");
    // All `which` commands fail
    execMock.mockImplementation(
      (_cmd: string, opts: unknown, cb?: (...a: unknown[]) => void) => {
        const callback = typeof opts === "function" ? opts : cb;
        callback?.(null, "", "");
      },
    );

    await openPrivacySettings("camera");
    expect(openPathMock).toHaveBeenCalledWith("/");
  });

  it("does not try pavucontrol for camera permission", async () => {
    setEnv("XDG_CURRENT_DESKTOP", "sway");
    execMock.mockImplementation(
      (_cmd: string, opts: unknown, cb?: (...a: unknown[]) => void) => {
        const callback = typeof opts === "function" ? opts : cb;
        callback?.(null, "", "");
      },
    );

    await openPrivacySettings("camera");
    // Should not have tried pavucontrol for camera
    const calls = execMock.mock.calls.map((c: unknown[]) => c[0] as string);
    expect(calls.some((c) => c.includes("pavucontrol"))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// checkPermission dispatcher
// ---------------------------------------------------------------------------

describe("checkPermission dispatcher", () => {
  it("returns not-applicable for accessibility", async () => {
    const result = await checkPermission("accessibility");
    expect(result.status).toBe("not-applicable");
  });

  it("routes screen-recording correctly", async () => {
    setEnv("WAYLAND_DISPLAY", undefined);
    setEnv("XDG_SESSION_TYPE", "x11");

    const result = await checkPermission("screen-recording");
    expect(result.status).toBe("not-applicable");
  });

  it("routes microphone to checkMicrophone", async () => {
    mockExecSequence([
      {
        pattern: "pactl info",
        result: { stdout: "Server Name: PulseAudio" },
      },
      {
        pattern: "pactl list sources",
        result: { stdout: "some sources" },
      },
    ]);

    const result = await checkPermission("microphone");
    expect(result.status).toBe("granted");
  });

  it("routes camera to checkCamera", async () => {
    mockExecSequence([
      {
        pattern: "ls /dev/video",
        result: new Error("No such file or directory"),
      },
      {
        pattern: "groups",
        result: { stdout: "user" },
      },
    ]);

    const result = await checkPermission("camera");
    expect(result.status).toBe("denied");
  });

  it("returns granted for shell", async () => {
    const result = await checkPermission("shell");
    expect(result.status).toBe("granted");
  });

  it("returns not-applicable for unknown", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test for unknown input
    const result = await checkPermission("unknown-id" as any);
    expect(result.status).toBe("not-applicable");
  });
});

// ---------------------------------------------------------------------------
// requestPermission dispatcher
// ---------------------------------------------------------------------------

describe("requestPermission dispatcher", () => {
  describe("timer-based re-check tests", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("opens settings for microphone then re-checks", async () => {
      setEnv("XDG_CURRENT_DESKTOP", "sway");

      // All which commands fail, so fallback to shell.openPath, then re-check
      execMock.mockImplementation(
        (cmd: string, opts: unknown, cb?: (...a: unknown[]) => void) => {
          const callback = typeof opts === "function" ? opts : cb;
          if (cmd.includes("pactl info")) {
            callback?.(new Error("failed"), "", "failed");
          } else if (cmd.includes("pw-cli")) {
            callback?.(null, "", "");
          } else if (cmd.includes("arecord")) {
            callback?.(null, "", "");
          } else if (cmd.includes("groups")) {
            callback?.(null, "user audio", "");
          } else {
            callback?.(null, "", "");
          }
        },
      );

      const promise = requestPermission("microphone");
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;

      expect(result.status).toBe("granted");
    });

    it("opens settings for camera then re-checks", async () => {
      setEnv("XDG_CURRENT_DESKTOP", "sway");

      execMock.mockImplementation(
        (cmd: string, opts: unknown, cb?: (...a: unknown[]) => void) => {
          const callback = typeof opts === "function" ? opts : cb;
          if (cmd.includes("ls /dev/video")) {
            callback?.(null, "No such file or directory", "");
          } else {
            callback?.(null, "", "");
          }
        },
      );

      const promise = requestPermission("camera");
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;

      expect(result.status).toBe("denied");
    });

    it("opens settings for screen-recording then re-checks", async () => {
      setEnv("WAYLAND_DISPLAY", "wayland-0");
      setEnv("XDG_CURRENT_DESKTOP", "sway");

      execMock.mockImplementation(
        (_cmd: string, opts: unknown, cb?: (...a: unknown[]) => void) => {
          const callback = typeof opts === "function" ? opts : cb;
          callback?.(null, "", "");
        },
      );

      const promise = requestPermission("screen-recording");
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;

      expect(result.status).toBe("not-determined");
    });
  });

  it("returns not-applicable for accessibility", async () => {
    const result = await requestPermission("accessibility");
    expect(result.status).toBe("not-applicable");
  });

  it("returns granted for shell", async () => {
    const result = await requestPermission("shell");
    expect(result.status).toBe("granted");
  });

  it("returns not-applicable for unknown", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: test for unknown input
    const result = await requestPermission("unknown-id" as any);
    expect(result.status).toBe("not-applicable");
  });
});
