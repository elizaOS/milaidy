export const CUSTOM_COMMANDS_STORAGE_KEY = "milady:custom-commands";

export interface SavedCustomCommand {
  name: string;
  text: string;
  createdAt: number;
}

function isSavedCustomCommand(value: unknown): value is SavedCustomCommand {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.name === "string" &&
    typeof candidate.text === "string" &&
    typeof candidate.createdAt === "number"
  );
}

export function loadSavedCustomCommands(): SavedCustomCommand[] {
  try {
    const raw = localStorage.getItem(CUSTOM_COMMANDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isSavedCustomCommand);
  } catch {
    return [];
  }
}

export function saveSavedCustomCommands(commands: SavedCustomCommand[]): void {
  localStorage.setItem(CUSTOM_COMMANDS_STORAGE_KEY, JSON.stringify(commands));
}

export function appendSavedCustomCommand(command: SavedCustomCommand): void {
  const existing = loadSavedCustomCommands();
  existing.push(command);
  saveSavedCustomCommands(existing);
}

export function normalizeSlashCommandName(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const withoutSlash = trimmed.startsWith("/") ? trimmed.slice(1) : trimmed;
  return withoutSlash.trim().toLowerCase();
}

export function expandSavedCustomCommand(
  template: string,
  argsRaw: string,
): string {
  const args = argsRaw.trim();
  if (!args) {
    return template;
  }
  if (template.includes("{{args}}")) {
    return template.replaceAll("{{args}}", args);
  }
  return `${template}\n${args}`;
}

export function splitCommandArgs(raw: string): string[] {
  const tokens: string[] = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let match: RegExpExecArray | null = re.exec(raw);
  while (match) {
    tokens.push(match[1] ?? match[2] ?? match[3] ?? "");
    match = re.exec(raw);
  }
  return tokens;
}
