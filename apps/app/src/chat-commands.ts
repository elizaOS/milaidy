/**
 * Re-export from @milady/app-core/chat.
 * @deprecated Import directly from "@milady/app-core/chat" instead.
 */
export {
  appendSavedCustomCommand,
  CUSTOM_COMMANDS_STORAGE_KEY,
  expandSavedCustomCommand,
  loadSavedCustomCommands,
  normalizeSlashCommandName,
  type SavedCustomCommand,
  saveSavedCustomCommands,
  splitCommandArgs,
} from "@milady/app-core/chat";
