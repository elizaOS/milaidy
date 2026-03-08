export type QuickActionId =
  | "restart-open-logs"
  | "open-active-game"
  | "mute-voice-pause-agent";

export interface QuickActionDefinition {
  id: QuickActionId;
  label: string;
  hint: string;
  aliases: string[];
  keywords: string[];
  dataTestId: string;
}

export const QUICK_ACTION_REGISTRY: ReadonlyArray<QuickActionDefinition> = [
  {
    id: "restart-open-logs",
    label: "Restart + open logs",
    hint: "Restart the agent and switch to logs",
    aliases: ["restart logs", "open logs after restart"],
    keywords: ["reboot", "diagnostics", "errors", "debug"],
    dataTestId: "quick-action-restart-open-logs",
  },
  {
    id: "open-active-game",
    label: "Open active game",
    hint: "Jump to the current active game viewer",
    aliases: ["resume game", "current game"],
    keywords: ["apps", "viewer", "overlay", "game"],
    dataTestId: "quick-action-open-active-game",
  },
  {
    id: "mute-voice-pause-agent",
    label: "Mute voice + pause agent",
    hint: "Silence playback and pause the agent if it is running",
    aliases: ["quiet mode", "pause and mute"],
    keywords: ["voice", "audio", "pause", "silence"],
    dataTestId: "quick-action-mute-voice-pause-agent",
  },
] as const;
