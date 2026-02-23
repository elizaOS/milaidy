/**
 * Helper functions for the START_CODING_TASK action.
 *
 * - createScratchDir()      -- Creates a scratch sandbox directory for non-repo tasks
 * - generateLabel()         -- Generate a short semantic label from repo URL and/or task description
 * - registerSessionEvents() -- Register lifecycle event handlers for a spawned session
 *
 * @module actions/coding-task-helpers
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { HandlerCallback, IAgentRuntime } from "@elizaos/core";
import type { PTYService } from "../services/pty-service.js";
import type { CodingWorkspaceService } from "../services/workspace-service.js";

/** Create a scratch sandbox directory for non-repo tasks */
export function createScratchDir(): string {
  const baseDir = path.join(os.homedir(), ".milaidy", "workspaces");
  const scratchId = randomUUID();
  const scratchDir = path.join(baseDir, scratchId);
  fs.mkdirSync(scratchDir, { recursive: true });
  return scratchDir;
}

/**
 * Generate a short semantic label from repo URL and/or task description.
 * e.g. "git-workspace-service-testbed/hello-mima" or "scratch/react-research"
 */
export function generateLabel(
  repo: string | undefined,
  task: string | undefined,
): string {
  const parts: string[] = [];

  if (repo) {
    // Extract repo name from URL: "https://github.com/owner/my-repo.git" -> "my-repo"
    const match = repo.match(/\/([^/]+?)(?:\.git)?$/);
    parts.push(match ? match[1] : "repo");
  } else {
    parts.push("scratch");
  }

  if (task) {
    // Extract a slug from the first few meaningful words of the task
    const slug = task
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, "")
      .split(/\s+/)
      .filter(
        (w) =>
          w.length > 2 &&
          !["the", "and", "for", "with", "that", "this", "from"].includes(w),
      )
      .slice(0, 3)
      .join("-");
    if (slug) parts.push(slug);
  }

  return parts.join("/");
}

/** Register lifecycle event handlers for a spawned session */
export function registerSessionEvents(
  ptyService: PTYService,
  runtime: IAgentRuntime,
  sessionId: string,
  label: string,
  scratchDir: string | null,
  callback?: HandlerCallback,
): void {
  ptyService.onSessionEvent((sid, event, data) => {
    if (sid !== sessionId) return;

    if (event === "blocked" && callback) {
      callback({
        text: `Agent "${label}" is waiting for input: ${(data as { prompt?: string }).prompt ?? "unknown prompt"}`,
      });
    }
    if (event === "task_complete") {
      if (callback) {
        const response = (data as { response?: string }).response ?? "";
        const preview =
          response.length > 500 ? `${response.slice(0, 500)}...` : response;
        callback({
          text: preview
            ? `Agent "${label}" completed the task.\n\n${preview}`
            : `Agent "${label}" completed the task.`,
        });
      }
      // Auto-stop the session after task completion. Without a websocket
      // interactive layer, the idle session can't accept follow-up input
      // and just leaks resources.
      ptyService.stopSession(sessionId).catch((err) => {
        console.warn(
          `[START_CODING_TASK] Failed to stop session for "${label}" after task complete: ${err}`,
        );
      });
    }
    if (event === "error" && callback) {
      callback({
        text: `Agent "${label}" encountered an error: ${(data as { message?: string }).message ?? "unknown error"}`,
      });
    }

    // Auto-cleanup scratch directories when the session exits
    if (
      (event === "stopped" || event === "task_complete" || event === "error") &&
      scratchDir
    ) {
      const wsService = runtime.getService(
        "CODING_WORKSPACE_SERVICE",
      ) as unknown as CodingWorkspaceService | undefined;
      if (wsService) {
        wsService.removeScratchDir(scratchDir).catch((err) => {
          console.warn(
            `[START_CODING_TASK] Failed to cleanup scratch dir for "${label}": ${err}`,
          );
        });
      }
    }
  });
}
