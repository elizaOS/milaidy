import { useCallback, useEffect, useState } from "react";
import { client } from "../api-client";
import { ConfigSaveFooter } from "./ConfigSaveFooter";

export function GitHubSettingsSection() {
  const [tokenConfigured, setTokenConfigured] = useState(false);
  const [oauthAvailable, setOauthAvailable] = useState(false);
  const [newToken, setNewToken] = useState("");
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const cfg = await client.getConfig();
        const env = (cfg.env ?? {}) as Record<string, unknown>;
        setTokenConfigured(!!env.GITHUB_TOKEN);
        setOauthAvailable(!!env.GITHUB_OAUTH_CLIENT_ID);
      } catch {
        // ignore — section stays in "not configured" state
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      await client.updateConfig({ env: { GITHUB_TOKEN: newToken } });
      setTokenConfigured(true);
      setNewToken("");
      setDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    }
    setSaving(false);
  }, [newToken]);

  if (loading) {
    return (
      <div className="py-4 text-center text-[var(--muted)] text-xs">
        Loading GitHub configuration...
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {/* Status badge */}
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-[var(--muted)]">
          Personal Access Token:
        </span>
        <span
          className={`ml-auto text-[10px] px-2 py-0.5 border ${
            tokenConfigured
              ? "border-green-600 text-green-600"
              : "border-[var(--muted)] text-[var(--muted)]"
          }`}
        >
          {tokenConfigured ? "Configured" : "Not Configured"}
        </span>
      </div>

      {/* Token input */}
      <div className="flex flex-col gap-1.5">
        <input
          type="password"
          className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
          placeholder={
            tokenConfigured
              ? "Token set — enter new value to replace"
              : "ghp_... (paste your Personal Access Token)"
          }
          value={newToken}
          onChange={(e) => {
            setNewToken(e.target.value);
            setDirty(e.target.value.length > 0);
          }}
        />
        <div className="text-[11px] text-[var(--muted)]">
          Generate a token at{" "}
          <a
            href="https://github.com/settings/tokens"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-[var(--accent)]"
          >
            github.com/settings/tokens
          </a>{" "}
          with <code className="text-[10px]">repo</code> scope.
        </div>
      </div>

      {/* OAuth note */}
      {oauthAvailable && (
        <div className="text-[11px] text-[var(--muted)] border border-[var(--border)] bg-[var(--bg-muted)] px-2.5 py-2">
          OAuth is also available as a fallback when a GitHub OAuth Client ID is
          configured.
        </div>
      )}

      <ConfigSaveFooter
        dirty={dirty}
        saving={saving}
        saveError={saveError}
        saveSuccess={saveSuccess}
        onSave={() => void handleSave()}
      />
    </div>
  );
}
