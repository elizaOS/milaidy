import { useCallback, useEffect, useState } from "react";
import { client } from "../api-client";
import { ConfigSaveFooter } from "./ConfigSaveFooter";

type AgentTab = "claude" | "gemini" | "codex" | "aider" | "pi";
type ConfigurableAgentTab = Exclude<AgentTab, "pi">;
type AiderProvider = "anthropic" | "openai" | "google";

interface ModelOption {
  value: string;
  label: string;
}

// Maps agent tabs (and aider providers) to the provider IDs used by /api/models
const AGENT_PROVIDER_MAP: Record<ConfigurableAgentTab, string> = {
  claude: "anthropic",
  gemini: "google-genai",
  codex: "openai",
  aider: "anthropic", // overridden by aiderProvider
};

const AIDER_PROVIDER_MAP: Record<AiderProvider, string> = {
  anthropic: "anthropic",
  openai: "openai",
  google: "google-genai",
};

// Hardcoded fallbacks — only used when API fetch returns nothing
const FALLBACK_MODELS: Record<string, ModelOption[]> = {
  anthropic: [
    { value: "claude-opus-4-6", label: "Claude Opus 4.6" },
    { value: "claude-sonnet-4-6", label: "Claude Sonnet 4.6" },
    { value: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5" },
  ],
  "google-genai": [
    { value: "gemini-2.5-pro", label: "Gemini 2.5 Pro" },
    { value: "gemini-2.5-flash", label: "Gemini 2.5 Flash" },
  ],
  openai: [
    { value: "o3", label: "o3" },
    { value: "o4-mini", label: "o4-mini" },
    { value: "gpt-4o", label: "GPT-4o" },
  ],
};

const AGENT_LABELS: Record<AgentTab, string> = {
  claude: "Claude",
  gemini: "Gemini",
  codex: "Codex",
  aider: "Aider",
  pi: "Pi",
};

const ENV_PREFIX: Record<ConfigurableAgentTab, string> = {
  claude: "PARALLAX_CLAUDE",
  gemini: "PARALLAX_GEMINI",
  codex: "PARALLAX_CODEX",
  aider: "PARALLAX_AIDER",
};

export function CodingAgentSettingsSection() {
  const [activeTab, setActiveTab] = useState<AgentTab>("claude");
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Model preferences stored by env var name
  const [prefs, setPrefs] = useState<Record<string, string>>({});

  // Dynamic model lists keyed by provider ID (e.g. "anthropic" → ModelOption[])
  const [providerModels, setProviderModels] = useState<
    Record<string, ModelOption[]>
  >({});

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        // Fetch config + all three provider model lists in parallel
        const [cfg, anthropicRes, googleRes, openaiRes] = await Promise.all([
          client.getConfig(),
          client.fetchModels("anthropic", false).catch(() => null),
          client.fetchModels("google-genai", false).catch(() => null),
          client.fetchModels("openai", false).catch(() => null),
        ]);

        // Load saved preferences
        const env = (cfg.env ?? {}) as Record<string, string>;
        const loaded: Record<string, string> = {};
        for (const agent of ["CLAUDE", "GEMINI", "CODEX", "AIDER"] as const) {
          const p = `PARALLAX_${agent}`;
          if (env[`${p}_MODEL_POWERFUL`])
            loaded[`${p}_MODEL_POWERFUL`] = env[`${p}_MODEL_POWERFUL`];
          if (env[`${p}_MODEL_FAST`])
            loaded[`${p}_MODEL_FAST`] = env[`${p}_MODEL_FAST`];
        }
        if (env.PARALLAX_AIDER_PROVIDER)
          loaded.PARALLAX_AIDER_PROVIDER = env.PARALLAX_AIDER_PROVIDER;
        setPrefs(loaded);

        // Process fetched models — filter to "chat" category only
        const models: Record<string, ModelOption[]> = {};
        for (const [providerId, res] of [
          ["anthropic", anthropicRes],
          ["google-genai", googleRes],
          ["openai", openaiRes],
        ] as const) {
          if (
            res?.models &&
            Array.isArray(res.models) &&
            res.models.length > 0
          ) {
            const chatModels = (
              res.models as Array<{
                id: string;
                name: string;
                category: string;
              }>
            )
              .filter((m) => m.category === "chat")
              .map((m) => ({ value: m.id, label: m.name || m.id }));
            if (chatModels.length > 0) {
              models[providerId] = chatModels;
            }
          }
        }
        setProviderModels(models);
      } catch {
        // ignore — fallbacks will be used
      }
      setLoading(false);
    })();
  }, []);

  const setPref = useCallback((key: string, value: string) => {
    setPrefs((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);
    try {
      const envPatch: Record<string, string> = {};
      for (const [key, value] of Object.entries(prefs)) {
        if (value) envPatch[key] = value;
      }
      await client.updateConfig({ env: envPatch });
      setDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    }
    setSaving(false);
  }, [prefs]);

  // Resolve the provider ID for the current tab
  const getProviderId = (
    tab: ConfigurableAgentTab,
    aiderProv: AiderProvider,
  ): string => {
    if (tab === "aider") return AIDER_PROVIDER_MAP[aiderProv];
    return AGENT_PROVIDER_MAP[tab];
  };

  // Get model options — dynamic if available, fallback otherwise
  const getModelOptions = (providerId: string): ModelOption[] => {
    return providerModels[providerId] ?? FALLBACK_MODELS[providerId] ?? [];
  };

  if (loading) {
    return (
      <div className="py-4 text-center text-[var(--muted)] text-xs">
        Loading coding agent configuration...
      </div>
    );
  }

  const isPiTab = activeTab === "pi";
  const editableTab: ConfigurableAgentTab =
    activeTab === "pi" ? "claude" : activeTab;
  const prefix = ENV_PREFIX[editableTab];
  const aiderProvider = (prefs.PARALLAX_AIDER_PROVIDER ||
    "anthropic") as AiderProvider;
  const providerId = !isPiTab
    ? getProviderId(editableTab, aiderProvider)
    : undefined;
  const modelOptions = providerId ? getModelOptions(providerId) : [];
  const powerfulValue = prefs[`${prefix}_MODEL_POWERFUL`] ?? "";
  const fastValue = prefs[`${prefix}_MODEL_FAST`] ?? "";
  const isDynamic = providerId ? !!providerModels[providerId] : false;

  return (
    <div className="flex flex-col gap-4">
      {/* Agent tabs */}
      <div className="flex border border-[var(--border)]">
        {(["claude", "gemini", "codex", "aider", "pi"] as AgentTab[]).map(
          (agent) => {
            const active = activeTab === agent;
            return (
              <button
                key={agent}
                type="button"
                className={`flex-1 px-3 py-2 text-xs font-semibold cursor-pointer transition-colors border-r last:border-r-0 border-[var(--border)] ${
                  active
                    ? "bg-[var(--accent)] text-[var(--accent-foreground)]"
                    : "bg-[var(--card)] text-[var(--muted)] hover:text-[var(--text)]"
                }`}
                onClick={() => setActiveTab(agent)}
              >
                {AGENT_LABELS[agent]}
              </button>
            );
          },
        )}
      </div>

      {/* Aider provider selector */}
      {activeTab === "aider" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold">Provider</span>
          <select
            className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
            value={aiderProvider}
            onChange={(e) => setPref("PARALLAX_AIDER_PROVIDER", e.target.value)}
          >
            <option value="anthropic">Anthropic</option>
            <option value="openai">OpenAI</option>
            <option value="google">Google</option>
          </select>
        </div>
      )}

      {/* Model selectors — both use the same list, user picks tier preference */}
      {!isPiTab ? (
        <>
          <div className="flex gap-3">
            <div className="flex-1 flex flex-col gap-1.5">
              <span className="text-xs font-semibold">Powerful Model</span>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
                value={powerfulValue}
                onChange={(e) =>
                  setPref(`${prefix}_MODEL_POWERFUL`, e.target.value)
                }
              >
                <option value="">Default</option>
                {modelOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex-1 flex flex-col gap-1.5">
              <span className="text-xs font-semibold">Fast Model</span>
              <select
                className="px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none"
                value={fastValue}
                onChange={(e) =>
                  setPref(`${prefix}_MODEL_FAST`, e.target.value)
                }
              >
                <option value="">Default</option>
                {modelOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="text-[11px] text-[var(--muted)]">
            {isDynamic
              ? "Models fetched from provider API. These are preferences — the CLI may override based on availability."
              : "Using fallback model list — configure your API key to see all available models."}
          </div>
        </>
      ) : (
        <div className="text-[11px] text-[var(--muted)] border border-[var(--border)] bg-[var(--card)] p-3">
          Pi agent runs via the local <code>pi</code> CLI and uses your Pi
          environment/configuration. Model routing is managed by Pi directly.
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
