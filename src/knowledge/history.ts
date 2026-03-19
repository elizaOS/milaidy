import path from "node:path";

/**
 * Bundled baseline knowledge injected into every runtime at boot.
 *
 * Keep this as a repo-relative path so Dockerfile.ci builds and local dev boots
 * can both resolve the source document from a clean checkout.
 */
export const HISTORY_KNOWLEDGE = path.resolve(
  process.cwd(),
  "src/knowledge/history.md",
);
