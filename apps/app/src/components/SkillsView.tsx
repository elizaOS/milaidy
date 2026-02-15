/**
 * Skills management view — create, enable/disable, and install skills.
 *
 * Professional card-grid layout with search, stats, polished toggle switches,
 * and a structured install modal. Follows the CSS variable design system used
 * throughout the app (--bg, --card, --border, --accent, --muted, --txt, etc.).
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import { client } from "../api-client";
import type { SkillInfo, SkillMarketplaceResult, SkillScanReportSummary } from "../api-client";
import { ConfirmDeleteControl } from "./shared/confirm-delete-control";
import { StatusBadge } from "./shared/ui-badges";
import { Switch } from "./shared/ui-switch";

/* ── Shared style constants ─────────────────────────────────────────── */

const inputCls =
  "px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-[var(--txt)] text-xs focus:border-[var(--accent)] focus:outline-none";
const btnPrimary =
  "px-3 py-1.5 text-xs font-medium bg-[var(--accent)] text-[var(--accent-foreground)] border border-[var(--accent)] cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-default";
const btnGhost =
  "px-3 py-1.5 text-xs bg-transparent text-[var(--muted)] border border-[var(--border)] cursor-pointer hover:text-[var(--txt)] hover:border-[var(--txt)] transition-colors disabled:opacity-40 disabled:cursor-default";
const btnDanger =
  "px-2 py-1 text-[11px] bg-transparent text-[var(--muted)] border border-[var(--border)] cursor-pointer hover:text-[#e74c3c] hover:border-[#e74c3c] transition-colors";

/* ── Skill Card ─────────────────────────────────────────────────────── */

function SkillCard({
  skill,
  skillToggleAction,
  skillReviewId,
  skillReviewReport,
  skillReviewLoading,
  onToggle,
  onEdit,
  onDelete,
  onReview,
  onAcknowledge,
  onDismissReview,
}: {
  skill: SkillInfo;
  skillToggleAction: string;
  skillReviewId: string;
  skillReviewReport: ReturnType<typeof useApp>["skillReviewReport"];
  skillReviewLoading: boolean;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (skill: SkillInfo) => void;
  onDelete: (id: string, name: string) => void;
  onReview: (id: string) => void;
  onAcknowledge: (id: string) => void;
  onDismissReview: () => void;
}) {
  const isQuarantined = skill.scanStatus === "warning" || skill.scanStatus === "critical";
  const isBlocked = skill.scanStatus === "blocked";
  const isReviewing = skillReviewId === skill.id;

  return (
    <div
      className={`flex flex-col border bg-[var(--card)] transition-colors ${
        isQuarantined || isBlocked
          ? "border-[#e74c3c]/40"
          : "border-[var(--border)] hover:border-[var(--accent)]/50"
      }`}
      data-skill-id={skill.id}
    >
        {/* Main content area */}
        <div className="p-4">
          {/* Top row: badge + toggle */}
          <div className="flex items-center justify-between mb-2.5">
            <StatusBadge
              label={
                skill.scanStatus === "blocked" || skill.scanStatus === "critical"
                  ? "Blocked"
                  : skill.scanStatus === "warning"
                    ? "Warning"
                    : skill.enabled
                      ? "Active"
                      : "Inactive"
              }
              tone={
                skill.scanStatus === "blocked" || skill.scanStatus === "critical" || skill.scanStatus === "warning"
                  ? skill.scanStatus === "warning"
                    ? "warning"
                    : "danger"
                  : skill.enabled
                    ? "success"
                    : "muted"
              }
              withDot
            />
            {!isBlocked && !isQuarantined && (
              <Switch
                checked={skill.enabled}
                disabled={skillToggleAction === skill.id}
                onChange={(val) => onToggle(skill.id, val)}
                size="compact"
                trackOnClass="bg-[var(--accent)]"
                trackOffClass="bg-[var(--border)]"
                knobClass="bg-white shadow-sm"
              />
            )}
            {isQuarantined && !isReviewing && (
              <button
                className="px-2.5 py-1 text-[11px] font-medium bg-[#f39c12]/15 text-[#f39c12] border border-[#f39c12]/30 cursor-pointer hover:bg-[#f39c12]/25 transition-colors"
                onClick={() => onReview(skill.id)}
              >
                Review Findings
              </button>
            )}
          </div>

        {/* Name + description */}
        <div className="font-semibold text-sm text-[var(--txt)] mb-1 truncate" title={skill.name}>
          {skill.name}
        </div>
        <div className="text-[11px] text-[var(--muted)] line-clamp-2 min-h-[2em]">
          {skill.description || "No description provided"}
        </div>
      </div>

      {/* Footer actions */}
      <div className="flex items-center gap-1.5 px-4 py-2.5 border-t border-[var(--border)] bg-[var(--bg)]">
        <button className={btnGhost} onClick={() => onEdit(skill)}>
          Edit
        </button>
        <ConfirmDeleteControl
          triggerClassName={btnDanger}
          confirmClassName="px-2 py-1 text-[11px] bg-[#e74c3c] text-white border border-[#e74c3c] cursor-pointer hover:opacity-90 transition-opacity"
          cancelClassName={btnGhost}
          confirmLabel="Yes"
          cancelLabel="No"
          onConfirm={() => onDelete(skill.id, skill.name)}
        />
        <span className="flex-1" />
        <span className="text-[10px] text-[var(--muted)] font-mono truncate max-w-[120px]" title={skill.id}>
          {skill.id.length > 16 ? `${skill.id.slice(0, 16)}...` : skill.id}
        </span>
      </div>

      {/* Inline review panel */}
      {isReviewing && skillReviewReport ? (
        <div className="border-t border-[var(--border)] p-4 bg-[var(--bg)]">
          <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-semibold text-[var(--txt)]">Scan Report</span>
            <span className="text-[11px] text-[#e74c3c] font-mono">
              {skillReviewReport.summary.critical} critical
            </span>
            <span className="text-[11px] text-[#f39c12] font-mono">
              {skillReviewReport.summary.warn} warnings
            </span>
          </div>
          {skillReviewReport.findings.length > 0 && (
            <div className="max-h-40 overflow-y-auto mb-3 border border-[var(--border)] bg-[var(--card)]">
              {skillReviewReport.findings.map((f: SkillScanReportSummary["findings"][number], idx: number) => (
                <div
                  key={idx}
                  className={`flex items-start gap-2 px-3 py-1.5 text-[11px] font-mono ${
                    idx > 0 ? "border-t border-[var(--border)]" : ""
                  }`}
                >
                  <span
                    className={`shrink-0 px-1.5 py-px font-bold text-[10px] uppercase ${
                      f.severity === "critical"
                        ? "bg-[#e74c3c]/15 text-[#e74c3c]"
                        : "bg-[#f39c12]/15 text-[#f39c12]"
                    }`}
                  >
                    {f.severity}
                  </span>
                  <span className="text-[var(--txt)] flex-1 min-w-0">{f.message}</span>
                  <span className="text-[var(--muted)] shrink-0">
                    {f.file}:{f.line}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button className={btnPrimary} onClick={() => onAcknowledge(skill.id)}>
              Acknowledge &amp; Enable
            </button>
            <button className={btnGhost} onClick={onDismissReview}>
              Dismiss
            </button>
          </div>
        </div>
      ) : isReviewing && skillReviewLoading ? (
        <div className="border-t border-[var(--border)] p-4 text-xs text-[var(--muted)] italic">
          Loading scan report...
        </div>
      ) : null}
    </div>
  );
}

/* ── Marketplace Result Card ────────────────────────────────────────── */

function MarketplaceCard({
  item,
  isInstalled,
  skillsMarketplaceAction,
  onInstall,
  onUninstall,
}: {
  item: SkillMarketplaceResult;
  isInstalled: boolean;
  skillsMarketplaceAction: string;
  onInstall: (item: SkillMarketplaceResult) => void;
  onUninstall: (skillId: string, name: string) => void;
}) {
  const isInstalling = skillsMarketplaceAction === `install:${item.id}`;
  const isUninstalling = skillsMarketplaceAction === `uninstall:${item.id}`;
  const sourceLabel = item.repository || item.slug || item.id;

  return (
    <div className="flex items-start gap-4 p-4 border border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]/50 transition-colors">
      {/* Icon placeholder */}
      <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-[var(--accent)]/10 text-[var(--accent)] text-sm font-bold rounded">
        {item.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-[var(--txt)]">{item.name}</div>
        <div className="text-[11px] text-[var(--muted)] mt-0.5 line-clamp-2">
          {item.description || "No description."}
        </div>
        <div className="flex items-center gap-2 mt-1.5 text-[10px] text-[var(--muted)]">
          <span className="font-mono">{sourceLabel}</span>
          {item.score != null && (
            <>
              <span className="text-[var(--border)]">/</span>
              <span>score: {item.score.toFixed(2)}</span>
            </>
          )}
          {item.tags && item.tags.length > 0 && (
            <>
              <span className="text-[var(--border)]">/</span>
              {item.tags.slice(0, 3).map((tag) => (
                <span key={tag} className="px-1.5 py-px bg-[var(--accent)]/10 text-[var(--accent)]">
                  {tag}
                </span>
              ))}
            </>
          )}
        </div>
      </div>
      {isInstalled ? (
        <button
          className={btnDanger}
          onClick={() => onUninstall(item.id, item.name)}
          disabled={isUninstalling}
        >
          {isUninstalling ? "Removing..." : "Uninstall"}
        </button>
      ) : (
        <button
          className={btnPrimary}
          onClick={() => onInstall(item)}
          disabled={isInstalling}
        >
          {isInstalling ? "Installing..." : "Install"}
        </button>
      )}
    </div>
  );
}

/* ── Install Modal ──────────────────────────────────────────────────── */

type InstallTab = "search" | "url";

function InstallModal({
  skills,
  skillsMarketplaceQuery,
  skillsMarketplaceResults,
  skillsMarketplaceError,
  skillsMarketplaceLoading,
  skillsMarketplaceAction,
  skillsMarketplaceManualGithubUrl,
  searchSkillsMarketplace,
  installSkillFromMarketplace,
  uninstallMarketplaceSkill,
  installSkillFromGithubUrl,
  setState,
  onClose,
}: {
  skills: SkillInfo[];
  skillsMarketplaceQuery: string;
  skillsMarketplaceResults: SkillMarketplaceResult[];
  skillsMarketplaceError: string;
  skillsMarketplaceLoading: boolean;
  skillsMarketplaceAction: string;
  skillsMarketplaceManualGithubUrl: string;
  searchSkillsMarketplace: () => Promise<void>;
  installSkillFromMarketplace: (item: SkillMarketplaceResult) => Promise<void>;
  uninstallMarketplaceSkill: (skillId: string, name: string) => Promise<void>;
  installSkillFromGithubUrl: () => Promise<void>;
  setState: ReturnType<typeof useApp>["setState"];
  onClose: () => void;
}) {
  const [tab, setTab] = useState<InstallTab>("search");

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-2xl max-h-[80vh] flex flex-col border border-[var(--border)] bg-[var(--bg)] overflow-hidden mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
          <div>
            <div className="text-sm font-semibold text-[var(--txt)]">Install Skill</div>
            <div className="text-[11px] text-[var(--muted)] mt-0.5">
              Add skills from the marketplace or a GitHub repository.
            </div>
          </div>
          <button
            className="text-[var(--muted)] hover:text-[var(--txt)] bg-transparent border-0 cursor-pointer text-lg px-2 transition-colors"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border)]">
          {(
            [
              { id: "search" as const, label: "Marketplace" },
              { id: "url" as const, label: "GitHub URL" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              className={`flex-1 px-4 py-2.5 text-xs font-medium bg-transparent border-0 border-b-2 cursor-pointer transition-colors ${
                tab === t.id
                  ? "text-[var(--accent)] border-b-[var(--accent)]"
                  : "text-[var(--muted)] border-b-transparent hover:text-[var(--txt)]"
              }`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {tab === "search" && (
            <>
              <div className="flex gap-2 items-center mb-4">
                <input
                  className={`${inputCls} flex-1 min-w-[200px]`}
                  placeholder="Search skills by keyword..."
                  value={skillsMarketplaceQuery}
                  onChange={(e) => setState("skillsMarketplaceQuery", e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void searchSkillsMarketplace();
                  }}
                />
                <button
                  className={btnPrimary}
                  onClick={() => searchSkillsMarketplace()}
                  disabled={skillsMarketplaceLoading}
                >
                  {skillsMarketplaceLoading ? "Searching..." : "Search"}
                </button>
              </div>

              {skillsMarketplaceError && (
                <div className="p-2.5 border border-[#e74c3c] text-[#e74c3c] text-xs mb-3">
                  {skillsMarketplaceError}
                </div>
              )}

              {skillsMarketplaceResults.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-[var(--muted)] text-sm mb-1">No results</div>
                  <div className="text-[var(--muted)] text-[11px]">
                    Search above to discover skills from the marketplace.
                  </div>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div className="text-[11px] text-[var(--muted)] mb-1">
                    {skillsMarketplaceResults.length} result{skillsMarketplaceResults.length !== 1 ? "s" : ""}
                  </div>
                  {skillsMarketplaceResults.map((item) => (
                    <MarketplaceCard
                      key={item.id}
                      item={item}
                      isInstalled={skills.some((s) => s.id === item.id)}
                      skillsMarketplaceAction={skillsMarketplaceAction}
                      onInstall={installSkillFromMarketplace}
                      onUninstall={uninstallMarketplaceSkill}
                    />
                  ))}
                </div>
              )}
            </>
          )}

          {tab === "url" && (
            <div>
              <div className="text-xs text-[var(--txt)] mb-1 font-medium">GitHub Repository URL</div>
              <div className="text-[11px] text-[var(--muted)] mb-3">
                Paste a full GitHub URL or a /tree/... path to install a skill directly.
              </div>
              <div className="flex gap-2 items-center">
                <input
                  className={`${inputCls} flex-1`}
                  placeholder="https://github.com/owner/repo/tree/main/skills/my-skill"
                  value={skillsMarketplaceManualGithubUrl}
                  onChange={(e) => setState("skillsMarketplaceManualGithubUrl", e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void installSkillFromGithubUrl();
                  }}
                />
                <button
                  className={btnPrimary}
                  onClick={() => installSkillFromGithubUrl()}
                  disabled={
                    skillsMarketplaceAction === "install:manual" ||
                    !skillsMarketplaceManualGithubUrl.trim()
                  }
                >
                  {skillsMarketplaceAction === "install:manual" ? "Installing..." : "Install"}
                </button>
              </div>

              {skillsMarketplaceError && (
                <div className="p-2.5 border border-[#e74c3c] text-[#e74c3c] text-xs mt-3">
                  {skillsMarketplaceError}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Create Skill Inline Form ───────────────────────────────────────── */

function CreateSkillForm({
  skillCreateName,
  skillCreateDescription,
  skillCreating,
  setState,
  onCancel,
  onCreate,
}: {
  skillCreateName: string;
  skillCreateDescription: string;
  skillCreating: boolean;
  setState: ReturnType<typeof useApp>["setState"];
  onCancel: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="border border-[var(--accent)]/40 bg-[var(--card)] mb-4">
      <div className="px-4 py-3 border-b border-[var(--border)]">
        <div className="text-xs font-semibold text-[var(--txt)]">Create New Skill</div>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <div>
          <label className="block text-[11px] text-[var(--muted)] mb-1 font-medium">
            Skill Name <span className="text-[#e74c3c]">*</span>
          </label>
          <input
            className={`${inputCls} w-full`}
            placeholder="e.g. my-awesome-skill"
            value={skillCreateName}
            onChange={(e) => setState("skillCreateName", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && skillCreateName.trim()) onCreate();
            }}
            autoFocus
          />
        </div>
        <div>
          <label className="block text-[11px] text-[var(--muted)] mb-1 font-medium">
            Description
          </label>
          <input
            className={`${inputCls} w-full`}
            placeholder="Brief description of what this skill does (optional)"
            value={skillCreateDescription}
            onChange={(e) => setState("skillCreateDescription", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && skillCreateName.trim()) onCreate();
            }}
          />
        </div>
        <div className="flex gap-2 justify-end pt-1">
          <button className={btnGhost} onClick={onCancel}>
            Cancel
          </button>
          <button
            className={btnPrimary}
            onClick={onCreate}
            disabled={skillCreating || !skillCreateName.trim()}
          >
            {skillCreating ? "Creating..." : "Create Skill"}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ── Edit Skill Modal ──────────────────────────────────────────────── */

function EditSkillModal({
  skillId,
  skillName,
  onClose,
  onSaved,
}: {
  skillId: string;
  skillName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [content, setContent] = useState("");
  const [originalContent, setOriginalContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [saveSuccess, setSaveSuccess] = useState(false);

  const loadSource = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await client.getSkillSource(skillId);
      setContent(res.content);
      setOriginalContent(res.content);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load skill source");
    }
    setLoading(false);
  }, [skillId]);

  useEffect(() => {
    void loadSource();
  }, [loadSource]);

  const hasChanges = content !== originalContent;

  const handleSave = async () => {
    setSaving(true);
    setError("");
    setSaveSuccess(false);
    try {
      await client.saveSkillSource(skillId, content);
      setOriginalContent(content);
      setSaveSuccess(true);
      onSaved();
      setTimeout(() => setSaveSuccess(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    }
    setSaving(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "s") {
      e.preventDefault();
      if (hasChanges && !saving) void handleSave();
    }
    // Allow tab to insert spaces
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const val = target.value;
      setContent(val.substring(0, start) + "  " + val.substring(end));
      requestAnimationFrame(() => {
        target.selectionStart = target.selectionEnd = start + 2;
      });
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-4xl h-[85vh] flex flex-col border border-[var(--border)] bg-[var(--bg)] overflow-hidden mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="font-semibold text-sm text-[var(--txt)] truncate">{skillName}</div>
            <span className="text-[10px] font-mono text-[var(--muted)] px-1.5 py-0.5 bg-[var(--card)] border border-[var(--border)]">
              SKILL.md
            </span>
            {hasChanges && (
              <span className="text-[10px] text-[var(--accent)] font-medium">unsaved</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--muted)]">
              {navigator.platform.includes("Mac") ? "⌘S" : "Ctrl+S"} to save
            </span>
            <button
              className="text-[var(--muted)] hover:text-[var(--txt)] bg-transparent border-0 cursor-pointer text-lg px-2 transition-colors"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </div>

        {/* Editor body */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full text-[var(--muted)] text-sm">
              Loading skill source...
            </div>
          ) : error && !content ? (
            <div className="flex flex-col items-center justify-center h-full gap-3">
              <div className="text-[#e74c3c] text-sm">{error}</div>
              <button className={btnGhost} onClick={() => loadSource()}>
                Retry
              </button>
            </div>
          ) : (
            <textarea
              className="w-full h-full resize-none border-0 bg-[var(--card)] text-[var(--txt)] text-[13px] leading-relaxed font-mono p-5 focus:outline-none"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-[var(--border)] shrink-0">
          <div className="text-[11px] text-[var(--muted)]">
            {content ? `${content.split("\n").length} lines` : ""}
            {error && content ? (
              <span className="text-[#e74c3c] ml-3">{error}</span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <button className={btnGhost} onClick={onClose}>
              {hasChanges ? "Discard" : "Close"}
            </button>
            <button
              className={`${btnPrimary} ${saveSuccess ? "!bg-[var(--ok,#16a34a)] !border-[var(--ok,#16a34a)]" : ""}`}
              onClick={() => handleSave()}
              disabled={saving || !hasChanges}
            >
              {saving ? "Saving..." : saveSuccess ? "Saved" : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Main Skills View ───────────────────────────────────────────────── */

export function SkillsView() {
  const {
    skills,
    skillCreateFormOpen,
    skillCreateName,
    skillCreateDescription,
    skillCreating,
    skillReviewReport,
    skillReviewId,
    skillReviewLoading,
    skillToggleAction,
    skillsMarketplaceQuery,
    skillsMarketplaceResults,
    skillsMarketplaceError,
    skillsMarketplaceLoading,
    skillsMarketplaceAction,
    skillsMarketplaceManualGithubUrl,
    loadSkills,
    refreshSkills,
    handleSkillToggle,
    handleCreateSkill,
    handleDeleteSkill,
    handleReviewSkill,
    handleAcknowledgeSkill,
    searchSkillsMarketplace,
    installSkillFromMarketplace,
    uninstallMarketplaceSkill,
    installSkillFromGithubUrl,
    setState,
  } = useApp();

  const [installModalOpen, setInstallModalOpen] = useState(false);
  const [filterText, setFilterText] = useState("");
  const [editingSkill, setEditingSkill] = useState<SkillInfo | null>(null);

  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  // Group into: needs attention, active, inactive — with text filter
  const { attention, active, inactive, activeCount, totalCount } = useMemo(() => {
    const attention: SkillInfo[] = [];
    const active: SkillInfo[] = [];
    const inactive: SkillInfo[] = [];
    let activeCount = 0;

    const query = filterText.toLowerCase();

    for (const skill of skills) {
      if (query && !skill.name.toLowerCase().includes(query) && !skill.description?.toLowerCase().includes(query)) {
        continue;
      }

      if (skill.enabled) activeCount++;

      if (
        skill.scanStatus === "warning" ||
        skill.scanStatus === "critical" ||
        skill.scanStatus === "blocked"
      ) {
        attention.push(skill);
      } else if (skill.enabled) {
        active.push(skill);
      } else {
        inactive.push(skill);
      }
    }

    return { attention, active, inactive, activeCount, totalCount: skills.length };
  }, [skills, filterText]);

  const handleDismissReview = () => {
    setState("skillReviewId", "");
    setState("skillReviewReport", null);
  };

  const handleCancelCreate = () => {
    setState("skillCreateFormOpen", false);
    setState("skillCreateName", "");
    setState("skillCreateDescription", "");
  };

  const allVisible = [...attention, ...active, ...inactive];

  /** Render a group of skill cards in a grid with a section header. */
  const renderGroup = (label: string, items: SkillInfo[], accent?: string) => {
    if (items.length === 0) return null;
    return (
      <div className="mb-6">
        <div className="text-xs uppercase tracking-wider font-semibold mb-2 flex items-center gap-2" style={accent ? { color: accent } : { color: "var(--muted)" }}>
          {label}
          <span className="text-[10px] font-mono opacity-60">({items.length})</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {items.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              skillToggleAction={skillToggleAction}
              skillReviewId={skillReviewId}
              skillReviewReport={skillReviewReport}
              skillReviewLoading={skillReviewLoading}
              onToggle={handleSkillToggle}
              onEdit={setEditingSkill}
              onDelete={handleDeleteSkill}
              onReview={handleReviewSkill}
              onAcknowledge={handleAcknowledgeSkill}
              onDismissReview={handleDismissReview}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div>
      {/* Stats bar */}
      <div className="flex items-center gap-4 mb-4 text-[11px] text-[var(--muted)]">
        <span>{totalCount} skill{totalCount !== 1 ? "s" : ""}</span>
        <span>{activeCount} active</span>
        <span>{inactive.length} inactive</span>
        {attention.length > 0 && (
          <span className="text-[#f39c12]">
            {attention.length} need{attention.length === 1 ? "s" : ""} attention
          </span>
        )}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <input
          type="text"
          placeholder="Filter skills..."
          value={filterText}
          onChange={(e) => setFilterText(e.target.value)}
          className={`${inputCls} w-[200px]`}
        />

        <span className="flex-1" />

        <button
          className={skillCreateFormOpen ? btnGhost : btnPrimary}
          onClick={() => setState("skillCreateFormOpen", !skillCreateFormOpen)}
        >
          {skillCreateFormOpen ? "Cancel" : "+ New Skill"}
        </button>
        <button className={btnPrimary} onClick={() => setInstallModalOpen(true)}>
          Install
        </button>
        <button
          className={btnGhost}
          onClick={() => refreshSkills()}
          title="Refresh skills list"
        >
          Refresh
        </button>
      </div>

      {/* Create form */}
      {skillCreateFormOpen && (
        <CreateSkillForm
          skillCreateName={skillCreateName}
          skillCreateDescription={skillCreateDescription}
          skillCreating={skillCreating}
          setState={setState}
          onCancel={handleCancelCreate}
          onCreate={handleCreateSkill}
        />
      )}

      {/* Skill grid — grouped by status */}
      {skills.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-[var(--muted)] text-sm mb-2">No skills installed</div>
          <div className="text-[var(--muted)] text-[11px] mb-4">
            Install skills from the marketplace or create a new one.
          </div>
          <div className="flex justify-center gap-2">
            <button className={btnPrimary} onClick={() => setInstallModalOpen(true)}>
              Browse Marketplace
            </button>
            <button className={btnGhost} onClick={() => setState("skillCreateFormOpen", true)}>
              Create Skill
            </button>
          </div>
        </div>
      ) : allVisible.length === 0 ? (
        <div className="text-center py-12 text-[var(--muted)] text-xs">
          No skills match "{filterText}"
        </div>
      ) : (
        <div>
          {renderGroup("Needs Attention", attention, "#f39c12")}
          {renderGroup("Active", active, "var(--ok, #16a34a)")}
          {renderGroup("Inactive", inactive)}
        </div>
      )}

      {/* Edit modal */}
      {editingSkill && (
        <EditSkillModal
          skillId={editingSkill.id}
          skillName={editingSkill.name}
          onClose={() => setEditingSkill(null)}
          onSaved={() => void refreshSkills()}
        />
      )}

      {/* Install modal */}
      {installModalOpen && (
        <InstallModal
          skills={skills}
          skillsMarketplaceQuery={skillsMarketplaceQuery}
          skillsMarketplaceResults={skillsMarketplaceResults}
          skillsMarketplaceError={skillsMarketplaceError}
          skillsMarketplaceLoading={skillsMarketplaceLoading}
          skillsMarketplaceAction={skillsMarketplaceAction}
          skillsMarketplaceManualGithubUrl={skillsMarketplaceManualGithubUrl}
          searchSkillsMarketplace={searchSkillsMarketplace}
          installSkillFromMarketplace={installSkillFromMarketplace}
          uninstallMarketplaceSkill={uninstallMarketplaceSkill}
          installSkillFromGithubUrl={installSkillFromGithubUrl}
          setState={setState}
          onClose={() => setInstallModalOpen(false)}
        />
      )}
    </div>
  );
}
