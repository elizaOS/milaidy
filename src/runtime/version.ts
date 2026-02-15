import { resolveMilaidyVersion } from "../version-resolver.js";

// Single source of truth for the current Milaidy version.
// - Embedded/bundled builds: injected define or env var.
// - Dev/npm builds: package.json or build-info fallback.
export const VERSION = resolveMilaidyVersion(import.meta.url);
