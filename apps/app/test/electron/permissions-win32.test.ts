/**
 * Unit tests for Windows permission detection
 * (apps/app/electron/src/native/permissions-win32.ts)
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

vi.mock("electron", () => ({
  shell: {
    openExternal: vi.fn(),
  },
}));

import { shell } from "electron";
import {
  checkCamera,
  checkMicrophone,
  checkPermission,
  openPrivacySettings,
  requestPermission,
} from "../../electron/src/native/permissions-win32";
import { mockExecSequence } from "./helpers/exec-mock";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

// ---------------------------------------------------------------------------
// checkMicrophone
// ---------------------------------------------------------------------------

describe("checkMicrophone", () => {
  it("returns granted when HKCU has Allow", async () => {
    mockExecSequence([
      {
        pattern: "HKCU",
        result: { stdout: "    Value    REG_SZ    Allow" },
      },
    ]);
    const result = await checkMicrophone();
    expect(result.status).toBe("granted");
  });

  it("returns denied when HKCU has Deny", async () => {
    mockExecSequence([
      {
        pattern: "HKCU",
        result: { stdout: "    Value    REG_SZ    Deny" },
      },
    ]);
    const result = await checkMicrophone();
    expect(result.status).toBe("denied");
  });

  it("returns not-determined when key not found", async () => {
    mockExecSequence([
      {
        pattern: "HKCU",
        result: new Error("not found"),
      },
    ]);
    const result = await checkMicrophone();
    expect(result.status).toBe("not-determined");
    expect(result.canRequest).toBe(true);
  });

  it("returns restricted when HKLM has Deny", async () => {
    mockExecSequence([
      {
        pattern: "HKCU",
        result: { stdout: "    Value    REG_SZ    SomethingElse" },
      },
      {
        pattern: "HKLM",
        result: { stdout: "    Value    REG_SZ    Deny" },
      },
    ]);
    const result = await checkMicrophone();
    expect(result.status).toBe("restricted");
  });

  it("returns not-determined when both are inconclusive", async () => {
    mockExecSequence([
      {
        pattern: "HKCU",
        result: { stdout: "    Value    REG_SZ    Pending" },
      },
      {
        pattern: "HKLM",
        result: { stdout: "    Value    REG_SZ    Pending" },
      },
    ]);
    const result = await checkMicrophone();
    expect(result.status).toBe("not-determined");
    expect(result.canRequest).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// checkCamera
// ---------------------------------------------------------------------------

describe("checkCamera", () => {
  it("returns granted when HKCU has Allow", async () => {
    mockExecSequence([
      {
        pattern: "webcam",
        result: { stdout: "    Value    REG_SZ    Allow" },
      },
    ]);
    const result = await checkCamera();
    expect(result.status).toBe("granted");
  });

  it("returns denied when HKCU has Deny", async () => {
    mockExecSequence([
      {
        pattern: "webcam",
        result: { stdout: "    Value    REG_SZ    Deny" },
      },
    ]);
    const result = await checkCamera();
    expect(result.status).toBe("denied");
  });

  it("returns not-determined when key not found", async () => {
    mockExecSequence([
      {
        pattern: "webcam",
        result: new Error("not found"),
      },
    ]);
    const result = await checkCamera();
    expect(result.status).toBe("not-determined");
  });

  it("returns restricted when HKLM has Deny", async () => {
    mockExecSequence([
      {
        pattern: /HKCU.*webcam/,
        result: { stdout: "    Value    REG_SZ    Unknown" },
      },
      {
        pattern: /HKLM.*webcam/,
        result: { stdout: "    Value    REG_SZ    Deny" },
      },
    ]);
    const result = await checkCamera();
    expect(result.status).toBe("restricted");
  });

  it("returns not-determined when both inconclusive", async () => {
    mockExecSequence([
      {
        pattern: /HKCU.*webcam/,
        result: { stdout: "    Value    REG_SZ    Pending" },
      },
      {
        pattern: /HKLM.*webcam/,
        result: { stdout: "    Value    REG_SZ    Pending" },
      },
    ]);
    const result = await checkCamera();
    expect(result.status).toBe("not-determined");
  });
});

// ---------------------------------------------------------------------------
// openPrivacySettings
// ---------------------------------------------------------------------------

describe("openPrivacySettings", () => {
  const openMock = shell.openExternal as Mock;

  it("opens ms-settings:privacy-microphone for microphone", async () => {
    await openPrivacySettings("microphone");
    expect(openMock).toHaveBeenCalledWith("ms-settings:privacy-microphone");
  });

  it("opens ms-settings:privacy-webcam for camera", async () => {
    await openPrivacySettings("camera");
    expect(openMock).toHaveBeenCalledWith("ms-settings:privacy-webcam");
  });

  it("opens ms-settings:easeofaccess for accessibility", async () => {
    await openPrivacySettings("accessibility");
    expect(openMock).toHaveBeenCalledWith("ms-settings:easeofaccess");
  });

  it("opens correct URI for screen-recording", async () => {
    await openPrivacySettings("screen-recording");
    expect(openMock).toHaveBeenCalledWith(
      "ms-settings:privacy-broadcastglobalsettings",
    );
  });

  it("opens ms-settings:developers for shell", async () => {
    await openPrivacySettings("shell");
    expect(openMock).toHaveBeenCalledWith("ms-settings:developers");
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

  it("returns not-applicable for screen-recording", async () => {
    const result = await checkPermission("screen-recording");
    expect(result.status).toBe("not-applicable");
  });

  it("routes microphone to checkMicrophone", async () => {
    mockExecSequence([
      {
        pattern: "microphone",
        result: { stdout: "    Value    REG_SZ    Allow" },
      },
    ]);
    const result = await checkPermission("microphone");
    expect(result.status).toBe("granted");
  });

  it("routes camera to checkCamera", async () => {
    mockExecSequence([
      {
        pattern: "webcam",
        result: { stdout: "    Value    REG_SZ    Deny" },
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
      const openMock = shell.openExternal as Mock;
      openMock.mockResolvedValue(undefined);

      mockExecSequence([
        {
          pattern: "microphone",
          result: { stdout: "    Value    REG_SZ    Allow" },
        },
      ]);

      const promise = requestPermission("microphone");
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;

      expect(openMock).toHaveBeenCalledWith("ms-settings:privacy-microphone");
      expect(result.status).toBe("granted");
    });

    it("opens settings for camera then re-checks", async () => {
      const openMock = shell.openExternal as Mock;
      openMock.mockResolvedValue(undefined);

      mockExecSequence([
        {
          pattern: "webcam",
          result: { stdout: "    Value    REG_SZ    Deny" },
        },
      ]);

      const promise = requestPermission("camera");
      await vi.advanceTimersByTimeAsync(600);
      const result = await promise;

      expect(openMock).toHaveBeenCalled();
      expect(result.status).toBe("denied");
    });
  });

  it("returns not-applicable for accessibility", async () => {
    const result = await requestPermission("accessibility");
    expect(result.status).toBe("not-applicable");
  });

  it("returns not-applicable for screen-recording", async () => {
    const result = await requestPermission("screen-recording");
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
