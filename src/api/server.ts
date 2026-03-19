/**
 * REST API server for the Milady Control UI.
 *
 * The full implementation lives in `@miladyai/autonomous`. This file re-exports
 * it so the root `tsdown` entry (`src/api/server.ts`) and imports like
 * `import { startApiServer } from "../src/api/server"` resolve to the same
 * backend as the workspace package (and avoid duplicating 15k+ lines here).
 */
export * from "@miladyai/autonomous/api/server";
