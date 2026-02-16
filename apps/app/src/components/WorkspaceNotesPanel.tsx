import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode, type ReactElement } from "react";

type NotesPanelMode = "edit" | "view" | "split";
type MarkdownBlockLevel = 1 | 2 | 3 | 4 | 5 | 6;

type MarkdownNode = ReactNode;

interface WorkspaceNote {
  id: string;
  title: string;
  content: string;
  createdAt: number;
  updatedAt: number;
}

interface WorkspaceNotesPanelProps {
  open: boolean;
  mode: NotesPanelMode;
  seedText?: string;
  onClose: () => void;
  onCreateActionFromNote: (noteContent: string, noteTitle?: string) => void;
  onCreateSkillFromNote: (noteContent: string, noteTitle?: string) => Promise<void>;
}

const STORAGE_KEY = "milaidy:workspace-notes";
const FALLBACK_NOTE_TITLE = "Untitled Note";
const STATUS_TTL_MS = 1400;
const NOTE_TEMPLATES: Array<{ key: string; label: string; template: string }> = [
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

const NOTE_TOOLBAR = [
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
];

const normalizeText = (value: string): string =>
  value.replace(/\r\n/g, "\n");

const toStoredNotes = (notes: WorkspaceNote[]): string => {
  try {
    return JSON.stringify(notes);
  } catch {
    return "[]";
  }
};

const fromStoredNotes = (raw: string | null): WorkspaceNote[] => {
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

const timestampId = () => `note-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const toSafeFilename = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-_\s]/gi, "")
    .replace(/\s+/g, "-")
    .slice(0, 64) || "note";

const sanitizeNoteTitle = (title: string): string => {
  const trimmed = title.trim();
  return trimmed.length === 0 ? FALLBACK_NOTE_TITLE : trimmed.slice(0, 120);
};

function processSimpleInline(text: string, key: number): ReactElement {
  return <span key={key}>{text}</span>;
}

function processInlineMarkdown(text: string): MarkdownNode {
  const parts: MarkdownNode[] = [];
  let remaining = text;
  let key = 0;

  while (remaining) {
    const linkMatch = remaining.match(/\[([^\]]+)\]\(([^)]+)\)/);
    if (linkMatch) {
      const before = remaining.substring(0, linkMatch.index);
      if (before) {
        parts.push(processSimpleInline(before, key++));
      }
      parts.push(
        <a
          key={key++}
          href={linkMatch[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-accent underline"
        >
          {linkMatch[1]}
        </a>,
      );
      remaining = remaining.substring((linkMatch.index ?? 0) + linkMatch[0].length);
      continue;
    }

    const codeMatch = remaining.match(/`([^`]+)`/);
    if (codeMatch) {
      const before = remaining.substring(0, codeMatch.index);
      if (before) parts.push(processSimpleInline(before, key++));
      parts.push(
        <code
          key={key++}
          className="bg-surface px-1 py-0.5 rounded text-[12px] font-mono"
        >
          {codeMatch[1]}
        </code>,
      );
      remaining = remaining.substring((codeMatch.index ?? 0) + codeMatch[0].length);
      continue;
    }

    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);
    if (boldMatch) {
      const before = remaining.substring(0, boldMatch.index);
      if (before) parts.push(processSimpleInline(before, key++));
      parts.push(<strong key={key++}>{boldMatch[1]}</strong>);
      remaining = remaining.substring((boldMatch.index ?? 0) + boldMatch[0].length);
      continue;
    }

    const italicMatch = remaining.match(/(^|[^\\])(\*|_)([^*_]+)\2/);
    if (italicMatch) {
      const before = remaining.substring(0, italicMatch.index! + (italicMatch[1] ? 1 : 0));
      if (before) parts.push(processSimpleInline(before, key++));
      parts.push(<em key={key++}>{italicMatch[3]}</em>);
      remaining = remaining.substring((italicMatch.index ?? 0) + italicMatch[0].length);
      continue;
    }

    parts.push(remaining);
    break;
  }

  return <>{parts}</>;
}

const HEADING_CLASSNAMES: Record<MarkdownBlockLevel, string> = {
  1: "text-lg",
  2: "text-base",
  3: "text-sm",
  4: "text-sm",
  5: "text-xs",
  6: "text-[11px]",
};

function renderMarkdown(text: string): ReactNode {
  const normalized = normalizeText(text).trim();
  if (!normalized) {
    return <span className="text-muted">No content yet. Switch to Edit to add markdown notes.</span>;
  }

  const splitMarkdownBlocks = (raw: string): string[] => {
    const lines = raw.split("\n");
    const chunks: string[] = [];
    const current: string[] = [];
    let inCodeBlock = false;

    const flush = (): void => {
      const next = current.join("\n").trim();
      if (!next) return;
      chunks.push(next);
      current.length = 0;
    };

    for (const line of lines) {
      const trimmed = line.trim();
      const isCodeFence = trimmed.startsWith("```");

      if (isCodeFence) {
        current.push(line);
        inCodeBlock = !inCodeBlock;
        continue;
      }

      if (inCodeBlock) {
        current.push(line);
        continue;
      }

      if (!trimmed) {
        flush();
        continue;
      }

      if (/^(#{1,6})\s+.+$/.test(trimmed)) {
        flush();
        current.push(line);
        flush();
        continue;
      }

      current.push(line);
    }

    flush();
    return chunks;
  };

  const blocks = splitMarkdownBlocks(normalized);
  const elements: ReactNode[] = [];

  blocks.forEach((block, blockIdx) => {
    const blockText = block.trim();
    if (!blockText) return;

    if (/^```/.test(blockText)) {
      const lines = blockText.split("\n");
      const code = lines.slice(1, Math.max(lines.length - 1, 1)).join("\n");
      elements.push(
        <pre
          key={blockIdx}
          className="bg-surface px-3 py-2 rounded-sm overflow-x-auto my-2"
        >
          <code className="font-mono text-[12px] whitespace-pre-wrap">{code}</code>
        </pre>,
      );
      return;
    }

    const headingMatch = blockText.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(6, Math.max(1, headingMatch[1].length)) as MarkdownBlockLevel;
      const textContent = processInlineMarkdown(headingMatch[2].trim());
      const Heading = `h${level}` as const;
      elements.push(
        <Heading key={blockIdx} className={`${HEADING_CLASSNAMES[level]} font-bold mt-2 mb-1`}>
          {textContent}
        </Heading>,
      );
      return;
    }

    if (/^(\d+)\.\s/.test(blockText) && /\n\d+\.\s/.test(blockText)) {
      const lines = blockText
        .split("\n")
        .filter((line) => /^\d+\.\s/.test(line));
      elements.push(
        <ol key={blockIdx} className="list-decimal pl-4 my-2 space-y-1">
          {lines.map((line, lineIdx) => (
            <li key={lineIdx}>{processInlineMarkdown(line.replace(/^\d+\.\s/, ""))}</li>
          ))}
        </ol>,
      );
      return;
    }

    if (/^>\s/.test(blockText) || /^>\s/.test(blockText.split("\n")[0])) {
      const lines = blockText
        .split("\n")
        .map((line) => line.replace(/^>\s?/, ""))
        .join("\n");
      elements.push(
        <blockquote key={blockIdx} className="border-l-2 border-border pl-3 text-muted my-2">
          {processInlineMarkdown(lines)}
        </blockquote>,
      );
      return;
    }

    if (/^[-*]\s\[[ xX]\]\s/.test(blockText)) {
      const items = blockText
        .split("\n")
        .filter((line) => /^[-*]\s\[[ xX]\]\s/.test(line))
        .map((line) => {
          const [, checked, text] = line.match(/^[-*]\s\[(x|X| )\]\s(.*)$/) ?? [];
          return { checked: checked?.toLowerCase() === "x", text: text ?? "" };
        });
      elements.push(
        <ul key={blockIdx} className="list-none pl-4 my-2 space-y-1">
          {items.map((item, idx) => (
            <li key={idx}>
              <span className={`mr-2 ${item.checked ? "text-ok" : "text-muted"}`}>{item.checked ? "☑" : "☐"}</span>
              {processInlineMarkdown(item.text)}
            </li>
          ))}
        </ul>,
      );
      return;
    }

    if (/^[-*]\s/.test(blockText)) {
      const items = blockText
        .split("\n")
        .filter((line) => /^[-*]\s/.test(line))
        .map((line) => line.replace(/^[-*]\s/, ""));
      elements.push(
        <ul key={blockIdx} className="list-disc pl-4 my-2 space-y-1">
          {items.map((item, idx) => (
            <li key={idx}>{processInlineMarkdown(item)}</li>
          ))}
        </ul>,
      );
      return;
    }

    elements.push(
      <p key={blockIdx} className="my-2 leading-6">
        {processInlineMarkdown(blockText)}
      </p>,
    );
  });

  return <div className="space-y-1">{elements}</div>;
}

function parseTimestamp(ts: number): string {
  return new Date(ts).toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const getWordCount = (value: string): number => {
  const trimmed = value.trim();
  return trimmed ? trimmed.split(/\s+/).length : 0;
};

export function WorkspaceNotesPanel({
  open,
  mode,
  seedText,
  onClose,
  onCreateActionFromNote,
  onCreateSkillFromNote,
}: WorkspaceNotesPanelProps) {
  const [panelMode, setPanelMode] = useState<NotesPanelMode>(mode);
  const [notes, setNotes] = useState<WorkspaceNote[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [search, setSearch] = useState("");
  const [actionBusy, setActionBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [initializingSeed, setInitializingSeed] = useState("");

  const editorRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const importNotesInputRef = useRef<HTMLInputElement>(null);
  const statusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const appliedSeedRef = useRef("");

  const sortedNotes = useMemo(() => {
    const clone = [...notes];
    return clone.sort((a, b) => b.updatedAt - a.updatedAt);
  }, [notes]);

  const filteredNotes = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return sortedNotes;
    return sortedNotes.filter((note) =>
      note.title.toLowerCase().includes(query) ||
      note.content.toLowerCase().includes(query),
    );
  }, [search, sortedNotes]);

  const activeNote = useMemo(
    () => sortedNotes.find((note) => note.id === activeNoteId) ?? sortedNotes[0],
    [activeNoteId, sortedNotes],
  );

  const noteWordCount = useMemo(() => getWordCount(content), [content]);
  const noteCharCount = content.length;

  const setTransientStatus = useCallback((value: string) => {
    if (statusTimeoutRef.current) {
      clearTimeout(statusTimeoutRef.current);
    }
    setStatus(value);
    statusTimeoutRef.current = setTimeout(() => {
      setStatus("");
      statusTimeoutRef.current = null;
    }, STATUS_TTL_MS);
  }, []);

  const persistNotes = useCallback((nextNotes: WorkspaceNote[]) => {
    const filtered = nextNotes.filter((note) => note.id);
    setNotes(filtered);
    try {
      localStorage.setItem(STORAGE_KEY, toStoredNotes(filtered));
    } catch {
      /* ignore storage errors */
    }
  }, []);

  const createBlankNote = useCallback(
    (seed: string, titleOverride?: string): WorkspaceNote => {
      const now = Date.now();
      const seedTrimmed = seed.trim();
      const seedLines = seedTrimmed.split("\n").map((line) => line.trim()).filter(Boolean);
      const baseTitle = titleOverride ?? (seedLines[0] ?? FALLBACK_NOTE_TITLE);
      return {
        id: timestampId(),
        title: sanitizeNoteTitle(baseTitle),
        content: seedTrimmed,
        createdAt: now,
        updatedAt: now,
      };
    },
    [],
  );

  const loadNotes = useCallback(() => {
    const loaded = fromStoredNotes(localStorage.getItem(STORAGE_KEY));
    const next = loaded.length > 0 ? loaded : [createBlankNote("")];
    const restoredActive = next[0];
    persistNotes(next);
    setActiveNoteId(restoredActive.id);
    setTitle(restoredActive.title);
    setContent(restoredActive.content);
    setSearch("");
    setInitializingSeed("");
  }, [createBlankNote, persistNotes]);

  const saveActiveNote = useCallback(() => {
    if (!activeNote) return;

    const nextContent = normalizeText(content);
    const nextTitle = sanitizeNoteTitle(title);
    const idx = notes.findIndex((note) => note.id === activeNote.id);
    if (idx < 0) return;

    const nextNotes = [...notes];
    nextNotes[idx] = {
      ...nextNotes[idx],
      title: nextTitle,
      content: nextContent,
      updatedAt: Date.now(),
    };
    persistNotes(nextNotes);
    setTransientStatus("Saved");
  }, [activeNote, content, notes, persistNotes, setTransientStatus, title]);

  const createSeededNote = useCallback(
    (seed = "") => {
      const trimmed = normalizeText(seed).trim();
      if (!trimmed) return;
      if (appliedSeedRef.current === trimmed) return;
      appliedSeedRef.current = trimmed;

      const nextNotes = [createBlankNote(trimmed), ...notes];
      persistNotes(nextNotes);
      const created = nextNotes[0];
      setActiveNoteId(created.id);
      setTitle(created.title);
      setContent(created.content);
      setPanelMode("edit");
      setTransientStatus("New note from source");
      setTimeout(() => {
        editorRef.current?.focus();
      }, 0);
    },
    [createBlankNote, notes, persistNotes, setTransientStatus],
  );

  const handleTitleChange = useCallback((value: string) => {
    setTitle(value);
    setTransientStatus("Unsaved");
  }, [setTransientStatus]);

  const handleContentChange = useCallback((value: string) => {
    setContent(normalizeText(value));
    setTransientStatus("Unsaved");
  }, [setTransientStatus]);

  const handleSelectionInsert = useCallback((prefix: string, suffix = prefix) => {
    const el = editorRef.current;
    if (!el) return;

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = content.slice(start, end);
    const insertBefore = selected || "";
    const replacement = `${prefix}${insertBefore}${suffix}`;

    const next = `${content.slice(0, start)}${replacement}${content.slice(end)}`;
    handleContentChange(next);

    requestAnimationFrame(() => {
      el.focus();
      if (selected) {
        el.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
      } else {
        el.setSelectionRange(start + prefix.length, start + prefix.length);
      }
    });
  }, [content, handleContentChange]);

  const insertAtCursor = useCallback((text: string) => {
    const el = editorRef.current;
    if (!el) {
      setContent((current) => `${current}${current.endsWith("\n") ? "" : "\n\n"}${text}`);
      return;
    }

    const start = el.selectionStart;
    const end = el.selectionEnd;
    const next = `${content.slice(0, start)}${text}${content.slice(end)}`;
    setContent(normalizeText(next));
    setTransientStatus("Template inserted");

    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + text.length;
      el.setSelectionRange(cursor, cursor);
    });
  }, [content, setTransientStatus]);

  const prependLine = useCallback((token: string) => {
    const el = editorRef.current;
    if (!el) return;
    const start = content.lastIndexOf("\n", el.selectionStart - 1) + 1;
    const end = content.indexOf("\n", el.selectionStart);
    const lineEnd = end === -1 ? content.length : end;
    const line = content.slice(start, lineEnd);
    const already = line.startsWith(token);
    const nextLine = already ? line.slice(token.length) : `${token}${line}`;
    const next = `${content.slice(0, start)}${nextLine}${content.slice(lineEnd)}`;
    handleContentChange(next);

    requestAnimationFrame(() => {
      el.focus();
      const cursor = start + nextLine.length;
      el.setSelectionRange(cursor, cursor);
    });
  }, [content, handleContentChange]);

  const insertCodeBlock = useCallback(() => {
    handleSelectionInsert("```\n", "\n```");
    requestAnimationFrame(() => {
      const el = editorRef.current;
      if (!el) return;
      const start = el.selectionStart;
      el.setSelectionRange(start - 4, start - 4);
    });
  }, [handleSelectionInsert]);

  const insertTemplate = useCallback((template: string) => {
    const normalizedTemplate = normalizeText(template).trim();
    if (!normalizedTemplate) return;

    insertAtCursor(`\n${normalizedTemplate}\n`);
  }, [insertAtCursor]);

  const createHeader = useCallback((level: number) => {
    const headingLevel = Math.max(1, Math.min(6, level));
    handleSelectionInsert(`${"#".repeat(headingLevel)} `, "");
  }, [handleSelectionInsert]);

  const applyToolbarAction = useCallback((action: string) => {
    if (!activeNote) return;

    if (action === "header-1") {
      createHeader(1);
    } else if (action === "header-2") {
      createHeader(2);
    } else if (action === "header-3") {
      createHeader(3);
    } else if (action === "bold") {
      handleSelectionInsert("**", "**");
    } else if (action === "italic") {
      handleSelectionInsert("_", "_");
    } else if (action === "code") {
      handleSelectionInsert("`", "`");
    } else if (action === "quote") {
      prependLine("> ");
    } else if (action === "bullet") {
      prependLine("- ");
    } else if (action === "number") {
      prependLine("1. ");
    } else if (action === "task") {
      prependLine("- [ ] ");
    } else if (action === "hr") {
      insertAtCursor("\n\n---\n\n");
    } else if (action === "codeblock") {
      insertCodeBlock();
    }
  }, [
    activeNote,
    createHeader,
    handleSelectionInsert,
    prependLine,
    insertAtCursor,
    insertCodeBlock,
  ]);

  const createLink = useCallback(() => {
    const url = window.prompt("Paste link URL", "https://");
    if (!url) return;
    handleSelectionInsert("[", `](${url})`);
  }, [handleSelectionInsert]);

  const openImportNotes = useCallback(() => {
    if (importNotesInputRef.current) importNotesInputRef.current.click();
  }, []);

  const openImportMarkdown = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.click();
  }, []);

  const handleImportMarkdownFile = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const raw = normalizeText(await file.text());
        const basename = file.name.replace(/\.md$|\.markdown$|\.txt$/i, "");
        const nextNotes = [
          {
            ...createBlankNote(raw, basename || FALLBACK_NOTE_TITLE),
            content: raw,
          },
          ...notes,
        ];
        persistNotes(nextNotes);
        const created = nextNotes[0];
        setActiveNoteId(created.id);
        setTitle(created.title);
        setContent(created.content);
        setPanelMode("edit");
        setTransientStatus(`Imported ${file.name}`);
      } catch {
        setTransientStatus("Import failed");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [createBlankNote, notes, persistNotes, setTransientStatus],
  );

  const handleImportNotesBundle = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) return;

      try {
        const parsed = await file.text();
        const bundle = fromStoredNotes(parsed);
        if (bundle.length === 0) {
          setTransientStatus("No notes found in file");
          return;
        }
        const nextNotes = [...bundle.map((note) => ({ ...note, updatedAt: Date.now(), id: note.id || timestampId() })), ...notes];
        persistNotes(nextNotes);
        const created = nextNotes[0];
        setActiveNoteId(created.id);
        setTitle(created.title);
        setContent(created.content);
        setPanelMode("edit");
        setTransientStatus(`Imported ${bundle.length} notes`);
      } catch {
        setTransientStatus("Invalid notes bundle");
      } finally {
        if (importNotesInputRef.current) importNotesInputRef.current.value = "";
      }
    },
    [notes, persistNotes, setTransientStatus],
  );

  const exportMarkdown = useCallback(() => {
    if (!activeNote) return;
    const blob = new Blob([activeNote.content || ""], {
      type: "text/markdown;charset=utf-8",
    });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = `${toSafeFilename(activeNote.title)}.md`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(anchor.href);
  }, [activeNote]);

  const exportWorkspaceNotes = useCallback(() => {
    const blob = new Blob([toStoredNotes(notes)], { type: "application/json;charset=utf-8" });
    const anchor = document.createElement("a");
    anchor.href = URL.createObjectURL(blob);
    anchor.download = "milaidy-notes-bundle.json";
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(anchor.href);
  }, [notes]);

  const handleSelect = useCallback(
    (noteId: string) => {
      const note = notes.find((entry) => entry.id === noteId);
      if (!note) return;
      setActiveNoteId(note.id);
      setTitle(note.title);
      setContent(note.content);
    },
    [notes],
  );

  const createNewNote = useCallback(() => {
    const note = createBlankNote("");
    const nextNotes = [note, ...notes];
    persistNotes(nextNotes);
    setActiveNoteId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setPanelMode("edit");
    setTransientStatus("New note created");
    requestAnimationFrame(() => editorRef.current?.focus());
  }, [createBlankNote, notes, persistNotes, setTransientStatus]);

  const deleteActiveNote = useCallback(() => {
    if (!activeNote) return;
    const confirmed = window.confirm(`Delete "${activeNote.title}"?`);
    if (!confirmed) return;

    const nextNotes = notes.filter((note) => note.id !== activeNote.id);
    const fallback = nextNotes[0] ?? createBlankNote("");
    const next = nextNotes.length > 0 ? nextNotes : [fallback];
    persistNotes(next);
    const nextActive = next[0];
    setActiveNoteId(nextActive.id);
    setTitle(nextActive.title);
    setContent(nextActive.content);
    setTransientStatus("Deleted");
  }, [activeNote, createBlankNote, notes, persistNotes, setTransientStatus]);

  const handleCreateActionFromNotes = useCallback(() => {
    if (!content.trim()) return;
    onCreateActionFromNote(content, title);
    setTransientStatus("Seeded custom action editor");
  }, [content, onCreateActionFromNote, setTransientStatus]);

  const handleCreateSkillFromNotes = useCallback(async () => {
    if (!content.trim()) return;
    setActionBusy(true);
    try {
      await onCreateSkillFromNote(content, title);
    } finally {
      setActionBusy(false);
    }
  }, [content, onCreateSkillFromNote]);

  useEffect(() => {
    if (!open) return;
    loadNotes();
    setPanelMode(mode);
    setInitializingSeed(seedText?.trim() ?? "");
  }, [open, loadNotes, mode, seedText]);

  useEffect(() => {
    if (!open) return;
    if (!initializingSeed) return;
    createSeededNote(initializingSeed);
    setInitializingSeed("");
  }, [createSeededNote, initializingSeed, open]);

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current) {
        clearTimeout(statusTimeoutRef.current);
      }
    };
  }, []);

  if (!open) return null;

  return (
    <div className="border-l border-border bg-card flex flex-col w-[440px] max-h-full overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-2 shrink-0">
        <h2 className="text-sm font-semibold text-txt">Workspace Notes</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={createNewNote}
            className="text-xs border border-border px-2 py-1 hover:border-accent hover:text-accent cursor-pointer"
            title="Create a fresh note"
          >
            New
          </button>
          <button
            onClick={onClose}
            className="text-muted hover:text-txt transition-colors text-sm leading-none"
            aria-label="Close notes panel"
          >
            ×
          </button>
        </div>
      </div>

      <div className="border-b border-border px-4 py-2 text-xs text-muted flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          <span>Mode:</span>
          <span className="text-txt">
            {panelMode === "edit" ? "Edit" : panelMode === "split" ? "Split" : "Preview"}
          </span>
        </span>
        <span className="text-[11px] text-muted">
          {noteWordCount.toLocaleString()} words · {noteCharCount.toLocaleString()} chars
        </span>
        <span className="text-accent truncate max-w-[180px]" title={status || ""}>{status || ""}</span>
        <div className="shrink-0 flex items-center gap-2">
          {(["edit", "split", "view"] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setPanelMode(mode)}
              className={`text-xs border px-2 py-1 transition-colors ${
                panelMode === mode
                  ? "border-accent text-accent"
                  : "border-border hover:border-accent hover:text-accent"
              }`}
            >
              {mode === "edit" ? "Edit" : mode === "split" ? "Split" : "Preview"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-44 border-r border-border bg-surface/40 flex flex-col min-h-0">
          <div className="px-2 py-2 text-[11px] uppercase tracking-wide text-muted">Notes</div>
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search"
            className="mx-2 mb-2 border border-border px-2 py-1 text-xs bg-card text-txt"
          />
          <div className="overflow-y-auto flex-1 px-1">
            {filteredNotes.map((note) => (
              <button
                key={note.id}
                onClick={() => handleSelect(note.id)}
                className={`w-full text-left px-2 py-2 border border-border mb-1 rounded-sm transition-colors ${
                  activeNote?.id === note.id ? "bg-bg-hover text-accent" : "hover:bg-surface"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-medium text-txt-strong truncate">{note.title}</span>
                  <span className="text-[10px] text-muted">{parseTimestamp(note.updatedAt)}</span>
                </div>
                <div className="text-[10px] text-muted truncate mt-1">
                  {note.content.trim() ? `${note.content.split("\n")[0].slice(0, 80)}...` : "(empty)"}
                </div>
              </button>
            ))}
          </div>
          <div className="px-2 py-2 text-[10px] text-muted border-t border-border">
            {notes.length} note{notes.length === 1 ? "" : "s"}
          </div>
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <div className="p-3 border-b border-border">
            <label className="text-xs text-muted block mb-1">Title</label>
            <input
              type="text"
              value={title}
              onChange={(event) => handleTitleChange(event.target.value)}
              className="w-full bg-surface border border-border px-2 py-1 text-sm text-txt outline-none focus:border-accent"
              disabled={panelMode === "view"}
            />
          </div>

          <div className="px-3 py-2 border-b border-border flex flex-wrap gap-1">
            {NOTE_TOOLBAR.map((tool) => (
              <button
                key={tool.action}
                onClick={() => applyToolbarAction(tool.action)}
                className="text-[11px] border border-border px-2 py-1 hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={panelMode === "view"}
              >
                {tool.label}
              </button>
            ))}
            <button
              onClick={createLink}
              className="text-[11px] border border-border px-2 py-1 hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed"
              title="Insert markdown link"
              disabled={panelMode === "view"}
            >
              Link Prompt
            </button>
            <button
              onClick={() => insertAtCursor("[text](url)")}
              className="text-[11px] border border-border px-2 py-1 hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed"
              title="Insert link template"
              disabled={panelMode === "view"}
            >
              Link Mark
            </button>
            <button
              onClick={() => insertAtCursor("**TODO** ")}
              className="text-[11px] border border-border px-2 py-1 hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed"
              title="Insert TODO marker"
              disabled={panelMode === "view"}
            >
              TODO
            </button>
          </div>

          <div className="px-3 py-2 border-b border-border flex items-center gap-1 text-xs text-muted">
            {NOTE_TEMPLATES.map((template) => (
              <button
                key={template.key}
                onClick={() => insertTemplate(template.template)}
                className="border border-border px-2 py-1 hover:border-accent hover:text-accent disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={panelMode === "view"}
                title="Insert note template"
              >
                + {template.label}
              </button>
            ))}
          </div>

          {panelMode === "view" ? (
            <div className="flex-1 px-3 py-3 overflow-y-auto text-sm text-txt leading-6 bg-surface">
              {renderMarkdown(content)}
            </div>
          ) : panelMode === "split" ? (
            <div className="flex-1 min-h-0 flex">
              <textarea
                ref={editorRef}
                value={content}
                onChange={(event) => handleContentChange(event.target.value)}
                className="w-1/2 p-3 bg-surface border-0 border-r border-border outline-none resize-none text-sm text-txt font-mono"
                placeholder="Capture workspace notes, action ideas, skill specs..."
              />
              <div className="w-1/2 overflow-y-auto text-sm text-txt leading-6 px-3 py-3 bg-surface">
                {renderMarkdown(content)}
              </div>
            </div>
          ) : (
            <textarea
              ref={editorRef}
              value={content}
              onChange={(event) => handleContentChange(event.target.value)}
              className="flex-1 w-full p-3 bg-surface border-0 outline-none resize-none text-sm text-txt font-mono"
              placeholder="Capture workspace notes, action ideas, skill specs..."
            />
          )}

          <div className="border-t border-border px-3 py-2 flex flex-wrap gap-2">
            <button
              onClick={saveActiveNote}
              className="text-xs border border-accent bg-accent text-white px-2 py-1 cursor-pointer"
            >
              Save
            </button>
            <button
              onClick={handleCreateActionFromNotes}
              className="text-xs border border-border px-2 py-1 hover:border-accent hover:text-accent"
              disabled={!content.trim()}
            >
              Create Custom Action Prompt
            </button>
            <button
              onClick={() => void handleCreateSkillFromNotes()}
              className="text-xs border border-border px-2 py-1 hover:border-accent hover:text-accent"
              disabled={!content.trim() || actionBusy}
            >
              {actionBusy ? "Creating Skill..." : "Create Skill"}
            </button>
            <button
              onClick={exportMarkdown}
              className="text-xs border border-border px-2 py-1 hover:border-accent hover:text-accent"
            >
              Export .md
            </button>
            <button
              onClick={exportWorkspaceNotes}
              className="text-xs border border-border px-2 py-1 hover:border-accent hover:text-accent"
            >
              Export Bundle
            </button>
            <button
              onClick={openImportMarkdown}
              className="text-xs border border-border px-2 py-1 hover:border-accent hover:text-accent"
            >
              Import .md
            </button>
            <button
              onClick={openImportNotes}
              className="text-xs border border-border px-2 py-1 hover:border-accent hover:text-accent"
            >
              Import Bundle
            </button>
            <button
              onClick={deleteActiveNote}
              className="text-xs border border-danger text-danger hover:text-danger/80 px-2 py-1"
            >
              Delete
            </button>
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept=".md,.markdown,.txt"
        onChange={handleImportMarkdownFile}
        className="hidden"
      />
      <input
        ref={importNotesInputRef}
        type="file"
        accept="application/json"
        onChange={handleImportNotesBundle}
        className="hidden"
      />
    </div>
  );
}
