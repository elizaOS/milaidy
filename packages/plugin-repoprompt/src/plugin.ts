import type { Plugin } from "@elizaos/core";
import { logger } from "@elizaos/core";
import { z } from "zod";
import { repoPromptRunAction } from "./actions/run.ts";
import { loadRepoPromptConfig } from "./config.ts";
import { repoPromptStatusProvider } from "./providers/status.ts";
import { repoPromptRoutes } from "./routes.ts";
import { RepoPromptService } from "./services/repoprompt-service.ts";

export const repopromptPlugin: Plugin = {
  name: "repoprompt",
  description:
    "RepoPrompt CLI integration for ElizaOS. Provides a service, action, provider, and routes for executing RepoPrompt commands safely.",

  get config() {
    return {
      REPOPROMPT_CLI_PATH: process.env.REPOPROMPT_CLI_PATH ?? null,
      REPOPROMPT_DEFAULT_WINDOW: process.env.REPOPROMPT_DEFAULT_WINDOW ?? null,
      REPOPROMPT_DEFAULT_TAB: process.env.REPOPROMPT_DEFAULT_TAB ?? null,
      REPOPROMPT_TIMEOUT_MS: process.env.REPOPROMPT_TIMEOUT_MS ?? null,
      REPOPROMPT_MAX_OUTPUT_CHARS:
        process.env.REPOPROMPT_MAX_OUTPUT_CHARS ?? null,
      REPOPROMPT_MAX_STDIN_BYTES:
        process.env.REPOPROMPT_MAX_STDIN_BYTES ?? null,
      REPOPROMPT_WORKSPACE_ROOT: process.env.REPOPROMPT_WORKSPACE_ROOT ?? null,
      REPOPROMPT_ALLOWED_COMMANDS:
        process.env.REPOPROMPT_ALLOWED_COMMANDS ?? null,
    };
  },

  async init(config: Record<string, string>) {
    logger.info("RepoPrompt: initializing plugin");

    try {
      const normalized = loadRepoPromptConfig(config);

      for (const [key, value] of Object.entries(config)) {
        if (!key.startsWith("REPOPROMPT_")) {
          continue;
        }

        if (value) {
          process.env[key] = value;
        }
      }

      logger.info(
        `RepoPrompt: plugin initialized (cli=${normalized.cliPath}, timeout=${normalized.timeoutMs}ms)`,
      );
    } catch (error) {
      if (error instanceof z.ZodError) {
        const issues =
          error.issues?.map((issue) => issue.message).join(", ") ||
          "Unknown validation error";
        throw new Error(`RepoPrompt plugin configuration error: ${issues}`);
      }

      throw new Error(
        `RepoPrompt plugin initialization failed: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  },

  services: [RepoPromptService],
  actions: [repoPromptRunAction],
  providers: [repoPromptStatusProvider],
  routes: repoPromptRoutes,
};

export default repopromptPlugin;
