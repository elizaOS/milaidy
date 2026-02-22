/**
 * Core plugin package lists shared by runtime startup and the API server.
 *
 * Keeping this in a standalone module avoids a circular dependency between
 * `api/server.ts` and `runtime/eliza.ts`.
 */

/** Core plugins that should always be loaded. */
export const CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-sql", // database adapter — required
  "@elizaos/plugin-local-embedding", // local embeddings — required for memory
  "@elizaos/plugin-secrets-manager", // secrets management — load early, other plugins depend on it
  "@elizaos/plugin-form", // packaging issue
  "@elizaos/plugin-knowledge", // RAG knowledge management — required for knowledge tab
  "@elizaos/plugin-rolodex", // contact graph and relationship/social memory
  "@elizaos/plugin-trajectory-logger", // trajectory logging for debugging and RL training
  "@elizaos/plugin-agent-orchestrator", // multi-agent orchestration
  "@elizaos/plugin-cron", // scheduled jobs and automation
  "@elizaos/plugin-shell", // shell command execution
  "@elizaos/plugin-plugin-manager", // dynamic plugin management
  "@elizaos/plugin-agent-skills", // skill execution and marketplace runtime
  "@elizaos/plugin-pdf", // PDF processing
];

/**
 * Plugins that can be enabled from the admin panel.
 * Not loaded by default — kept separate due to packaging or spec issues.
 */
export const OPTIONAL_CORE_PLUGINS: readonly string[] = [
  "@elizaos/plugin-cua", // CUA computer-use agent (cloud sandbox automation)
  "@elizaos/plugin-obsidian", // Obsidian vault CLI integration
  // "@elizaos/plugin-directives", // directive processing
  // "@elizaos/plugin-commands", // slash command handling
  // "@elizaos/plugin-cli", // CLI interface
  "@elizaos/plugin-code", // code writing and file operations
  "@elizaos/plugin-repoprompt", // RepoPrompt CLI integration and workflow orchestration
  "@milaidy/plugin-claude-code-workbench", // Claude Code companion workflows for this monorepo
  // "@elizaos/plugin-edge-tts", // text-to-speech
  // "@elizaos/plugin-mcp", // MCP protocol support
  // "@elizaos/plugin-computeruse", // computer use automation
  // "@elizaos/plugin-scheduling", // packaging issue
  // "@elizaos/plugin-todo", // todo/task management
  // "@elizaos/plugin-personality", // personality coherence
  // "@elizaos/plugin-scratchpad", // scratchpad notes
  // "@elizaos/plugin-experience", // learning from interactions
  // "@elizaos/plugin-trust", // trust scoring and policy signals
];
