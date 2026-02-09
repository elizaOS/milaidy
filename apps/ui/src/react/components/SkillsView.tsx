/**
 * Skills management view — create, enable/disable, and install skills.
 * Mirrors the Lit version in app.ts (renderSkills + renderSkillCard) 1:1.
 */

import { useEffect, useMemo, useState } from "react";
import { useApp } from "../AppContext.js";
import type { SkillInfo, SkillMarketplaceResult, SkillScanReportSummary } from "../../ui/api-client.js";

/* ── Skill Card ──────────────────────────────────────────────────────── */

function SkillCard({
  skill,
  skillToggleAction,
  skillReviewId,
  skillReviewReport,
  skillReviewLoading,
  onToggle,
  onOpen,
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
  onOpen: (id: string) => void;
  onDelete: (id: string, name: string) => void;
  onReview: (id: string) => void;
  onAcknowledge: (id: string) => void;
  onDismissReview: () => void;
}) {
  const isQuarantined = skill.scanStatus === "warning" || skill.scanStatus === "critical";
  const isBlocked = skill.scanStatus === "blocked";
  const isReviewing = skillReviewId === skill.id;

  return (
    <div className="flex flex-col items-stretch p-4 px-5 border border-border bg-card">
      {/* Header row */}
      <div className="flex items-center gap-1.5">
        <div className="flex-1 min-w-0">
          <div className="font-bold text-sm">
            {skill.name}
            {isQuarantined && (
              <span
                className="text-[10px] px-1.5 py-px ml-1.5 text-white"
                style={{
                  borderRadius: "3px",
                  background: skill.scanStatus === "critical"
                    ? "var(--danger, #e74c3c)"
                    : "var(--warn, #f39c12)",
                }}
              >
                QUARANTINED
              </span>
            )}
            {isBlocked && (
              <span
                className="text-[10px] px-1.5 py-px ml-1.5 text-white"
                style={{ borderRadius: "3px", background: "var(--danger, #e74c3c)" }}
              >
                BLOCKED
              </span>
            )}
          </div>
          <div className="text-xs text-muted mt-0.5">
            {skill.description || "No description"}
          </div>
        </div>

        {/* Edit button */}
        <button
          className="px-2 py-0.5 border border-accent bg-accent text-accent-fg cursor-pointer text-[11px] hover:bg-accent-hover hover:border-accent-hover"
          onClick={() => onOpen(skill.id)}
        >
          Edit
        </button>

        {/* Delete button */}
        <button
          className="px-2 py-0.5 border border-accent bg-accent text-accent-fg cursor-pointer text-[11px] hover:bg-accent-hover hover:border-accent-hover"
          style={{ color: "var(--danger, #e74c3c)" }}
          onClick={() => onDelete(skill.id, skill.name)}
        >
          Del
        </button>

        {/* Status / Toggle / Review */}
        {isQuarantined && !isReviewing ? (
          <button
            className="px-2 py-0.5 border border-accent bg-accent text-accent-fg cursor-pointer text-[11px] hover:bg-accent-hover hover:border-accent-hover"
            style={{ color: "var(--warn, #f39c12)" }}
            onClick={() => onReview(skill.id)}
          >
            Review Findings
          </button>
        ) : isBlocked ? (
          <span
            className="text-xs font-mono px-2 py-0.5 border border-border"
            style={{ color: "var(--danger, #e74c3c)" }}
          >
            blocked
          </span>
        ) : (
          <>
            <span
              className={`text-xs font-mono px-2 py-0.5 border ${
                skill.enabled ? "text-ok border-ok" : "border-border"
              }`}
            >
              {skill.enabled ? "active" : "inactive"}
            </span>
            <label className="relative inline-flex cursor-pointer">
              <input
                type="checkbox"
                className="opacity-0 w-0 h-0 absolute"
                checked={skill.enabled}
                disabled={skillToggleAction === skill.id || isQuarantined}
                onChange={(e) => onToggle(skill.id, e.target.checked)}
              />
              <div
                className={`w-9 h-[18px] relative transition-colors ${
                  skill.enabled ? "bg-accent" : "bg-muted"
                }`}
              >
                <div
                  className="absolute w-3.5 h-3.5 bg-white top-0.5 transition-[left]"
                  style={{ left: skill.enabled ? "20px" : "2px" }}
                />
              </div>
            </label>
          </>
        )}
      </div>

      {/* Inline review panel (not a modal — matches Lit version) */}
      {isReviewing && skillReviewReport ? (
        <div className="mt-2 p-2 border border-border text-xs">
          <div className="mb-1.5">
            <strong>{skillReviewReport.summary.critical}</strong> critical,{" "}
            <strong>{skillReviewReport.summary.warn}</strong> warnings
          </div>
          {skillReviewReport.findings.length > 0 && (
            <div className="font-mono text-[11px] max-h-40 overflow-y-auto mb-2">
              {skillReviewReport.findings.map((f: SkillScanReportSummary["findings"][number], idx: number) => (
                <div key={idx} className="mb-1">
                  <span
                    style={{
                      color:
                        f.severity === "critical"
                          ? "var(--danger, #e74c3c)"
                          : "var(--warn, #f39c12)",
                    }}
                  >
                    [{f.severity.toUpperCase()}]
                  </span>{" "}
                  {f.message}{" "}
                  <span className="text-muted">
                    {f.file}:{f.line}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <button
              className="px-6 py-2 border border-accent bg-accent text-accent-fg cursor-pointer text-sm mt-0 hover:bg-accent-hover hover:border-accent-hover"
              onClick={() => onAcknowledge(skill.id)}
            >
              Acknowledge &amp; Enable
            </button>
            <button
              className="px-6 py-2 border border-accent bg-accent text-accent-fg cursor-pointer text-sm mt-0 hover:bg-accent-hover hover:border-accent-hover"
              onClick={onDismissReview}
            >
              Dismiss
            </button>
          </div>
        </div>
      ) : isReviewing && skillReviewLoading ? (
        <div className="mt-2 text-xs text-muted">Loading scan report...</div>
      ) : null}
    </div>
  );
}

/* ── Marketplace Result Card ─────────────────────────────────────────── */

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
  return (
    <div className="flex flex-col items-stretch p-4 px-5 border border-border bg-card">
      <div className="flex justify-between gap-2.5">
        <div className="min-w-0 flex-1">
          <div className="font-bold text-sm">{item.name}</div>
          <div className="text-xs text-muted mt-0.5">
            {item.description || "No description."}
          </div>
          <div className="text-[11px] text-muted mt-1">
            {item.repository}
            {item.score != null ? ` · score: ${item.score.toFixed(2)}` : ""}
          </div>
        </div>
        {isInstalled ? (
          <button
            className="self-center px-6 py-2 border border-accent bg-accent text-accent-fg cursor-pointer text-sm hover:bg-accent-hover hover:border-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => onUninstall(item.id, item.name)}
            disabled={skillsMarketplaceAction === `uninstall:${item.id}`}
          >
            {skillsMarketplaceAction === `uninstall:${item.id}`
              ? "Uninstalling..."
              : "Uninstall"}
          </button>
        ) : (
          <button
            className="self-center px-6 py-2 border border-accent bg-accent text-accent-fg cursor-pointer text-sm hover:bg-accent-hover hover:border-accent-hover disabled:opacity-40 disabled:cursor-not-allowed"
            onClick={() => onInstall(item)}
            disabled={skillsMarketplaceAction === `install:${item.id}`}
          >
            {skillsMarketplaceAction === `install:${item.id}`
              ? "Installing..."
              : "Install"}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Install Modal ────────────────────────────────────────────────────── */

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
  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)" }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      {/* Modal panel */}
      <div className="w-full max-w-2xl max-h-[80vh] flex flex-col border border-border bg-bg overflow-hidden mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="text-lg font-normal m-0 text-txt-strong">Install Skill</h2>
            <p className="text-muted text-[13px] mt-1 mb-0">
              Search and install skills from the marketplace or GitHub.
            </p>
          </div>
          <button
            className="px-3 py-1 border border-accent bg-accent text-accent-fg cursor-pointer text-xs hover:bg-accent-hover hover:border-accent-hover"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* Marketplace search */}
          <div className="flex gap-2 items-center mb-2 flex-wrap">
            <input
              className="flex-1 min-w-[220px] p-2 px-3 border border-border bg-card text-[13px]"
              placeholder="Search skills by keyword..."
              value={skillsMarketplaceQuery}
              onChange={(e) => setState("skillsMarketplaceQuery", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void searchSkillsMarketplace();
              }}
            />
            <button
              className="px-6 py-2 border border-accent bg-accent text-accent-fg cursor-pointer text-sm hover:bg-accent-hover hover:border-accent-hover disabled:opacity-40 disabled:cursor-not-allowed mt-0"
              onClick={() => searchSkillsMarketplace()}
              disabled={skillsMarketplaceLoading}
            >
              {skillsMarketplaceLoading ? "Searching..." : "Search"}
            </button>
          </div>

          {/* Error */}
          {skillsMarketplaceError && (
            <div
              className="p-2 text-xs mb-2"
              style={{
                border: "1px solid var(--danger, #e74c3c)",
                color: "var(--danger, #e74c3c)",
              }}
            >
              {skillsMarketplaceError}
            </div>
          )}

          {/* GitHub URL install */}
          <div className="flex gap-2 items-center mb-3 flex-wrap">
            <input
              className="flex-1 min-w-[220px] p-2 px-3 border border-border bg-card text-[13px]"
              placeholder="Install via GitHub URL (repo or /tree/... path)"
              value={skillsMarketplaceManualGithubUrl}
              onChange={(e) => setState("skillsMarketplaceManualGithubUrl", e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void installSkillFromGithubUrl();
              }}
            />
            <button
              className="px-6 py-2 border border-accent bg-accent text-accent-fg cursor-pointer text-sm hover:bg-accent-hover hover:border-accent-hover disabled:opacity-40 disabled:cursor-not-allowed mt-0"
              onClick={() => installSkillFromGithubUrl()}
              disabled={
                skillsMarketplaceAction === "install:manual" ||
                !skillsMarketplaceManualGithubUrl.trim()
              }
            >
              {skillsMarketplaceAction === "install:manual"
                ? "Installing..."
                : "Install URL"}
            </button>
          </div>

          {/* Results */}
          {skillsMarketplaceResults.length === 0 ? (
            <div className="text-xs text-muted">
              No results yet. Search above or install directly via GitHub URL.
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
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
        </div>
      </div>
    </div>
  );
}

/* ── Main Skills View ────────────────────────────────────────────────── */

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
    handleOpenSkill,
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

  // Load skills on mount
  useEffect(() => {
    void loadSkills();
  }, [loadSkills]);

  // Separate quarantined/blocked from normal
  const { quarantinedOrBlocked, normal, quarantinedCount } = useMemo(() => {
    const quarantinedOrBlocked: SkillInfo[] = [];
    const normal: SkillInfo[] = [];

    for (const skill of skills) {
      if (
        skill.scanStatus === "warning" ||
        skill.scanStatus === "critical" ||
        skill.scanStatus === "blocked"
      ) {
        quarantinedOrBlocked.push(skill);
      } else {
        normal.push(skill);
      }
    }

    const quarantinedCount = skills.filter(
      (s) => s.scanStatus === "warning" || s.scanStatus === "critical",
    ).length;

    return { quarantinedOrBlocked, normal, quarantinedCount };
  }, [skills]);

  const handleDismissReview = () => {
    setState("skillReviewId", "");
    setState("skillReviewReport", null);
  };

  return (
    <div>
      {/* Title */}
      <h2 className="text-lg font-normal m-0 mb-2 text-txt-strong">Skills</h2>
      <p className="text-muted text-[13px] mb-5">
        {skills.length} loaded skills
        {quarantinedCount > 0 && (
          <>
            {" · "}
            <span className="font-bold" style={{ color: "var(--warn, #f39c12)" }}>
              {quarantinedCount} quarantined
            </span>
          </>
        )}
      </p>

      {/* Action bar: + New Skill, Install, Refresh */}
      <div className="flex items-center gap-2 mb-3">
        <button
          className="px-4 py-1.5 border border-accent bg-accent text-accent-fg cursor-pointer text-xs font-bold hover:bg-accent-hover hover:border-accent-hover mt-0"
          onClick={() => setState("skillCreateFormOpen", !skillCreateFormOpen)}
        >
          {skillCreateFormOpen ? "Cancel" : "+ New Skill"}
        </button>
        <button
          className="px-4 py-1.5 border border-accent bg-accent text-accent-fg cursor-pointer text-xs font-bold hover:bg-accent-hover hover:border-accent-hover mt-0"
          onClick={() => setInstallModalOpen(true)}
        >
          Install
        </button>
        <button
          className="px-3 py-1 border border-accent bg-accent text-accent-fg cursor-pointer text-xs hover:bg-accent-hover hover:border-accent-hover mt-0 ml-auto"
          onClick={() => refreshSkills()}
        >
          Refresh
        </button>
      </div>

      {/* Create form */}
      {skillCreateFormOpen && (
        <section
          className="p-4 mb-3.5"
          style={{
            border: "1px solid var(--accent, #888)",
            borderRadius: "4px",
            background: "var(--bg-accent, rgba(255,255,255,0.03))",
          }}
        >
          <div className="font-bold text-sm mb-3">Create New Skill</div>
          <div className="flex flex-col gap-2.5">
            <div>
              <label className="block text-xs mb-1 text-muted">
                Skill Name{" "}
                <span style={{ color: "var(--danger, #e74c3c)" }}>*</span>
              </label>
              <input
                className="w-full p-2 px-3 border border-border bg-card text-[13px] box-border"
                placeholder="e.g. my-awesome-skill"
                value={skillCreateName}
                onChange={(e) => setState("skillCreateName", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && skillCreateName.trim()) void handleCreateSkill();
                }}
              />
            </div>
            <div>
              <label className="block text-xs mb-1 text-muted">Description</label>
              <input
                className="w-full p-2 px-3 border border-border bg-card text-[13px] box-border"
                placeholder="Brief description of what this skill does (optional)"
                value={skillCreateDescription}
                onChange={(e) => setState("skillCreateDescription", e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && skillCreateName.trim()) void handleCreateSkill();
                }}
              />
            </div>
            <div className="flex gap-2 justify-end mt-1">
              <button
                className="px-4 py-1.5 border border-accent bg-accent text-accent-fg cursor-pointer text-xs hover:bg-accent-hover hover:border-accent-hover mt-0"
                onClick={() => {
                  setState("skillCreateFormOpen", false);
                  setState("skillCreateName", "");
                  setState("skillCreateDescription", "");
                }}
              >
                Cancel
              </button>
              <button
                className="px-4 py-1.5 border border-accent bg-accent text-accent-fg cursor-pointer text-xs font-bold hover:bg-accent-hover hover:border-accent-hover disabled:opacity-40 disabled:cursor-not-allowed mt-0"
                onClick={() => handleCreateSkill()}
                disabled={skillCreating || !skillCreateName.trim()}
              >
                {skillCreating ? "Creating..." : "Create Skill"}
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Skill cards */}
      {skills.length === 0 ? (
        <div className="text-center py-10 text-muted italic">
          No skills loaded yet.
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          {quarantinedOrBlocked.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              skillToggleAction={skillToggleAction}
              skillReviewId={skillReviewId}
              skillReviewReport={skillReviewReport}
              skillReviewLoading={skillReviewLoading}
              onToggle={handleSkillToggle}
              onOpen={handleOpenSkill}
              onDelete={handleDeleteSkill}
              onReview={handleReviewSkill}
              onAcknowledge={handleAcknowledgeSkill}
              onDismissReview={handleDismissReview}
            />
          ))}
          {normal.map((skill) => (
            <SkillCard
              key={skill.id}
              skill={skill}
              skillToggleAction={skillToggleAction}
              skillReviewId={skillReviewId}
              skillReviewReport={skillReviewReport}
              skillReviewLoading={skillReviewLoading}
              onToggle={handleSkillToggle}
              onOpen={handleOpenSkill}
              onDelete={handleDeleteSkill}
              onReview={handleReviewSkill}
              onAcknowledge={handleAcknowledgeSkill}
              onDismissReview={handleDismissReview}
            />
          ))}
        </div>
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
