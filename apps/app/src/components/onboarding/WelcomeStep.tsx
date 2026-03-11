import { client } from "@milady/app-core/api";
import { Cpu, Globe, Shield, Sparkles, UploadCloud } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { useApp } from "../../AppContext";

export function WelcomeStep() {
  const { t } = useApp();

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
      // Reload after short delay to let user see success message
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

  return (
    <div className="max-w-[800px] mx-auto mt-24 text-center font-body px-8 animate-in fade-in slide-in-from-bottom-8 duration-1000 ease-out">
      {/* Visual Identity */}
      <div className="mb-12 flex justify-center scale-110">
        <div className="relative group">
          <div className="absolute inset-0 bg-accent/30 blur-3xl rounded-full opacity-40 group-hover:opacity-70 transition-opacity duration-1000" />
          <div className="bg-card border border-border/50 p-6 rounded-[2.5rem] shadow-2xl relative z-10 backdrop-blur-sm group-hover:border-accent/30 transition-colors duration-500">
            <div className="bg-accent/10 p-4 rounded-2xl ring-1 ring-accent/20">
              <Sparkles className="w-10 h-10 text-accent" />
            </div>
          </div>

          {/* Subtle floating bits */}
          <div className="absolute -top-4 -right-4 bg-card border border-border/50 p-2.5 rounded-2xl shadow-xl z-20 animate-bounce [animation-duration:3s]">
            <Cpu className="w-4 h-4 text-accent/60" />
          </div>
          <div className="absolute -bottom-2 -left-6 bg-card border border-border/50 p-2 rounded-2xl shadow-xl z-20 animate-pulse [animation-duration:4s]">
            <Globe className="w-4 h-4 text-accent/60" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="space-y-6">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-accent/5 border border-accent/10 text-[10px] uppercase tracking-[0.2em] font-bold text-accent mb-2">
          <Shield className="w-3 h-3" />
          Secure Autonomous Environment
        </div>
        <h1 className="text-6xl font-bold tracking-tight text-txt-strong bg-clip-text text-transparent bg-gradient-to-b from-txt-strong via-txt-strong to-txt-strong/40 pb-1">
          elizaOS
        </h1>
        <p className="text-xl text-muted/70 max-w-lg mx-auto leading-relaxed font-light">
          Experience the next generation of autonomous orchestration. Connect
          your workforce, automate your world.
        </p>
      </div>

      {/* Actions */}
      <div className="mt-20 flex flex-col items-center gap-8">
        {!showImport ? (
          <button
            type="button"
            className="group flex items-center gap-3 text-sm text-muted/40 hover:text-accent transition-all cursor-pointer bg-transparent border-none py-3 px-8 rounded-full hover:bg-accent/5 hover:backdrop-blur-sm border border-transparent hover:border-accent/10 shadow-sm hover:shadow-accent/5"
            onClick={() => setShowImport(true)}
          >
            <UploadCloud className="w-4 h-4 group-hover:translate-y-[-1px] transition-transform" />
            <span className="font-semibold tracking-[0.05em]">
              {t("onboardingwizard.restoreFromBackup")}
            </span>
          </button>
        ) : (
          <div className="w-full max-w-md border border-border/40 bg-card/40 backdrop-blur-2xl rounded-[2rem] p-8 text-left ring-1 ring-white/5 shadow-[0_32px_64px_-12px_rgba(0,0,0,0.5)] animate-in zoom-in-95 slide-in-from-top-4 duration-500">
            <div className="flex justify-between items-center mb-6">
              <div className="font-bold text-base text-txt-strong flex items-center gap-3">
                <div className="p-2 bg-accent/10 rounded-lg">
                  <UploadCloud className="w-5 h-5 text-accent" />
                </div>
                {t("onboardingwizard.ImportAgent")}
              </div>
              <button
                type="button"
                className="text-xs text-muted hover:text-txt transition-colors cursor-pointer bg-transparent border-none font-medium px-2 py-1"
                onClick={() => {
                  setShowImport(false);
                  setImportError(null);
                  setImportSuccess(null);
                  setImportFile(null);
                  setImportPassword("");
                }}
              >
                {t("onboardingwizard.cancel")}
              </button>
            </div>

            <div className="text-xs text-muted/60 mb-6 leading-relaxed bg-white/5 p-4 rounded-2xl border border-white/5">
              {t("onboardingwizard.SelectAn")}{" "}
              <code className="text-accent font-mono font-bold">
                .eliza-agent
              </code>{" "}
              {t("onboardingwizard.exportFileAndEnte")}
            </div>

            <div className="flex flex-col gap-5">
              <div className="relative">
                <input
                  ref={importFileRef}
                  type="file"
                  accept=".eliza-agent"
                  onChange={(e) => {
                    setImportFile(e.target.files?.[0] ?? null);
                    setImportError(null);
                  }}
                  className="w-full text-xs text-muted/70 file:mr-4 file:py-2.5 file:px-5 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-accent file:text-accent-fg hover:file:bg-accent-hover transition-all cursor-pointer"
                />
              </div>

              <div className="relative group">
                <input
                  type="password"
                  placeholder={t("onboardingwizard.DecryptionPassword")}
                  value={importPassword}
                  onChange={(e) => {
                    setImportPassword(e.target.value);
                    setImportError(null);
                  }}
                  className="w-full px-5 py-3.5 border border-border/30 bg-bg/40 text-sm font-mono focus:border-accent/40 focus:ring-4 focus:ring-accent/5 outline-none rounded-2xl transition-all placeholder:text-muted/30"
                />
              </div>

              {importError && (
                <div className="text-xs text-red-400/90 font-semibold px-2 flex items-center gap-2 animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-400" />
                  {importError}
                </div>
              )}
              {importSuccess && (
                <div className="text-xs text-green-400/90 font-semibold px-2 flex items-center gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-400" />
                  {importSuccess}
                </div>
              )}

              <button
                type="button"
                className="w-full py-4 px-6 bg-accent text-accent-fg hover:bg-accent-hover text-sm font-black rounded-2xl shadow-xl shadow-accent/20 transition-all active:scale-[0.98] disabled:opacity-40 disabled:grayscale disabled:cursor-not-allowed mt-2 uppercase tracking-widest"
                disabled={importBusy || !importFile}
                onClick={() => void handleImportAgent()}
              >
                {importBusy ? "Importing..." : "Initialize Restore"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
