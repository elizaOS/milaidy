/**
 * Skills management view — create, enable/disable, and install skills.
 *
 * Two-panel game-modal layout matching PluginsView: left list panel with 3D
 * perspective, right detail panel, glass effects, gold accent, corner brackets.
 * Reuses `.plugins-game-*` CSS classes from anime.css.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext";
import type {
  CatalogSkill,
  SkillInfo,
  SkillMarketplaceResult,
  SkillScanReportSummary,
} from "../api-client";
import { client } from "../api-client";
import { ConfirmDeleteControl } from "./shared/confirm-delete-control";

/* ── Shared style constants ─────────────────────────────────────────── */

const inputCls =
  "px-2.5 py-1.5 border border-border bg-card text-txt text-xs focus:border-accent focus:outline-none";
const btnPrimary =
  "px-3 py-1.5 text-xs font-medium bg-accent text-accent-fg border border-accent cursor-pointer hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-default";
const btnGhost =
  "px-3 py-1.5 text-xs bg-transparent text-muted border border-border cursor-pointer hover:text-txt hover:border-txt transition-colors disabled:opacity-40 disabled:cursor-default";

type SkillStatusFilter = "all" | "enabled" | "agent" | "catalog";

/* ── Marketplace Result Card (inside InstallModal) ─────────────────── */

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
      <div className="w-10 h-10 shrink-0 flex items-center justify-center bg-[var(--accent)]/10 text-[var(--accent)] text-sm font-bold rounded">
        {item.name.charAt(0).toUpperCase()}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-sm text-[var(--txt)]">
          {item.name}
        </div>
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
                <span
                  key={tag}
                  className="px-1.5 py-px bg-[var(--accent)]/10 text-[var(--accent)]"
                >
                  {tag}
                </span>
              ))}
            </>
          )}
        </div>
      </div>
      {isInstalled ? (
        <button
          type="button"
          className="px-2 py-1 text-[11px] bg-transparent text-muted border border-border cursor-pointer hover:text-[#e74c3c] hover:border-[#e74c3c] transition-colors"
          onClick={() => onUninstall(item.id, item.name)}
          disabled={isUninstalling}
        >
          {isUninstalling ? "Removing..." : "Uninstall"}
        </button>
      ) : (
        <button
          type="button"
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
      className="fixed inset-0 z-[999] flex items-center justify-center"
      style={{ background: "rgba(0, 0, 0, 0.6)", backdropFilter: "blur(8px)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="w-full max-w-2xl max-h-[80vh] flex flex-col overflow-hidden mx-4"
        style={{
          background:
            "linear-gradient(148deg, rgba(18, 22, 34, 0.94) 0%, rgba(8, 11, 20, 0.92) 52%, rgba(5, 8, 14, 0.9) 100%)",
          border: "1px solid rgba(255, 255, 255, 0.17)",
          borderRadius: 16,
          boxShadow:
            "0 12px 40px rgba(0, 0, 0, 0.5), inset 0 1px 0 rgba(255, 255, 255, 0.05)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-5 py-4"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}
        >
          <div>
            <div
              style={{
                fontFamily: "var(--font-display), sans-serif",
                fontSize: 14,
                fontWeight: 800,
                letterSpacing: "0.12em",
                textTransform: "uppercase" as const,
                color: "#fff",
              }}
            >
              Install Skill
            </div>
            <div
              style={{
                fontSize: 11,
                color: "rgba(228, 232, 245, 0.74)",
                marginTop: 2,
              }}
            >
              Add skills from the marketplace or a GitHub repository.
            </div>
          </div>
          <button
            type="button"
            className="plugins-game-action-btn"
            onClick={onClose}
            style={{ padding: "4px 10px" }}
          >
            ×
          </button>
        </div>

        {/* Tabs */}
        <div
          className="flex"
          style={{ borderBottom: "1px solid rgba(255, 255, 255, 0.1)" }}
        >
          {(
            [
              { id: "search" as const, label: "Marketplace" },
              { id: "url" as const, label: "GitHub URL" },
            ] as const
          ).map((t) => (
            <button
              type="button"
              key={t.id}
              className={`plugins-game-chip flex-1 justify-center${tab === t.id ? " is-active" : ""}`}
              style={{
                borderRadius: 0,
                border: "none",
                borderBottom:
                  tab === t.id
                    ? "2px solid var(--pg-accent, #f0b232)"
                    : "2px solid transparent",
                padding: "10px 16px",
                minWidth: 0,
              }}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Body */}
        <div
          className="flex-1 overflow-y-auto px-5 py-4"
          style={{
            scrollbarWidth: "thin" as const,
            scrollbarColor: "rgba(255, 255, 255, 0.16) transparent",
          }}
        >
          {tab === "search" && (
            <>
              <div
                className="plugins-game-list-search-row"
                style={{ marginBottom: 16 }}
              >
                <input
                  className="plugins-game-search-input"
                  placeholder="Search skills by keyword..."
                  value={skillsMarketplaceQuery}
                  onChange={(e) =>
                    setState("skillsMarketplaceQuery", e.target.value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void searchSkillsMarketplace();
                  }}
                />
                <button
                  type="button"
                  className="plugins-game-save-btn"
                  style={{ minHeight: 36 }}
                  onClick={() => searchSkillsMarketplace()}
                  disabled={skillsMarketplaceLoading}
                >
                  {skillsMarketplaceLoading ? "Searching..." : "Search"}
                </button>
              </div>

              {skillsMarketplaceError && (
                <div
                  className="plugins-game-detail-errors"
                  style={{ marginBottom: 12 }}
                >
                  {skillsMarketplaceError}
                </div>
              )}

              {skillsMarketplaceResults.length === 0 ? (
                <div
                  className="plugins-game-detail-empty"
                  style={{ minHeight: 180 }}
                >
                  <span className="plugins-game-detail-empty-icon">🔍</span>
                  <span className="plugins-game-detail-empty-text">
                    Search above to discover skills.
                  </span>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  <div
                    style={{
                      fontSize: 10,
                      color: "rgba(228, 232, 245, 0.74)",
                      letterSpacing: "0.06em",
                      textTransform: "uppercase" as const,
                      marginBottom: 4,
                    }}
                  >
                    {skillsMarketplaceResults.length} result
                    {skillsMarketplaceResults.length !== 1 ? "s" : ""}
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
              <div
                style={{
                  fontSize: 12,
                  color: "#fff",
                  fontWeight: 700,
                  letterSpacing: "0.06em",
                  marginBottom: 4,
                }}
              >
                GitHub Repository URL
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "rgba(228, 232, 245, 0.74)",
                  marginBottom: 12,
                }}
              >
                Paste a full GitHub URL or a /tree/... path to install a skill
                directly.
              </div>
              <div className="plugins-game-list-search-row">
                <input
                  className="plugins-game-search-input"
                  placeholder="https://github.com/owner/repo/tree/main/skills/my-skill"
                  value={skillsMarketplaceManualGithubUrl}
                  onChange={(e) =>
                    setState("skillsMarketplaceManualGithubUrl", e.target.value)
                  }
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void installSkillFromGithubUrl();
                  }}
                />
                <button
                  type="button"
                  className="plugins-game-save-btn"
                  style={{ minHeight: 36 }}
                  onClick={() => installSkillFromGithubUrl()}
                  disabled={
                    skillsMarketplaceAction === "install:manual" ||
                    !skillsMarketplaceManualGithubUrl.trim()
                  }
                >
                  {skillsMarketplaceAction === "install:manual"
                    ? "Installing..."
                    : "Install"}
                </button>
              </div>

              {skillsMarketplaceError && (
                <div
                  className="plugins-game-detail-errors"
                  style={{ marginTop: 12 }}
                >
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
        <div className="text-xs font-semibold text-[var(--txt)]">
          Create New Skill
        </div>
      </div>
      <div className="p-4 flex flex-col gap-3">
        <div>
          <span className="block text-[11px] text-[var(--muted)] mb-1 font-medium">
            Skill Name <span className="text-[#e74c3c]">*</span>
          </span>
          <input
            className={`${inputCls} w-full`}
            placeholder="e.g. my-awesome-skill"
            value={skillCreateName}
            onChange={(e) => setState("skillCreateName", e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && skillCreateName.trim()) onCreate();
            }}
          />
        </div>
        <div>
          <span className="block text-[11px] text-[var(--muted)] mb-1 font-medium">
            Description
          </span>
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
          <button type="button" className={btnGhost} onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
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
      setError(
        err instanceof Error ? err.message : "Failed to load skill source",
      );
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
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.target as HTMLTextAreaElement;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const val = target.value;
      setContent(`${val.substring(0, start)}  ${val.substring(end)}`);
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
      onKeyDown={(e) => {
        if (e.key === "Escape" || e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-4xl h-[85vh] flex flex-col border border-[var(--border)] bg-[var(--bg)] overflow-hidden mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-[var(--border)] shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="font-semibold text-sm text-[var(--txt)] truncate">
              {skillName}
            </div>
            <span className="text-[10px] font-mono text-[var(--muted)] px-1.5 py-0.5 bg-[var(--card)] border border-[var(--border)]">
              SKILL.md
            </span>
            {hasChanges && (
              <span className="text-[10px] text-[var(--accent)] font-medium">
                unsaved
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-[var(--muted)]">
              {navigator.platform.includes("Mac") ? "⌘S" : "Ctrl+S"} to save
            </span>
            <button
              type="button"
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
              <button
                type="button"
                className={btnGhost}
                onClick={() => loadSource()}
              >
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
            <button type="button" className={btnGhost} onClick={onClose}>
              {hasChanges ? "Discard" : "Close"}
            </button>
            <button
              type="button"
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

/* ── Unified list item (installed skill OR catalog skill) ──────────── */

type ListItem =
  | { kind: "installed"; skill: SkillInfo }
  | { kind: "catalog"; catalog: CatalogSkill };

function itemId(item: ListItem) {
  return item.kind === "installed" ? item.skill.id : `cat:${item.catalog.slug}`;
}

function itemName(item: ListItem) {
  return item.kind === "installed" ? item.skill.name : item.catalog.displayName;
}

function itemEnabled(item: ListItem) {
  return item.kind === "installed"
    ? item.skill.enabled
    : item.catalog.installed === true;
}

/* ── Main Skills View ───────────────────────────────────────────────── */

export function SkillsView({ inModal: _inModal }: { inModal?: boolean } = {}) {
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
    catalogSkills,
    catalogLoading,
    catalogInstalling,
    catalogUninstalling,
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
  const [statusFilter, setStatusFilter] = useState<SkillStatusFilter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Load installed skills + catalog on mount
  useEffect(() => {
    void loadSkills();
    void loadCatalog();
  }, [loadSkills]);

  const loadCatalog = useCallback(async () => {
    setState("catalogLoading", true);
    try {
      const res = await client.getSkillCatalog({ perPage: 50 });
      setState("catalogSkills", res.skills);
      setState("catalogTotal", res.total);
      setState("catalogTotalPages", res.totalPages);
    } catch {
      /* catalog fetch can 429 — silently ignore */
    }
    setState("catalogLoading", false);
  }, [setState]);

  const handleCatalogInstall = useCallback(
    async (slug: string) => {
      setState("catalogInstalling", new Set([...catalogInstalling, slug]));
      try {
        await client.installCatalogSkill(slug);
        await loadCatalog();
        void refreshSkills();
      } catch {
        /* ignore */
      }
      setState(
        "catalogInstalling",
        (() => {
          const next = new Set(catalogInstalling);
          next.delete(slug);
          return next;
        })(),
      );
    },
    [catalogInstalling, setState, loadCatalog, refreshSkills],
  );

  const handleCatalogUninstall = useCallback(
    async (slug: string) => {
      setState("catalogUninstalling", new Set([...catalogUninstalling, slug]));
      try {
        await client.uninstallCatalogSkill(slug);
        await loadCatalog();
        void refreshSkills();
      } catch {
        /* ignore */
      }
      setState(
        "catalogUninstalling",
        (() => {
          const next = new Set(catalogUninstalling);
          next.delete(slug);
          return next;
        })(),
      );
    },
    [catalogUninstalling, setState, loadCatalog, refreshSkills],
  );

  // Build unified item list
  const listItems = useMemo(() => {
    const query = filterText.toLowerCase();
    const items: ListItem[] = [];

    // Installed skills
    if (
      statusFilter === "all" ||
      statusFilter === "enabled" ||
      statusFilter === "agent"
    ) {
      for (const s of skills) {
        if (statusFilter === "enabled" && !s.enabled) continue;
        if (statusFilter === "agent" && s.source !== "agent") continue;
        if (
          query &&
          !s.name.toLowerCase().includes(query) &&
          !s.description?.toLowerCase().includes(query)
        )
          continue;
        items.push({ kind: "installed", skill: s });
      }
    }

    // Catalog skills
    if (statusFilter === "all" || statusFilter === "catalog") {
      for (const c of catalogSkills) {
        if (
          query &&
          !c.displayName.toLowerCase().includes(query) &&
          !c.summary?.toLowerCase().includes(query) &&
          !c.slug.toLowerCase().includes(query)
        )
          continue;
        items.push({ kind: "catalog", catalog: c });
      }
    }

    return items;
  }, [skills, catalogSkills, filterText, statusFilter]);

  const enabledCount = useMemo(
    () => skills.filter((s) => s.enabled).length,
    [skills],
  );

  const agentCount = useMemo(
    () => skills.filter((s) => s.source === "agent").length,
    [skills],
  );

  // Effective selection
  const effectiveSelected =
    listItems.find((it) => itemId(it) === selectedId) != null
      ? selectedId
      : listItems.length > 0
        ? itemId(listItems[0])
        : null;
  const selectedItem =
    listItems.find((it) => itemId(it) === effectiveSelected) ?? null;

  const handleDismissReview = () => {
    setState("skillReviewId", "");
    setState("skillReviewReport", null);
  };

  const handleCancelCreate = () => {
    setState("skillCreateFormOpen", false);
    setState("skillCreateName", "");
    setState("skillCreateDescription", "");
  };

  /* ── Render ────────────────────────────────────────────────────────── */

  return (
    <>
      <div className="plugins-game-modal">
        {/* ─── LEFT PANEL: List ─── */}
        <div className="plugins-game-list-panel">
          {/* Header */}
          <div className="plugins-game-list-head">
            <div className="plugins-game-section-title">Talents</div>
            <div className="plugins-game-section-meta">
              {skills.length} installed
            </div>
          </div>

          {/* Search */}
          <div className="plugins-game-list-search">
            <div className="plugins-game-list-search-row">
              <input
                type="text"
                className="plugins-game-search-input"
                placeholder="Search skills..."
                value={filterText}
                onChange={(e) => setFilterText(e.target.value)}
              />
              <button
                type="button"
                className="plugins-game-add-btn"
                onClick={() => setInstallModalOpen(true)}
              >
                <span className="plugins-game-add-symbol">+</span> Install
              </button>
            </div>
          </div>

          {/* Filter chips + actions */}
          <div className="plugins-game-chip-row plugins-game-chip-row-wrap">
            {(
              [
                {
                  key: "all" as const,
                  label: `ALL (${skills.length + catalogSkills.length})`,
                },
                { key: "enabled" as const, label: `ON (${enabledCount})` },
                {
                  key: "agent" as const,
                  label: `AGENT (${agentCount})`,
                },
                {
                  key: "catalog" as const,
                  label: `CATALOG (${catalogSkills.length})`,
                },
              ] as const
            ).map((f) => (
              <button
                key={f.key}
                type="button"
                className={`plugins-game-chip plugins-game-chip-small${statusFilter === f.key ? " is-active" : ""}`}
                onClick={() => setStatusFilter(f.key)}
              >
                {f.label}
              </button>
            ))}
          </div>

          {/* Scrollable card list */}
          <div className="plugins-game-list-scroll">
            {listItems.length === 0 ? (
              <div className="plugins-game-list-empty">
                {catalogLoading
                  ? "Loading catalog..."
                  : filterText
                    ? `No skills match "${filterText}"`
                    : "No skills found."}
              </div>
            ) : (
              listItems.map((item) => {
                const id = itemId(item);
                const name = itemName(item);
                const enabled = itemEnabled(item);
                const isCat = item.kind === "catalog";
                const isAgent =
                  item.kind === "installed" && item.skill.source === "agent";
                const isBusy =
                  item.kind === "installed"
                    ? skillToggleAction === item.skill.id
                    : catalogInstalling.has(item.catalog.slug) ||
                      catalogUninstalling.has(item.catalog.slug);

                return (
                  <button
                    key={id}
                    type="button"
                    className={`plugins-game-card${effectiveSelected === id ? " is-selected" : ""}${!enabled ? " is-disabled" : ""}`}
                    onClick={() => setSelectedId(id)}
                  >
                    <div className="plugins-game-card-icon-shell">
                      <span className="plugins-game-card-icon">
                        {name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="plugins-game-card-body">
                      <div className="plugins-game-card-name">{name}</div>
                      <div className="plugins-game-card-meta">
                        <span
                          className={`plugins-game-badge ${enabled ? "is-on" : "is-off"}${isBusy ? " is-busy" : ""}`}
                        >
                          {isBusy ? "..." : enabled ? "ON" : "OFF"}
                        </span>
                        {isCat && (
                          <span className="plugins-game-badge">CATALOG</span>
                        )}
                        {isAgent && (
                          <span
                            className="plugins-game-badge"
                            style={{ color: "var(--accent)" }}
                          >
                            AGENT
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* ─── RIGHT PANEL: Detail ─── */}
        <div className="plugins-game-detail-panel">
          {selectedItem ? (
            <>
              {/* Detail head */}
              <div className="plugins-game-detail-head">
                <div className="plugins-game-detail-title-row">
                  <div className="plugins-game-detail-icon-shell">
                    <span className="plugins-game-detail-icon">
                      {itemName(selectedItem).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="plugins-game-detail-main">
                    <div className="plugins-game-detail-name">
                      {itemName(selectedItem)}
                    </div>
                    {selectedItem.kind === "catalog" &&
                      selectedItem.catalog.latestVersion && (
                        <span className="plugins-game-version">
                          v{selectedItem.catalog.latestVersion.version}
                        </span>
                      )}
                  </div>
                  {/* Toggle */}
                  {selectedItem.kind === "installed" ? (
                    <button
                      type="button"
                      className={`plugins-game-toggle ${selectedItem.skill.enabled ? "is-on" : "is-off"}`}
                      onClick={() =>
                        handleSkillToggle(
                          selectedItem.skill.id,
                          !selectedItem.skill.enabled,
                        )
                      }
                      disabled={skillToggleAction === selectedItem.skill.id}
                    >
                      {skillToggleAction === selectedItem.skill.id
                        ? "APPLYING"
                        : selectedItem.skill.enabled
                          ? "ON"
                          : "OFF"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      className={`plugins-game-toggle ${selectedItem.catalog.installed ? "is-on" : "is-off"}`}
                      onClick={() =>
                        selectedItem.catalog.installed
                          ? handleCatalogUninstall(selectedItem.catalog.slug)
                          : handleCatalogInstall(selectedItem.catalog.slug)
                      }
                      disabled={
                        catalogInstalling.has(selectedItem.catalog.slug) ||
                        catalogUninstalling.has(selectedItem.catalog.slug)
                      }
                    >
                      {catalogInstalling.has(selectedItem.catalog.slug) ||
                      catalogUninstalling.has(selectedItem.catalog.slug)
                        ? "APPLYING"
                        : selectedItem.catalog.installed
                          ? "ON"
                          : "OFF"}
                    </button>
                  )}
                </div>
              </div>

              {/* Agent-created indicator */}
              {selectedItem.kind === "installed" &&
                selectedItem.skill.source === "agent" && (
                  <div
                    style={{
                      padding: "6px 12px",
                      margin: "0 16px 8px",
                      background: "rgba(var(--accent-rgb, 212 175 55), 0.08)",
                      border: "1px solid var(--accent)",
                      fontSize: 11,
                      color: "var(--accent)",
                    }}
                  >
                    Self-created by agent
                  </div>
                )}

              {/* Description */}
              <div className="plugins-game-detail-description">
                {selectedItem.kind === "installed"
                  ? selectedItem.skill.description || "No description provided."
                  : selectedItem.catalog.summary || "No description available."}
              </div>

              {/* Metadata for catalog items */}
              {selectedItem.kind === "catalog" && (
                <div
                  className="plugins-game-detail-meta"
                  style={{
                    marginBottom: 14,
                    display: "flex",
                    gap: 6,
                    flexWrap: "wrap",
                  }}
                >
                  {Object.keys(selectedItem.catalog.tags || {})
                    .slice(0, 5)
                    .map((tag) => (
                      <span key={tag} className="plugins-game-badge">
                        {tag}
                      </span>
                    ))}
                  {selectedItem.catalog.stats.downloads > 0 && (
                    <span className="plugins-game-badge">
                      {selectedItem.catalog.stats.downloads.toLocaleString()}{" "}
                      downloads
                    </span>
                  )}
                  {selectedItem.catalog.stats.stars > 0 && (
                    <span className="plugins-game-badge">
                      {selectedItem.catalog.stats.stars.toLocaleString()} stars
                    </span>
                  )}
                </div>
              )}

              {/* Scan review panel (installed skills only) */}
              {selectedItem.kind === "installed" &&
                (selectedItem.skill.scanStatus === "warning" ||
                  selectedItem.skill.scanStatus === "critical" ||
                  selectedItem.skill.scanStatus === "blocked") && (
                  <div className="plugins-game-detail-errors">
                    <div>
                      Scan status:{" "}
                      <strong>{selectedItem.skill.scanStatus}</strong>
                    </div>
                    {skillReviewId === selectedItem.skill.id &&
                    skillReviewReport ? (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ marginBottom: 4 }}>
                          {skillReviewReport.summary.critical} critical,{" "}
                          {skillReviewReport.summary.warn} warnings
                        </div>
                        {skillReviewReport.findings.map(
                          (
                            f: SkillScanReportSummary["findings"][number],
                            idx: number,
                          ) => (
                            <div
                              key={`${f.file}:${f.line}:${f.message}`}
                              style={{
                                fontSize: 11,
                                fontFamily: "monospace",
                                borderTop:
                                  idx > 0
                                    ? "1px solid rgba(255,255,255,0.08)"
                                    : undefined,
                                padding: "3px 0",
                              }}
                            >
                              <span
                                style={{
                                  color:
                                    f.severity === "critical"
                                      ? "#ef4444"
                                      : "#f39c12",
                                  fontWeight: "bold",
                                  marginRight: 6,
                                  textTransform: "uppercase",
                                }}
                              >
                                {f.severity}
                              </span>
                              {f.message}{" "}
                              <span style={{ opacity: 0.5 }}>
                                {f.file}:{f.line}
                              </span>
                            </div>
                          ),
                        )}
                      </div>
                    ) : skillReviewId === selectedItem.skill.id &&
                      skillReviewLoading ? (
                      <div style={{ marginTop: 8, fontStyle: "italic" }}>
                        Loading scan report...
                      </div>
                    ) : null}
                  </div>
                )}

              {/* Create form (shown in detail panel when active) */}
              {skillCreateFormOpen && (
                <div style={{ marginBottom: 14 }}>
                  <CreateSkillForm
                    skillCreateName={skillCreateName}
                    skillCreateDescription={skillCreateDescription}
                    skillCreating={skillCreating}
                    setState={setState}
                    onCancel={handleCancelCreate}
                    onCreate={handleCreateSkill}
                  />
                </div>
              )}

              {/* Actions */}
              <div className="plugins-game-detail-actions">
                {selectedItem.kind === "installed" &&
                  (selectedItem.skill.scanStatus === "warning" ||
                    selectedItem.skill.scanStatus === "critical") &&
                  skillReviewId !== selectedItem.skill.id && (
                    <button
                      type="button"
                      className="plugins-game-action-btn"
                      onClick={() => handleReviewSkill(selectedItem.skill.id)}
                    >
                      Review Findings
                    </button>
                  )}
                {selectedItem.kind === "installed" &&
                  skillReviewId === selectedItem.skill.id &&
                  skillReviewReport && (
                    <>
                      <button
                        type="button"
                        className="plugins-game-action-btn"
                        onClick={handleDismissReview}
                      >
                        Dismiss
                      </button>
                      <button
                        type="button"
                        className="plugins-game-save-btn"
                        onClick={() =>
                          handleAcknowledgeSkill(selectedItem.skill.id)
                        }
                      >
                        Acknowledge &amp; Enable
                      </button>
                    </>
                  )}
                {selectedItem.kind === "installed" && (
                  <>
                    <button
                      type="button"
                      className="plugins-game-action-btn"
                      onClick={() => setEditingSkill(selectedItem.skill)}
                    >
                      Edit Source
                    </button>
                    <ConfirmDeleteControl
                      triggerClassName="plugins-game-action-btn"
                      confirmClassName="plugins-game-save-btn"
                      cancelClassName="plugins-game-action-btn"
                      confirmLabel="Yes, Delete"
                      cancelLabel="Cancel"
                      onConfirm={() =>
                        handleDeleteSkill(
                          selectedItem.skill.id,
                          selectedItem.skill.name,
                        )
                      }
                    />
                  </>
                )}
              </div>
            </>
          ) : (
            <div className="plugins-game-detail-empty">
              <span className="plugins-game-detail-empty-icon">✦</span>
              <span className="plugins-game-detail-empty-text">
                Select a skill to configure.
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Modals rendered OUTSIDE game-modal to escape 3D stacking context */}
      {editingSkill && (
        <EditSkillModal
          skillId={editingSkill.id}
          skillName={editingSkill.name}
          onClose={() => setEditingSkill(null)}
          onSaved={() => void refreshSkills()}
        />
      )}

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
    </>
  );
}
