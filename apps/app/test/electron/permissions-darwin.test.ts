/**
 * Unit tests for macOS permission detection
 * (apps/app/electron/src/native/permissions-darwin.ts)
 */
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock("node:child_process", async () => {
  const { promisify } = await import("node:util");
  const execFn = vi.fn();
  // Attach custom promisify so util.promisify(exec) returns { stdout, stderr }
  // matching Node's real child_process.exec behavior.
  // biome-ignore lint/suspicious/noExplicitAny: test mock requires dynamic property assignment
  // biome-ignore lint/style/noNonNullAssertion: promisify.custom is always defined in Node
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

vi.mock("electron", () => ({
  shell: {
    openExternal: vi.fn(),
  },
  systemPreferences: {
    askForMediaAccess: vi.fn(),
    getMediaAccessStatus: vi.fn(),
  },
  desktopCapturer: {
    getSources: vi.fn(),
  },
}));

import { exec } from "node:child_process";
import { desktopCapturer, shell, systemPreferences } from "electron";
import {
  checkAccessibility,
  checkCamera,
  checkMicrophone,
  checkPermission,
  checkScreenRecording,
  openPrivacySettings,
  requestCamera,
  requestMicrophone,
  requestPermission,
} from "../../electron/src/native/permissions-darwin";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const execMock = exec as unknown as Mock;

/**
 * Configure the callback-style exec mock to respond to commands matching a
 * pattern. promisify(exec) will call exec(cmd, opts, cb) under the hood.
 */
function mockExecResult(
  pattern: string | RegExp,
  result: { stdout: string; stderr?: string } | Error,
) {
  execMock.mockImplementation(
    (cmd: string, opts: unknown, cb?: (...args: unknown[]) => void) => {
      const callback = typeof opts === "function" ? opts : cb;
      const matches =
        typeof pattern === "string" ? cmd.includes(pattern) : pattern.test(cmd);
      if (matches) {
        if (result instanceof Error) callback?.(result, "", result.message);
        else callback?.(null, result.stdout, result.stderr || "");
      } else {
        callback?.(new Error(`unexpected command: ${cmd}`), "", "");
      }
    },
  );
}

/**
 * Configure exec to respond to multiple patterns in order.
 */
function _mockExecSequence(
  entries: Array<{
    pattern: string | RegExp;
    result: { stdout: string; stderr?: string } | Error;
  }>,
) {
  execMock.mockImplementation(
    (cmd: string, opts: unknown, cb?: (...args: unknown[]) => void) => {
      const callback = typeof opts === "function" ? opts : cb;
      for (const { pattern, result } of entries) {
        const matches =
          typeof pattern === "string"
            ? cmd.includes(pattern)
            : pattern.test(cmd);
        if (matches) {
          if (result instanceof Error) callback?.(result, "", result.message);
          else callback?.(null, result.stdout, result.stderr || "");
          return;
        }
      }
      callback?.(new Error(`unexpected command: ${cmd}`), "", "");
    },
  );
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("checkAccessibility", () => {
  it("returns granted when osascript returns 'true'", async () => {
    mockExecResult("osascript", { stdout: "true\n" });
    const result = await checkAccessibility();
    expect(result.status).toBe("granted");
    expect(result.canRequest).toBe(false);
  });

  it("returns denied when stderr contains 'not allowed'", async () => {
    mockExecResult("osascript", new Error("not allowed assistive access"));
    const result = await checkAccessibility();
    expect(result.status).toBe("denied");
  });

  it("returns denied when stderr contains 'assistive'", async () => {
    mockExecResult("osascript", new Error("assistive devices"));
    const result = await checkAccessibility();
    expect(result.status).toBe("denied");
  });

  it("falls back to position query on ambiguous result", async () => {
    // First call: no clear result, second call: position query succeeds
    let callCount = 0;
    execMock.mockImplementation(
      (_cmd: string, opts: unknown, cb?: (...args: unknown[]) => void) => {
        const callback = typeof opts === "function" ? opts : cb;
        callCount++;
        if (callCount === 1) {
          // First osascript returns empty (ambiguous)
          callback?.(null, "", "");
        } else {
          // Position query succeeds
          callback?.(null, "100, 200", "");
        }
      },
    );

    const result = await checkAccessibility();
    expect(result.status).toBe("granted");
  });

  it("returns denied when both queries fail", async () => {
    let callCount = 0;
    execMock.mockImplementation(
      (_cmd: string, opts: unknown, cb?: (...args: unknown[]) => void) => {
        const callback = typeof opts === "function" ? opts : cb;
        callCount++;
        if (callCount === 1) {
          callback?.(null, "", "");
        } else {
          callback?.(new Error("failed"), "", "failed");
        }
      },
    );

    const result = await checkAccessibility();
    expect(result.status).toBe("denied");
  });
});

describe("checkScreenRecording", () => {
  const getSourcesMock = desktopCapturer.getSources as Mock;

  it("returns denied when no sources", async () => {
    getSourcesMock.mockResolvedValue([]);
    const result = await checkScreenRecording();
    expect(result.status).toBe("denied");
  });

  it("returns granted when bitmap has non-zero pixels", async () => {
    const bitmap = Buffer.alloc(400);
    bitmap[0] = 255; // non-zero R
    getSourcesMock.mockResolvedValue([
      {
        thumbnail: {
          getSize: () => ({ width: 100, height: 100 }),
          toBitmap: () => bitmap,
        },
      },
    ]);

    const result = await checkScreenRecording();
    expect(result.status).toBe("granted");
  });

  it("returns not-determined when all bitmap pixels are zero", async () => {
    const bitmap = Buffer.alloc(400); // all zeros
    getSourcesMock.mockResolvedValue([
      {
        thumbnail: {
          getSize: () => ({ width: 100, height: 100 }),
          toBitmap: () => bitmap,
        },
      },
    ]);

    const result = await checkScreenRecording();
    expect(result.status).toBe("not-determined");
  });

  it("returns not-determined when thumbnail has zero size", async () => {
    getSourcesMock.mockResolvedValue([
      {
        thumbnail: {
          getSize: () => ({ width: 0, height: 0 }),
          toBitmap: () => Buffer.alloc(0),
        },
      },
    ]);

    const result = await checkScreenRecording();
    expect(result.status).toBe("not-determined");
  });

  it("returns not-determined when thumbnail is null", async () => {
    getSourcesMock.mockResolvedValue([{ thumbnail: null }]);
    const result = await checkScreenRecording();
    expect(result.status).toBe("not-determined");
  });
});

describe("checkMicrophone", () => {
  const getMediaMock = systemPreferences.getMediaAccessStatus as Mock;

  it("maps 'granted' correctly", async () => {
    getMediaMock.mockReturnValue("granted");
    const result = await checkMicrophone();
    expect(result.status).toBe("granted");
    expect(result.canRequest).toBe(false);
  });

  it("maps 'denied' correctly", async () => {
    getMediaMock.mockReturnValue("denied");
    const result = await checkMicrophone();
    expect(result.status).toBe("denied");
    expect(result.canRequest).toBe(false);
  });

  it("maps 'restricted' correctly", async () => {
    getMediaMock.mockReturnValue("restricted");
    const result = await checkMicrophone();
    expect(result.status).toBe("restricted");
    expect(result.canRequest).toBe(false);
  });

  it("maps 'not-determined' correctly", async () => {
    getMediaMock.mockReturnValue("not-determined");
    const result = await checkMicrophone();
    expect(result.status).toBe("not-determined");
    expect(result.canRequest).toBe(true);
  });

  it("defaults unknown values to not-determined", async () => {
    getMediaMock.mockReturnValue("unknown-value");
    const result = await checkMicrophone();
    expect(result.status).toBe("not-determined");
    expect(result.canRequest).toBe(true);
  });
});

describe("checkCamera", () => {
  const getMediaMock = systemPreferences.getMediaAccessStatus as Mock;

  it("maps 'granted' correctly", async () => {
    getMediaMock.mockReturnValue("granted");
    const result = await checkCamera();
    expect(result.status).toBe("granted");
  });

  it("maps 'denied' correctly", async () => {
    getMediaMock.mockReturnValue("denied");
    const result = await checkCamera();
    expect(result.status).toBe("denied");
  });

  it("maps 'restricted' correctly", async () => {
    getMediaMock.mockReturnValue("restricted");
    const result = await checkCamera();
    expect(result.status).toBe("restricted");
  });

  it("maps 'not-determined' correctly", async () => {
    getMediaMock.mockReturnValue("not-determined");
    const result = await checkCamera();
    expect(result.status).toBe("not-determined");
    expect(result.canRequest).toBe(true);
  });
});

describe("requestMicrophone", () => {
  const askMock = systemPreferences.askForMediaAccess as Mock;

  it("returns granted when user accepts", async () => {
    askMock.mockResolvedValue(true);
    const result = await requestMicrophone();
    expect(result.status).toBe("granted");
    expect(askMock).toHaveBeenCalledWith("microphone");
  });

  it("returns denied when user rejects", async () => {
    askMock.mockResolvedValue(false);
    const result = await requestMicrophone();
    expect(result.status).toBe("denied");
  });
});

describe("requestCamera", () => {
  const askMock = systemPreferences.askForMediaAccess as Mock;

  it("returns granted when user accepts", async () => {
    askMock.mockResolvedValue(true);
    const result = await requestCamera();
    expect(result.status).toBe("granted");
    expect(askMock).toHaveBeenCalledWith("camera");
  });

  it("returns denied when user rejects", async () => {
    askMock.mockResolvedValue(false);
    const result = await requestCamera();
    expect(result.status).toBe("denied");
  });
});

describe("openPrivacySettings", () => {
  const openMock = shell.openExternal as Mock;

  it("opens accessibility URL", async () => {
    await openPrivacySettings("accessibility");
    expect(openMock).toHaveBeenCalledWith(
      expect.stringContaining("Privacy_Accessibility"),
    );
  });

  it("opens screen-recording URL", async () => {
    await openPrivacySettings("screen-recording");
    expect(openMock).toHaveBeenCalledWith(
      expect.stringContaining("Privacy_ScreenCapture"),
    );
  });

  it("opens microphone URL", async () => {
    await openPrivacySettings("microphone");
    expect(openMock).toHaveBeenCalledWith(
      expect.stringContaining("Privacy_Microphone"),
    );
  });

  it("opens camera URL", async () => {
    await openPrivacySettings("camera");
    expect(openMock).toHaveBeenCalledWith(
      expect.stringContaining("Privacy_Camera"),
    );
  });

  it("uses x-apple.systempreferences scheme", async () => {
    await openPrivacySettings("microphone");
    expect(openMock).toHaveBeenCalledWith(
      expect.stringContaining("x-apple.systempreferences:"),
    );
  });
});

describe("checkPermission dispatcher", () => {
  it("routes accessibility", async () => {
    mockExecResult("osascript", { stdout: "true\n" });
    const result = await checkPermission("accessibility");
    expect(result.status).toBe("granted");
  });

  it("routes microphone", async () => {
    (systemPreferences.getMediaAccessStatus as Mock).mockReturnValue("granted");
    const result = await checkPermission("microphone");
    expect(result.status).toBe("granted");
  });

  it("routes camera", async () => {
    (systemPreferences.getMediaAccessStatus as Mock).mockReturnValue("denied");
    const result = await checkPermission("camera");
    expect(result.status).toBe("denied");
  });

  it("returns granted for shell", async () => {
    const result = await checkPermission("shell");
    expect(result.status).toBe("granted");
  });

  it("returns not-applicable for unknown", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing unknown permission id
    const result = await checkPermission("unknown-id" as any);
    expect(result.status).toBe("not-applicable");
  });
});

describe("requestPermission dispatcher", () => {
  it("routes microphone to requestMicrophone", async () => {
    (systemPreferences.askForMediaAccess as Mock).mockResolvedValue(true);
    const result = await requestPermission("microphone");
    expect(result.status).toBe("granted");
  });

  it("routes camera to requestCamera", async () => {
    (systemPreferences.askForMediaAccess as Mock).mockResolvedValue(false);
    const result = await requestPermission("camera");
    expect(result.status).toBe("denied");
  });

  it("opens settings for accessibility then re-checks", async () => {
    vi.useFakeTimers();
    const openMock = shell.openExternal as Mock;
    openMock.mockResolvedValue(undefined);
    // The re-check will call osascript
    mockExecResult("osascript", { stdout: "true\n" });

    const promise = requestPermission("accessibility");
    await vi.advanceTimersByTimeAsync(600);
    const result = await promise;

    expect(openMock).toHaveBeenCalled();
    expect(result.status).toBe("granted");
    vi.useRealTimers();
  });

  it("opens settings for screen-recording then re-checks", async () => {
    vi.useFakeTimers();
    const openMock = shell.openExternal as Mock;
    openMock.mockResolvedValue(undefined);
    (desktopCapturer.getSources as Mock).mockResolvedValue([]);

    const promise = requestPermission("screen-recording");
    await vi.advanceTimersByTimeAsync(600);
    const result = await promise;

    expect(openMock).toHaveBeenCalled();
    expect(result.status).toBe("denied");
    vi.useRealTimers();
  });

  it("returns granted for shell", async () => {
    const result = await requestPermission("shell");
    expect(result.status).toBe("granted");
  });

  it("returns not-applicable for unknown", async () => {
    // biome-ignore lint/suspicious/noExplicitAny: testing unknown permission id
    const result = await requestPermission("unknown-id" as any);
    expect(result.status).toBe("not-applicable");
  });
});
