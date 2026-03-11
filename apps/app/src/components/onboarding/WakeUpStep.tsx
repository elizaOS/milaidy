import { client } from "@milady/app-core/api";
import { useCallback, useRef, useState } from "react";
import { useApp } from "../../AppContext";

export function WakeUpStep() {
  const { handleOnboardingNext } = useApp();

  const [showImport, setShowImport] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPassword, setImportPassword] = useState("");
  const [importBusy, setImportBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);

  const importFileRef = useRef<HTMLInputElement>(null);
  const importBusyRef = useRef(false);

  const handleImportAgent = useCallback(async () => {
    if (importBusyRef.current || importBusy) return;
    if (!importFile) {
      setImportError("Select an export file before importing.");
      return;
    }
    if (!importPassword || importPassword.length < 4) {
      setImportError("Password must be at least 4 characters.");
      return;
    }
    try {
      importBusyRef.current = true;
      setImportBusy(true);
      setImportError(null);
      setImportSuccess(null);
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
  }, [importBusy, importFile, importPassword]);

  if (showImport) {
    return (
      <>
        <div className="onboarding-section-title">Import Agent</div>
        <div className="onboarding-divider">
          <div className="onboarding-divider-diamond" />
        </div>

        <p className="onboarding-desc" style={{ marginBottom: "16px" }}>
          Select an <code style={{ color: "#f0b90b" }}>.eliza-agent</code> export file and enter
          the decryption password.
        </p>

        <input
          ref={importFileRef}
          type="file"
          accept=".eliza-agent"
          onChange={(e) => {
            setImportFile(e.target.files?.[0] ?? null);
            setImportError(null);
          }}
          className="onboarding-input"
          style={{ fontSize: "13px", textAlign: "left", marginBottom: "12px" }}
        />

        <input
          type="password"
          placeholder="Decryption password..."
          value={importPassword}
          onChange={(e) => {
            setImportPassword(e.target.value);
            setImportError(null);
          }}
          className="onboarding-input"
          style={{ marginBottom: "12px" }}
        />

        {importError && (
          <p className="onboarding-desc" style={{ color: "rgba(255,100,100,0.8)", marginBottom: "8px" }}>
            {importError}
          </p>
        )}
        {importSuccess && (
          <p className="onboarding-desc" style={{ color: "rgba(100,255,100,0.8)", marginBottom: "8px" }}>
            {importSuccess}
          </p>
        )}

        <div className="onboarding-panel-footer">
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
            Cancel
          </button>
          <button
            className="onboarding-confirm-btn"
            disabled={importBusy || !importFile}
            onClick={() => void handleImportAgent()}
            type="button"
          >
            {importBusy ? "Importing..." : "Restore"}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="onboarding-section-title">Initialization</div>
      <div className="onboarding-divider">
        <div className="onboarding-divider-diamond" />
      </div>

      <div className="onboarding-question" style={{ fontSize: "32px", fontWeight: 400 }}>
        elizaOS
      </div>
      <p className="onboarding-desc">
        Your autonomous AI companion awaits.
      </p>

      <div className="onboarding-panel-footer">
        <button
          className="onboarding-back-link"
          onClick={() => setShowImport(true)}
          type="button"
        >
          Restore from Backup
        </button>
        <button
          className="onboarding-confirm-btn"
          onClick={() => handleOnboardingNext()}
          type="button"
        >
          Activate
        </button>
      </div>
    </>
  );
}
