import { client } from "@milady/app-core/api";
import { Button } from "@milady/ui";
import { useCallback, useEffect, useState } from "react";
import { useApp } from "../AppContext";
import { useTimeout } from "../hooks/useTimeout";
import { ConfigSaveFooter } from "./ConfigSaveFooter";

type AgentTab = "claude" | "gemini" | "codex" | "aider";
type AiderProvider = "anthropic" | "openai" | "google";
type ApprovalPreset = "readonly" | "standard" | "permissive" | "autonomous";
type AgentSelectionStrategy = "fixed" | "ranked";

const APPROVAL_PRESETS: {
  value: ApprovalPreset;
  label: string;
  desc: string;
}[] = [
  { value: "readonly", label: "Read Only", desc: "Read-only tools only" },
  {
    value: "standard",
    label: "Standard",
    desc: "Read + write, asks for shell/network",
  },
  {
    value: "permissive",
    label: "Permissive",
    desc: "File ops auto-approved, asks for shell",
  },
  { value: "autonomous", label: "Autonomous", desc: "All tools auto-approved" },
];

interface ModelOption {
  value: string;
  label: string;
}

// Maps agent tabs (and aider providers) to the provider IDs used by /api/models
const AGENT_PROVIDER_MAP: Record<AgentTab, string> = {
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
};

const ENV_PREFIX: Record<AgentTab, string> = {
  claude: "PARALLAX_CLAUDE",
  gemini: "PARALLAX_GEMINI",
  codex: "PARALLAX_CODEX",
  aider: "PARALLAX_AIDER",
};

export function CodingAgentSettingsSection() {
  const { setTimeout } = useTimeout();

  const [activeTab, setActiveTab] = useState<AgentTab>("claude");
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Model preferences stored by env var name
  const [prefs, setPrefs] = useState<Record<string, string>>({});
  const { t } = useApp();

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
        if (env.PARALLAX_DEFAULT_APPROVAL_PRESET)
          loaded.PARALLAX_DEFAULT_APPROVAL_PRESET =
            env.PARALLAX_DEFAULT_APPROVAL_PRESET;
        if (env.PARALLAX_AGENT_SELECTION_STRATEGY)
          loaded.PARALLAX_AGENT_SELECTION_STRATEGY =
            env.PARALLAX_AGENT_SELECTION_STRATEGY;
        if (env.PARALLAX_DEFAULT_AGENT_TYPE)
          loaded.PARALLAX_DEFAULT_AGENT_TYPE = env.PARALLAX_DEFAULT_AGENT_TYPE;
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
  }, [prefs, setTimeout]);

  // Resolve the provider ID for the current tab
  const getProviderId = (tab: AgentTab, aiderProv: AiderProvider): string => {
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
        {t("codingagentsettingssection.LoadingCodingAgent")}
      </div>
    );
  }

  const prefix = ENV_PREFIX[activeTab];
  const aiderProvider = (prefs.PARALLAX_AIDER_PROVIDER ||
    "anthropic") as AiderProvider;
  const providerId = getProviderId(activeTab, aiderProvider);
  const modelOptions = getModelOptions(providerId);
  const powerfulValue = prefs[`${prefix}_MODEL_POWERFUL`] ?? "";
  const fastValue = prefs[`${prefix}_MODEL_FAST`] ?? "";
  const isDynamic = !!providerModels[providerId];

  const approvalPreset = (prefs.PARALLAX_DEFAULT_APPROVAL_PRESET ||
    "permissive") as ApprovalPreset;
  const selectionStrategy = (prefs.PARALLAX_AGENT_SELECTION_STRATEGY ||
    "fixed") as AgentSelectionStrategy;
  const defaultAgentType = (prefs.PARALLAX_DEFAULT_AGENT_TYPE ||
    "claude") as AgentTab;

  return (
    <div className="flex flex-col gap-4">
      {/* Agent selection strategy */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold">
          {t("codingagentsettingssection.AgentSelectionStra")}
        </span>
        <select
          className="px-2.5 py-1.5 border border-border bg-card text-xs focus:border-accent focus:outline-none shadow-sm"
          value={selectionStrategy}
          onChange={(e) =>
            setPref("PARALLAX_AGENT_SELECTION_STRATEGY", e.target.value)
          }
        >
          <option value="fixed">{t("codingagentsettingssection.Fixed")}</option>
          <option value="ranked">
            {t("codingagentsettingssection.RankedAutoSelect")}
          </option>
        </select>
        <div className="text-[11px] text-[var(--muted)]">
          {selectionStrategy === "fixed"
            ? "Always use the selected default agent type when none is specified."
            : "Automatically select the best-performing installed agent based on success rate and stall metrics."}
        </div>
      </div>

      {/* Default agent type — only shown when strategy is "fixed" */}
      {selectionStrategy === "fixed" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold">
            {t("codingagentsettingssection.DefaultAgentType")}
          </span>
          <select
            className="px-2.5 py-1.5 border border-border bg-card text-xs focus:border-accent focus:outline-none shadow-sm"
            value={defaultAgentType}
            onChange={(e) =>
              setPref("PARALLAX_DEFAULT_AGENT_TYPE", e.target.value)
            }
          >
            <option value="claude">
              {t("codingagentsettingssection.Claude")}
            </option>
            <option value="gemini">
              {t("codingagentsettingssection.Gemini")}
            </option>
            <option value="codex">
              {t("codingagentsettingssection.Codex")}
            </option>
            <option value="aider">
              {t("codingagentsettingssection.Aider")}
            </option>
          </select>
          <div className="text-[11px] text-[var(--muted)]">
            {t("codingagentsettingssection.AgentUsedWhenNoE")}
          </div>
        </div>
      )}

      {/* Default approval preset — global, not per-agent */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-semibold">
          {t("codingagentsettingssection.DefaultPermissionL")}
        </span>
        <select
          className="px-2.5 py-1.5 border border-border bg-card text-xs focus:border-accent focus:outline-none shadow-sm"
          value={approvalPreset}
          onChange={(e) =>
            setPref("PARALLAX_DEFAULT_APPROVAL_PRESET", e.target.value)
          }
        >
          {APPROVAL_PRESETS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
        <div className="text-[11px] text-[var(--muted)]">
          {APPROVAL_PRESETS.find((p) => p.value === approvalPreset)?.desc ?? ""}
          {
            " — applies to all newly spawned agents unless overridden per-spawn."
          }
        </div>
      </div>

      {/* Agent tabs */}
      <div className="flex border border-border">
        {(["claude", "gemini", "codex", "aider"] as AgentTab[]).map((agent) => {
          const active = activeTab === agent;
          return (
            <Button
              key={agent}
              variant={active ? "default" : "ghost"}
              size="sm"
              className={`flex-1 h-9 px-3 py-2 text-xs font-semibold rounded-none border-r last:border-r-0 border-border ${
                active
                  ? "bg-accent text-accent-foreground"
                  : "text-muted hover:text-txt"
              }`}
              onClick={() => setActiveTab(agent)}
            >
              {AGENT_LABELS[agent]}
            </Button>
          );
        })}
      </div>

      {/* Aider provider selector */}
      {activeTab === "aider" && (
        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-semibold">
            {t("codingagentsettingssection.Provider")}
          </span>
          <select
            className="px-2.5 py-1.5 border border-border bg-card text-xs focus:border-accent focus:outline-none shadow-sm"
            value={aiderProvider}
            onChange={(e) => setPref("PARALLAX_AIDER_PROVIDER", e.target.value)}
          >
            <option value="anthropic">
              {t("codingagentsettingssection.Anthropic")}
            </option>
            <option value="openai">
              {t("codingagentsettingssection.OpenAI")}
            </option>
            <option value="google">
              {t("codingagentsettingssection.Google")}
            </option>
          </select>
        </div>
      )}

      {/* Model selectors — both use the same list, user picks tier preference */}
      <div className="flex gap-3">
        <div className="flex-1 flex flex-col gap-1.5">
          <span className="text-xs font-semibold">
            {t("codingagentsettingssection.PowerfulModel")}
          </span>
          <select
            className="px-2.5 py-1.5 border border-border bg-card text-xs focus:border-accent focus:outline-none shadow-sm"
            value={powerfulValue}
            onChange={(e) =>
              setPref(`${prefix}_MODEL_POWERFUL`, e.target.value)
            }
          >
            <option value="">{t("codingagentsettingssection.Default")}</option>
            {modelOptions.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 flex flex-col gap-1.5">
          <span className="text-xs font-semibold">
            {t("codingagentsettingssection.FastModel")}
          </span>
          <select
            className="px-2.5 py-1.5 border border-border bg-card text-xs focus:border-accent focus:outline-none shadow-sm"
            value={fastValue}
            onChange={(e) => setPref(`${prefix}_MODEL_FAST`, e.target.value)}
          >
            <option value="">{t("codingagentsettingssection.Default")}</option>
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
