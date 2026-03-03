import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoadingScreen } from "./loading-screen.js";

describe("LoadingScreen", () => {
  let writeSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    writeSpy = vi.spyOn(process.stdout, "write").mockReturnValue(true);
    // Provide stable terminal dimensions
    Object.defineProperty(process.stdout, "columns", {
      value: 80,
      configurable: true,
    });
    Object.defineProperty(process.stdout, "rows", {
      value: 24,
      configurable: true,
    });
  });

  afterEach(() => {
    writeSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it("creates with default agent name", () => {
    const screen = new LoadingScreen();
    expect(screen).toBeDefined();
  });

  it("creates with custom agent name", () => {
    const screen = new LoadingScreen("Luna");
    expect(screen).toBeDefined();
  });

  it("start() enters alternate screen and hides cursor", () => {
    vi.useFakeTimers();
    const screen = new LoadingScreen("TestAgent");

    screen.start();

    const firstCall = writeSpy.mock.calls[0][0] as string;
    expect(firstCall).toContain("\x1b[?1049h"); // alt screen
    expect(firstCall).toContain("\x1b[?25l"); // hide cursor

    screen.stop();
    vi.useRealTimers();
  });

  it("stop() leaves alternate screen and shows cursor", () => {
    vi.useFakeTimers();
    const screen = new LoadingScreen("TestAgent");
    screen.start();
    writeSpy.mockClear();

    screen.stop();

    const stopOutput = writeSpy.mock.calls[0][0] as string;
    expect(stopOutput).toContain("\x1b[?1049l"); // leave alt screen
    expect(stopOutput).toContain("\x1b[?25h"); // show cursor

    vi.useRealTimers();
  });

  it("renders agent name in output", () => {
    vi.useFakeTimers();
    const screen = new LoadingScreen("Luna");
    screen.start();

    // Collect all write calls and check the agent name appears
    const allOutput = writeSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(allOutput).toContain("Luna");

    screen.stop();
    vi.useRealTimers();
  });

  it("update() changes the displayed label", () => {
    vi.useFakeTimers();
    const screen = new LoadingScreen("TestAgent");
    screen.start();
    writeSpy.mockClear();

    screen.update(0.5, "Loading plugins");
    vi.advanceTimersByTime(100); // trigger a render

    const allOutput = writeSpy.mock.calls.map((c) => String(c[0])).join("");
    expect(allOutput).toContain("Loading plugins");

    screen.stop();
    vi.useRealTimers();
  });

  it("clamps progress between 0 and 1", () => {
    const screen = new LoadingScreen();
    // Should not throw
    screen.update(-0.5, "under");
    screen.update(1.5, "over");
    screen.update(0.5, "normal");
  });

  it("stop() is idempotent", () => {
    vi.useFakeTimers();
    const screen = new LoadingScreen();
    screen.start();

    screen.stop();
    screen.stop(); // should not throw

    vi.useRealTimers();
  });

  it("animates on interval", () => {
    vi.useFakeTimers();
    const screen = new LoadingScreen("Anim");
    screen.start();
    const callCount = writeSpy.mock.calls.length;

    vi.advanceTimersByTime(240); // ~3 frames at 80ms

    expect(writeSpy.mock.calls.length).toBeGreaterThan(callCount);

    screen.stop();
    vi.useRealTimers();
  });
});
