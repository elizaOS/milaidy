#!/usr/bin/env node

// mldy — alias for the milady CLI.
// Delegates to the milady package's CLI entry point so that
// `npx mldy` behaves identically to `npx milady`.

import module from "node:module";

// https://nodejs.org/api/module.html#module-compile-cache
if (module.enableCompileCache && !process.env.NODE_DISABLE_COMPILE_CACHE) {
  try {
    module.enableCompileCache();
  } catch {
    // Ignore errors
  }
}

await import("milady/cli-entry");
