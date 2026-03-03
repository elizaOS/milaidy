#!/usr/bin/env node

// mldy — alias for the miladyai CLI.
// Delegates to the miladyai package's CLI entry point so that
// `npx mldy` behaves identically to `npx miladyai`.

import module from "node:module";

// https://nodejs.org/api/module.html#module-compile-cache
if (module.enableCompileCache && !process.env.NODE_DISABLE_COMPILE_CACHE) {
  try {
    module.enableCompileCache();
  } catch {
    // Ignore errors
  }
}

await import("miladyai/cli-entry");
