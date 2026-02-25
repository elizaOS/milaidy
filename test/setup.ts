import { afterAll, afterEach, vi } from "vitest";

// Ensure Vitest environment is properly set
process.env.VITEST = "true";
// Keep test output focused on failures; individual tests can override.
process.env.LOG_LEVEL ??= "error";

declare global {
  // React 18 testing flag to suppress act() environment warnings.
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const originalConsoleError = console.error.bind(console);

function shouldIgnoreConsoleError(args: unknown[]): boolean {
  const first = args[0];
  if (typeof first !== "string") return false;
  return (
    first.includes("react-test-renderer is deprecated") ||
    first.includes(
      "The current testing environment is not configured to support act(...)",
    )
  );
}

console.error = (...args: unknown[]) => {
  if (shouldIgnoreConsoleError(args)) return;
  originalConsoleError(...args);
};

import { withIsolatedTestHome } from "./test-env";

const testEnv = withIsolatedTestHome();
afterAll(() => testEnv.cleanup());

afterEach(() => {
  // Guard against leaked fake timers across test files/workers.
  vi.useRealTimers();
});
