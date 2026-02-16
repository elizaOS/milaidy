import {
  type ChangeEvent,
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  type NotesPanelMode,
  type WorkspaceNote,
  type WorkspaceNotesPanelProps,
  createBlankNote,
  fromStoredNotes,
  getWordCount,
  NOTE_TOOLBAR,
  normalizeText,
  parseTimestamp,
  sanitizeNoteTitle,
  STORAGE_KEY,
  STATUS_TTL_MS,
  toSafeFilename,
  toStoredNotes,
  timestampId,
} from "./WorkspaceNotesPanelData";

type Params = Pick<
  WorkspaceNotesPanelProps,
  "open" | "mode" | "seedText" | "onCreateActionFromNote" | "onCreateSkillFromNote"
>;

interface UseWorkspaceNotesPanelControllerResult {
  panelMode: NotesPanelMode;
  notes: WorkspaceNote[];
  search: string;
  setSearch: (value: string) => void;
  status: string;
  actionBusy: boolean;
  title: string;
  content: string;
  noteWordCount: number;
  noteCharCount: number;
  editorRef: RefObject<HTMLTextAreaElement | null>;
  fileInputRef: RefObject<HTMLInputElement | null>;
  importNotesInputRef: RefObject<HTMLInputElement | null>;
  activeNote: WorkspaceNote | undefined;
  filteredNotes: WorkspaceNote[];
  noteCount: number;
  setPanelMode: (value: NotesPanelMode) => void;
  handleSelect: (noteId: string) => void;
  handleTitleChange: (value: string) => void;
  handleContentChange: (value: string) => void;
  handleSearch: (value: string) => void;
  saveActiveNote: () => void;
  createNewNote: () => void;
  deleteActiveNote: () => void;
  applyToolbarAction: (action: string) => void;
  createLink: () => void;
  insertAtCursor: (value: string) => void;
  openImportMarkdown: () => void;
  openImportNotes: () => void;
  handleImportMarkdownFile: (
    event: ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
  handleImportNotesBundle: (
    event: ChangeEvent<HTMLInputElement>,
  ) => Promise<void>;
  exportMarkdown: () => void;
  exportWorkspaceNotes: () => void;
  handleCreateActionFromNotes: () => void;
  handleCreateSkillFromNotes: () => Promise<void>;
  insertTemplate: (template: string) => void;
  toolbarItems: typeof NOTE_TOOLBAR;
  parseTimestamp: (value: number) => string;
}

export function useWorkspaceNotesPanelController({
  open,
  mode,
  seedText,
  onCreateActionFromNote,
  onCreateSkillFromNote,
}: Params): UseWorkspaceNotesPanelControllerResult {
  const [panelMode, setPanelModeState] = useState<NotesPanelMode>(mode);
  const [notes, setNotes] = useState<WorkspaceNote[]>([]);
  const [activeNoteId, setActiveNoteId] = useState("");
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
    return sortedNotes.filter(
      (note) =>
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
  const noteCount = notes.length;

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

  const setPanelMode = useCallback((nextPanelMode: NotesPanelMode) => {
    setPanelModeState(nextPanelMode);
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

        const nextNotes = [createBlankNote(trimmed, undefined), ...notes];
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
    [notes, persistNotes, setPanelMode, setTransientStatus],
  );

  const loadNotes = useCallback(() => {
    const loaded = fromStoredNotes(localStorage.getItem(STORAGE_KEY));
    const next = loaded.length > 0 ? loaded : [createBlankNote("", undefined)];
    const restoredActive = next[0];
    persistNotes(next);
    setActiveNoteId(restoredActive.id);
    setTitle(restoredActive.title);
    setContent(restoredActive.content);
    setSearch("");
    setInitializingSeed("");
  }, [persistNotes]);

  const handleTitleChange = useCallback(
    (value: string) => {
      setTitle(value);
      setTransientStatus("Unsaved");
    },
    [setTransientStatus],
  );

  const handleContentChange = useCallback(
    (value: string) => {
      setContent(normalizeText(value));
      setTransientStatus("Unsaved");
    },
    [setTransientStatus],
  );

  const handleSearch = useCallback((value: string) => {
    setSearch(value);
  }, []);

  const handleSelectionInsert = useCallback(
    (prefix: string, suffix = prefix) => {
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
          el.setSelectionRange(
            start + prefix.length,
            start + prefix.length + selected.length,
          );
        } else {
          el.setSelectionRange(start + prefix.length, start + prefix.length);
        }
      });
    },
    [content, handleContentChange],
  );

  const insertAtCursor = useCallback(
    (text: string) => {
      const el = editorRef.current;
      if (!el) {
        setContent((current) =>
          `${current}${current.endsWith("\n") ? "" : "\n\n"}${text}`,
        );
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
    },
    [content, setTransientStatus],
  );

  const prependLine = useCallback(
    (token: string) => {
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
    },
    [content, handleContentChange],
  );

  const insertCodeBlock = useCallback(() => {
    handleSelectionInsert("```\n", "\n```");
    requestAnimationFrame(() => {
      const el = editorRef.current;
      if (!el) return;
      const start = el.selectionStart;
      el.setSelectionRange(start - 4, start - 4);
    });
  }, [handleSelectionInsert]);

  const createHeader = useCallback(
    (level: number) => {
      const headingLevel = Math.max(1, Math.min(6, level));
      handleSelectionInsert(`${"#".repeat(headingLevel)} `, "");
    },
    [handleSelectionInsert],
  );

  const applyToolbarAction = useCallback(
    (action: string) => {
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
    },
    [
      activeNote,
      createHeader,
      handleSelectionInsert,
      prependLine,
      insertAtCursor,
      insertCodeBlock,
    ],
  );

  const insertTemplate = useCallback(
    (template: string) => {
      const normalizedTemplate = normalizeText(template).trim();
      if (!normalizedTemplate) return;

      insertAtCursor(`\n${normalizedTemplate}\n`);
    },
    [insertAtCursor],
  );

  const createLink = useCallback(() => {
    const url = window.prompt("Paste link URL", "https://");
    if (!url) return;
    handleSelectionInsert("[", `](${url})`);
  }, [handleSelectionInsert]);

  const openImportMarkdown = useCallback(() => {
    if (fileInputRef.current) fileInputRef.current.click();
  }, []);

  const openImportNotes = useCallback(() => {
    if (importNotesInputRef.current) importNotesInputRef.current.click();
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
            ...createBlankNote(raw, basename || "Untitled Note"),
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
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
      }
    },
    [notes, persistNotes, setPanelMode, setTransientStatus],
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

        const nextNotes = [
          ...bundle.map((note) => ({
            ...note,
            updatedAt: Date.now(),
            id: note.id || timestampId(),
          })),
          ...notes,
        ];
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
        if (importNotesInputRef.current) {
          importNotesInputRef.current.value = "";
        }
      }
    },
    [notes, persistNotes, setPanelMode, setTransientStatus],
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
    const blob = new Blob([toStoredNotes(notes)], {
      type: "application/json;charset=utf-8",
    });
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
    const note = createBlankNote("", undefined);
    const nextNotes = [note, ...notes];
    persistNotes(nextNotes);
    setActiveNoteId(note.id);
    setTitle(note.title);
    setContent(note.content);
    setPanelMode("edit");
    setTransientStatus("New note created");
    requestAnimationFrame(() => editorRef.current?.focus());
  }, [notes, persistNotes, setPanelMode, setTransientStatus]);

  const deleteActiveNote = useCallback(() => {
    if (!activeNote) return;
    const confirmed = window.confirm(`Delete "${activeNote.title}"?`);
    if (!confirmed) return;

    const nextNotes = notes.filter((note) => note.id !== activeNote.id);
    const fallback = nextNotes[0] ?? createBlankNote("", undefined);
    const next = nextNotes.length > 0 ? nextNotes : [fallback];
    persistNotes(next);
    const nextActive = next[0];
    setActiveNoteId(nextActive.id);
    setTitle(nextActive.title);
    setContent(nextActive.content);
    setTransientStatus("Deleted");
  }, [activeNote, notes, persistNotes, setTransientStatus]);

  const handleCreateActionFromNotes = useCallback(() => {
    if (!content.trim()) return;
    onCreateActionFromNote(content, title);
    setTransientStatus("Seeded custom action editor");
  }, [content, onCreateActionFromNote, setTransientStatus, title]);

  const handleCreateSkillFromNotes = useCallback(async () => {
    if (!content.trim()) return;
    setActionBusy(true);
    try {
      await onCreateSkillFromNote(content, title);
      setTransientStatus("Skill creation requested");
    } finally {
      setActionBusy(false);
    }
  }, [content, onCreateSkillFromNote, title, setTransientStatus]);

  useEffect(() => {
    if (!open) return;
    loadNotes();
    setPanelMode(mode);
    setInitializingSeed(seedText?.trim() ?? "");
  }, [loadNotes, mode, open, seedText, setPanelMode]);

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

  return {
    panelMode,
    notes,
    search,
    setSearch,
    status,
    actionBusy,
    title,
    content,
    noteWordCount,
    noteCharCount,
    editorRef,
    fileInputRef,
    importNotesInputRef,
    activeNote,
    filteredNotes,
    noteCount,
    setPanelMode,
    handleSelect,
    handleTitleChange,
    handleContentChange,
    handleSearch,
    saveActiveNote,
    createNewNote,
    deleteActiveNote,
    applyToolbarAction,
    createLink,
    insertAtCursor,
    openImportMarkdown,
    openImportNotes,
    handleImportMarkdownFile,
    handleImportNotesBundle,
    exportMarkdown,
    exportWorkspaceNotes,
    handleCreateActionFromNotes,
    handleCreateSkillFromNotes,
    insertTemplate,
    toolbarItems: NOTE_TOOLBAR,
    parseTimestamp,
  };
}
