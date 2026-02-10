/**
 * Apps View — browse and launch agent games/experiences.
 *
 * Fetches apps from the registry API and shows them as cards.
 */

import { useState, useEffect, useCallback } from "react";
import { client, type RegistryAppInfo } from "../api-client";
import { useApp } from "../AppContext";

const DEFAULT_VIEWER_SANDBOX = "allow-scripts allow-same-origin allow-popups";

const CATEGORY_LABELS: Record<string, string> = {
  game: "Game",
  social: "Social",
  platform: "Platform",
  world: "World",
};

export function AppsView() {
  const { setState, setActionNotice } = useApp();
  const [apps, setApps] = useState<RegistryAppInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [busyApp, setBusyApp] = useState<string | null>(null);

  const loadApps = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await client.listApps();
      setApps(list);
    } catch (err) {
      setError(`Failed to load apps: ${err instanceof Error ? err.message : "network error"}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const clearActiveGameState = useCallback(() => {
    setState("activeGameApp", "");
    setState("activeGameDisplayName", "");
    setState("activeGameViewerUrl", "");
    setState("activeGameSandbox", DEFAULT_VIEWER_SANDBOX);
    setState("activeGamePostMessageAuth", false);
    setState("activeGamePostMessagePayload", null);
  }, [setState]);

  useEffect(() => {
    loadApps();
  }, [loadApps]);

  const handleLaunch = async (app: RegistryAppInfo) => {
    setBusyApp(app.name);
    try {
      const result = await client.launchApp(app.name);
      if (result.viewer?.url) {
        setState("activeGameApp", app.name);
        setState("activeGameDisplayName", app.displayName ?? app.name);
        setState("activeGameViewerUrl", result.viewer.url);
        setState("activeGameSandbox", result.viewer.sandbox ?? DEFAULT_VIEWER_SANDBOX);
        setState("activeGamePostMessageAuth", Boolean(result.viewer.postMessageAuth));
        setState("activeGamePostMessagePayload", result.viewer.authMessage ?? null);
        if (result.viewer.postMessageAuth && !result.viewer.authMessage) {
          setActionNotice(
            `${app.displayName ?? app.name} requires iframe auth, but no auth payload is configured.`,
            "error",
            4800,
          );
        }
        setState("tab", "game");
        return;
      }
      clearActiveGameState();
      const targetUrl = result.launchUrl ?? app.launchUrl;
      if (targetUrl) {
        const popup = window.open(targetUrl, "_blank", "noopener,noreferrer");
        if (popup) {
          setActionNotice(
            `${app.displayName ?? app.name} opened in a new tab.`,
            "success",
            2600,
          );
        } else {
          setActionNotice(
            `Popup blocked while opening ${app.displayName ?? app.name}. Allow popups and try again.`,
            "error",
            4200,
          );
        }
        return;
      }
      setActionNotice(
        `${app.displayName ?? app.name} launched, but no viewer or URL is configured.`,
        "error",
        4000,
      );
    } catch (err) {
      setActionNotice(
        `Failed to launch ${app.displayName ?? app.name}: ${err instanceof Error ? err.message : "error"}`,
        "error",
        4000,
      );
    } finally {
      setBusyApp(null);
    }
  };

  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filtered = apps.filter((app) => {
    if (!normalizedSearch) return true;
    return (
      app.name.toLowerCase().includes(normalizedSearch) ||
      (app.displayName ?? "").toLowerCase().includes(normalizedSearch) ||
      (app.description ?? "").toLowerCase().includes(normalizedSearch)
    );
  });

  return (
    <div>
      <div className="flex gap-2 mb-4">
        <input
          type="text"
          placeholder="Search apps..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="flex-1 px-3 py-2 border border-border rounded-md bg-card text-txt text-sm focus:border-accent focus:outline-none"
        />
        <button
          onClick={loadApps}
          className="px-3 py-1 text-xs bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover"
        >
          Refresh
        </button>
      </div>

      {error && (
        <div className="p-3 border border-danger text-danger text-xs mb-3">
          {error}
        </div>
      )}

      {loading ? (
        <div className="text-center py-10 text-muted italic">Loading apps...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 text-muted italic">{searchQuery ? "No apps match your search." : "No apps available."}</div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-3">
          {filtered.map((app) => (
            <div
              key={app.name}
              className="border border-border p-4 bg-card flex flex-col gap-2"
            >
              <div className="flex justify-between items-center">
                <div className="font-bold text-sm">{app.displayName ?? app.name}</div>
                {app.category && (
                  <span className="text-[10px] px-1.5 py-0.5 border border-border text-muted">
                    {CATEGORY_LABELS[app.category] ?? app.category}
                  </span>
                )}
              </div>
              <div className="text-xs text-muted flex-1">{app.description ?? "No description"}</div>
              <button
                className="text-xs px-3.5 py-1.5 bg-accent text-accent-fg border border-accent cursor-pointer hover:bg-accent-hover self-start disabled:opacity-40 disabled:cursor-not-allowed"
                disabled={busyApp === app.name}
                onClick={() => handleLaunch(app)}
              >
                {busyApp === app.name ? "Launching..." : "Launch"}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
