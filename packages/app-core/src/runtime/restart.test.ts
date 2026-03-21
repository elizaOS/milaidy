/**
 * Unit tests for the restart infrastructure.
 *
 * Validates the pluggable handler system without actually exiting the process
 * or starting a runtime.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  RESTART_EXIT_CODE,
  requestRestart,
  setRestartHandler,
} from "./restart";

describe("restart", () => {
  // Replace the default process.exit handler before each test to avoid
  // actually exiting the test runner.
  beforeEach(() => {
    setRestartHandler(() => {
      /* no-op */
    });
  });

  it("RESTART_EXIT_CODE is 75", () => {
    expect(RESTART_EXIT_CODE).toBe(75);
  });

  describe("setRestartHandler / requestRestart", () => {
    it("calls the registered handler synchronously", () => {
      const handler = vi.fn();
      setRestartHandler(handler);

      requestRestart();

      expect(handler).toHaveBeenCalledOnce();
      expect(handler).toHaveBeenCalledWith(undefined);
    });

    it("passes the reason string to the handler", () => {
      const handler = vi.fn();
      setRestartHandler(handler);

      requestRestart("config changed");

      expect(handler).toHaveBeenCalledWith("config changed");
    });

    it("supports async handlers", async () => {
      let resolved = false;
      setRestartHandler(async () => {
        await new Promise<void>((r) => setTimeout(r, 10));
        resolved = true;
      });

      const result = requestRestart("async test");
      expect(result).toBeInstanceOf(Promise);

      await result;
      expect(resolved).toBe(true);
    });

    it("replaces the previous handler when called again", () => {
      const first = vi.fn();
      const second = vi.fn();

      setRestartHandler(first);
      setRestartHandler(second);

      requestRestart();

      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledOnce();
    });
  });
});
