import { exec } from "node:child_process";
import type { Mock } from "vitest";

export const execMock = exec as unknown as Mock;

export function mockExecResult(
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

export function mockExecSequence(
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
