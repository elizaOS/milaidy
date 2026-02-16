import { renderMarkdown } from "./WorkspaceNotesMarkdown";
import { NOTE_TEMPLATES } from "./WorkspaceNotesPanelData";
import { useWorkspaceNotesPanelController } from "./workspaceNotesPanelController";

import type { NotesPanelMode, WorkspaceNotesPanelProps } from "./WorkspaceNotesPanelData";

export function WorkspaceNotesPanel({
  open,
  mode,
  seedText,
  onClose,
  onCreateActionFromNote,
  onCreateSkillFromNote,
}: WorkspaceNotesPanelProps) {
  const {
    activeNote,
    actionBusy,
    applyToolbarAction,
    createLink,
    createNewNote,
    deleteActiveNote,
    editorRef,
    exportMarkdown,
    exportWorkspaceNotes,
    filteredNotes,
    handleContentChange,
    handleCreateActionFromNotes,
    handleCreateSkillFromNotes,
    handleSearch,
    handleSelect,
    handleTitleChange,
    insertAtCursor,
    insertTemplate,
    noteCharCount,
    noteCount,
    noteWordCount,
    openImportMarkdown,
    openImportNotes,
    panelMode,
    parseTimestamp: formatNoteTimestamp,
    saveActiveNote,
    search,
    setPanelMode,
    status,
    title,
    toolbarItems,
    content,
    fileInputRef,
    importNotesInputRef,
    handleImportMarkdownFile,
    handleImportNotesBundle,
  } = useWorkspaceNotesPanelController({
    open,
    mode,
    seedText,
    onCreateActionFromNote,
    onCreateSkillFromNote,
  });

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
            {panelMode === "edit"
              ? "Edit"
              : panelMode === "split"
                ? "Split"
                : "Preview"}
          </span>
        </span>
        <span className="text-[11px] text-muted">
          {noteWordCount.toLocaleString()} words · {noteCharCount.toLocaleString()} chars
        </span>
        <span className="text-accent truncate max-w-[180px]" title={status || ""}>{status || ""}</span>
        <div className="shrink-0 flex items-center gap-2">
          {(["edit", "split", "view"] as const).map((modeOption: NotesPanelMode) => (
            <button
              key={modeOption}
              onClick={() => setPanelMode(modeOption)}
              className={`text-xs border px-2 py-1 transition-colors ${
                panelMode === modeOption
                  ? "border-accent text-accent"
                  : "border-border hover:border-accent hover:text-accent"
              }`}
            >
              {modeOption === "edit" ? "Edit" : modeOption === "split" ? "Split" : "Preview"}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 min-h-0">
        <div className="w-44 border-r border-border bg-surface/40 flex flex-col min-h-0">
          <div className="px-2 py-2 text-[11px] uppercase tracking-wide text-muted">Notes</div>
          <input
            value={search}
            onChange={(event) => handleSearch(event.target.value)}
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
                  <span className="text-xs font-medium text-txt-strong truncate">
                    {note.title}
                  </span>
                  <span className="text-[10px] text-muted">
                    {formatNoteTimestamp(note.updatedAt)}
                  </span>
                </div>
                <div className="text-[10px] text-muted truncate mt-1">
                  {note.content.trim() ? `${note.content.split("\n")[0].slice(0, 80)}...` : "(empty)"}
                </div>
              </button>
            ))}
          </div>
          <div className="px-2 py-2 text-[10px] text-muted border-t border-border">
            {noteCount} note{noteCount === 1 ? "" : "s"}
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
            {toolbarItems.map((tool) => (
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
