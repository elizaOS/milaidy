import { STYLE_PRESETS } from "@miladyai/app-core/onboarding-presets";
import { getVrmPreviewUrl, useApp } from "@miladyai/app-core/state";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CharacterRoster,
  type CharacterRosterEntry,
  resolveRosterEntries,
} from "../CharacterRoster";

/* ── Hardcoded frontend presets — no server needed ─────────────── */

const FRONTEND_PRESETS = resolveRosterEntries(STYLE_PRESETS);

export function IdentityStep() {
  const { onboardingStyle, handleOnboardingNext, setState, t } = useApp();

  const entries = FRONTEND_PRESETS;
  const selectedId = onboardingStyle || entries[0]?.catchphrase || "";

  /* ── Import / restore state ─────────────────────────────────────── */
  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const importBusyRef = useRef(false);

  const handleSelect = useCallback(
    (entry: CharacterRosterEntry) => {
      setState("onboardingStyle", entry.catchphrase ?? entry.id);
      setState("onboardingName", entry.name);
      setState("selectedVrmIndex", entry.avatarIndex);
    },
    [setState],
  );

  // Auto-select the first one if nothing is selected yet
  useEffect(() => {
    const firstEntry = entries[0];
    if (!onboardingStyle && firstEntry) {
      handleSelect(firstEntry);
    }
  }, [onboardingStyle, entries, handleSelect]);

  const handleImportAgent = useCallback(async () => {
    if (importBusyRef.current || importBusy) return;
    if (!importFile) {
      setImportError(t("onboarding.selectFileError"));
      return;
    }
    if (!importPassword || importPassword.length < 4) {
      setImportError(t("onboarding.passwordMinError"));
      return;
    }
    try {
      importBusyRef.current = true;
      setImportBusy(true);
      setImportError(null);
      setImportSuccess(null);
      // Dynamic import to avoid hard dependency on client when server is absent
      const { client } = await import("@miladyai/app-core/api");
      const fileBuffer = await importFile.arrayBuffer();
      const result = await client.importAgent(importPassword, fileBuffer);
      const counts = result.counts;
      const summary = [
        counts.memories ? `${counts.memories} memories` : null,
        counts.entities ? `${counts.entities} entities` : null,
        counts.rooms ? `${counts.rooms} rooms` : null,
      ]
        .filter(Boolean)
        .join(", ");
      setImportSuccess(
        `Imported "${result.agentName}" successfully${summary ? `: ${summary}` : ""}. Restarting...`,
      );
      setImportPassword("");
      setImportFile(null);
      setTimeout(() => {
        window.location.reload();
      }, 2000);
    } catch (err) {
      setImportError(err instanceof Error ? err.message : "Import failed");
    } finally {
      importBusyRef.current = false;
      setImportBusy(false);
    }
  }, [importBusy, importFile, importPassword, t]);

  /* ── Import UI ──────────────────────────────────────────────────── */
  if (showImport) {
    return (
      <div className="flex flex-col items-center gap-3 w-full max-w-[400px]">
        <div className="onboarding-section-title">
          {t("settings.importAgent")}
        </div>
        <div className="onboarding-divider">
          <div className="onboarding-divider-diamond" />
        </div>

        <p className="onboarding-desc mb-1">{t("onboarding.importDesc")}</p>

        <input
          type="file"
          accept=".eliza-agent"
          onChange={(e) => {
            setImportFile(e.target.files?.[0] ?? null);
            setImportError(null);
          }}
          className="onboarding-input text-[13px] text-left"
        />

        <input
          type="password"
          placeholder={t("onboarding.decryptionPasswordPlaceholder")}
          value={importPassword}
          onChange={(e) => {
            setImportPassword(e.target.value);
            setImportError(null);
          }}
          className="onboarding-input"
        />

        {importError && (
          <p className="onboarding-desc text-[var(--danger)] !mb-0">
            {importError}
          </p>
        )}
        {importSuccess && (
          <p className="onboarding-desc text-[var(--ok)] !mb-0">
            {importSuccess}
          </p>
        )}

        <div className="flex gap-3 mt-2">
          <button
            className="onboarding-back-link"
            onClick={() => {
              setShowImport(false);
              setImportError(null);
              setImportSuccess(null);
              setImportFile(null);
              setImportPassword("");
            }}
            type="button"
          >
            {t("common.cancel")}
          </button>
          <button
            className="onboarding-confirm-btn"
            disabled={importBusy || !importFile}
            onClick={() => void handleImportAgent()}
            type="button"
          >
            {importBusy ? t("onboarding.importing") : t("onboarding.restore")}
          </button>
        </div>
      </div>
    );
  }

  /* ── Overwatch-style character select — full-width bottom bar ──── */
  const selected = entries.find((e) => e.catchphrase === selectedId);

  return (
    <div className="ob-identity">
      {/* Selected character info — floats above the roster */}
      <div className="ob-identity-info">
        <div className="ob-identity-name">{selected?.name ?? ""}</div>
      </div>

      {/* ── Roster bar ── */}
      <div className="ob-identity-roster border-t border-white/5 bg-black/50 p-4 pb-8 backdrop-blur-md">
        <CharacterRoster
          entries={entries}
          selectedId={selectedId}
          onSelect={handleSelect}
          variant="onboarding"
          testIdPrefix="onboarding"
        />
      </div>

      {/* ── Actions row ── */}
      <div className="ob-identity-actions">
        <button
          className="onboarding-confirm-btn"
          onClick={() => handleOnboardingNext()}
          type="button"
        >
          Continue
        </button>
        <button
          type="button"
          onClick={() => setShowImport(true)}
          className="ob-identity-restore"
        >
          {t("onboarding.restoreFromBackup")}
        </button>
      </div>
    </div>
  );
}
