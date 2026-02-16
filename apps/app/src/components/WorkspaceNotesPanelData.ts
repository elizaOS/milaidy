export const STORAGE_KEY = "milaidy:workspace-notes";
export const FALLBACK_NOTE_TITLE = "Untitled Note";
export const STATUS_TTL_MS = 1400;

export type NotesPanelMode = "edit" | "view" | "split";

export interface WorkspaceNote {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface WorkspaceNotesPanelProps {
  open: boolean;
  mode: NotesPanelMode;
  seedText?: string;
  onClose: () => void;
  onCreateActionFromNote: (noteContent: string, noteTitle?: string) => void;
  onCreateSkillFromNote: (noteContent: string, noteTitle?: string) => Promise<void>;
}

export const NOTE_TEMPLATES: Array<{ key: string; label: string; template: string }> = [
  {
    key: "skill",
    label: "Skill",
    template:
      "## Skill Intent\n- Purpose:\n- Inputs:\n- Output:\n\n## Pseudocode\n- Step 1:\n- Step 2:\n\n## Acceptance\n- [ ] Define expected behavior\n- [ ] Add validation and error conditions\n",
  },
  {
    key: "action",
    label: "Action",
    template:
      "## Problem\n\n## Proposed Action\n\n## Steps\n- [ ] Step 1\n- [ ] Step 2\n- [ ] Step 3\n\n## Success Criteria\n- [ ] measurable outcome\n",
  },
  {
    key: "runbook",
    label: "Runbook",
    template:
      "## Objective\n\n## Preconditions\n- \n\n## Runbook\n1. \n2. \n\n## Notes\n- ",
  },
];

export const NOTE_TOOLBAR = [
  { label: "H1", action: "header-1" },
  { label: "H2", action: "header-2" },
  { label: "H3", action: "header-3" },
  { label: "Bold", action: "bold" },
  { label: "Italic", action: "italic" },
  { label: "Code", action: "code" },
  { label: "Quote", action: "quote" },
  { label: "Bullet", action: "bullet" },
  { label: "Number", action: "number" },
  { label: "Task", action: "task" },
  { label: "Rule", action: "hr" },
  { label: "Block", action: "codeblock" },
] as const;

export const normalizeText = (value: string): string => value.replace(/\r\n/g, "\n");

export const toStoredNotes = (notes: WorkspaceNote[]): string => {
  try {
    return JSON.stringify(notes);
  } catch {
    return "[]";
  }
};

export const fromStoredNotes = (raw: string | null): WorkspaceNote[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((row) => row && typeof row === "object")
      .map((row) => {
        const note = row as Partial<WorkspaceNote>;
        return {
          id:
            typeof note.id === "string" && note.id.length > 0
              ? note.id
              : timestampId(),
          title:
            typeof note.title === "string" ? note.title : FALLBACK_NOTE_TITLE,
          content:
            typeof note.content === "string" ? normalizeText(note.content) : "",
          createdAt:
            typeof note.createdAt === "number" ? note.createdAt : Date.now(),
          updatedAt:
            typeof note.updatedAt === "number" ? note.updatedAt : Date.now(),
        };
      });
  } catch {
    return [];
  }
};

export const timestampId = (): string =>
  `note-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

export const toSafeFilename = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_\s]/gi, "")
    .replace(/\s+/g, "-")
    .slice(0, 64) || "note";

export const sanitizeNoteTitle = (title: string): string => {
  const trimmed = title.trim();
  return trimmed.length === 0 ? FALLBACK_NOTE_TITLE : trimmed.slice(0, 120);
};

export const parseTimestamp = (ts: number): string => {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const getWordCount = (value: string): number => {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

export const createBlankNote = (
  seed: string,
  titleOverride: string | undefined,
): WorkspaceNote => {
  const now = Date.now();
  const seedTrimmed = seed.trim();
  const seedLines = seedTrimmed
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const baseTitle = titleOverride ?? (seedLines[0] ?? FALLBACK_NOTE_TITLE);
  return {
    id: timestampId(),
    title: sanitizeNoteTitle(baseTitle),
    content: seedTrimmed,
    createdAt: now,
    updatedAt: now,
  };
};
