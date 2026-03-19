/**
 * Full-width character editor — replaces the narrow notebook-style CharacterView.
 *
 * Two-panel layout: left panel has roster + identity + bio + system prompt,
 * right panel has style rules + examples. Footer has voice + save + reset.
 */

import { client } from "@elizaos/app-core/api";
import {
  APP_EMOTE_EVENT,
  dispatchWindowEvent,
  VOICE_CONFIG_UPDATED_EVENT,
} from "@elizaos/app-core/events";
import { useApp } from "@elizaos/app-core/state";
import { PREMADE_VOICES } from "@elizaos/app-core/voice";
import { Button, Input, Textarea, ThemedSelect } from "@elizaos/ui";
import {
  normalizeCharacterVoiceLocale,
  STYLE_PRESETS,
} from "../../../../src/onboarding-presets";
import {
  CharacterRoster,
  type CharacterRosterEntry,
  resolveRosterEntries,
} from "./CharacterRoster";

/* Inline SVG icon helpers – avoids adding lucide-react as a dependency. */
const svgBase = {
  xmlns: "http://www.w3.org/2000/svg",
  width: 24,
  height: 24,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};
const Icon = ({ className, d }: { className?: string; d: string }) => (
  <svg {...svgBase} className={className} aria-hidden="true">
    <path d={d} />
  </svg>
);
const _Lock = ({ className }: { className?: string }) => (
  <svg {...svgBase} className={className} aria-hidden="true">
    <rect width="18" x="3" y="11" height="11" rx="2" ry="2" />
    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

const RotateCcw = ({ className }: { className?: string }) => (
  <Icon className={className} d="M1 4v6h6M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
);
const Volume2 = ({ className }: { className?: string }) => (
  <svg {...svgBase} className={className} aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);
const VolumeX = ({ className }: { className?: string }) => (
  <svg {...svgBase} className={className} aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

import {
  type ChangeEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useState,
} from "react";
import "./CharacterEditor.css";

/* ── Constants ─────────────────────────────────────────────────────── */

const DEFAULT_ELEVEN_FAST_MODEL = "eleven_flash_v2_5";
const ELEVENLABS_LANGUAGE_CODE_BY_LOCALE: Record<string, string> = {
  en: "en",
  "zh-CN": "zh",
  ja: "ja",
  es: "es",
};
const STYLE_SECTION_KEYS = ["all", "chat", "post"] as const;
const STYLE_SECTION_PLACEHOLDERS: Record<string, string> = {
  all: "Add shared rule",
  chat: "Add chat rule",
  post: "Add post rule",
};
const STYLE_SECTION_EMPTY_STATES: Record<string, string> = {
  all: "No shared rules yet.",
  chat: "No chat rules yet.",
  post: "No post rules yet.",
};

const VOICE_SELECT_GROUPS = [
  {
    label: "Female",
    items: PREMADE_VOICES.filter((p) => p.gender === "female").map((p) => ({
      id: p.id,
      text: p.name,
    })),
  },
  {
    label: "Male",
    items: PREMADE_VOICES.filter((p) => p.gender === "male").map((p) => ({
      id: p.id,
      text: p.name,
    })),
  },
  {
    label: "Character",
    items: PREMADE_VOICES.filter((p) => p.gender === "character").map((p) => ({
      id: p.id,
      text: p.name,
    })),
  },
];

/* ── Helpers ───────────────────────────────────────────────────────── */

interface OnboardingPreset {
  catchphrase: string;
  bio: string[];
  system: string;
  adjectives: string[];
  style: { all: string[]; chat: string[]; post: string[] };
  messageExamples: Array<Array<{ user: string; content: { text: string } }>>;
  postExamples: string[];
}

function replaceCharacterToken(value: string, name: string) {
  return value.replaceAll("{{name}}", name).replaceAll("{{agentName}}", name);
}

function getUiLanguage(): string {
  if (typeof window === "undefined") return "en";
  const fromStorage = window.localStorage.getItem("milady:ui-language");
  if (fromStorage) return fromStorage;
  return window.navigator.language || "en";
}

function getElevenLabsLanguageCode(locale: string): string {
  const normalized = normalizeCharacterVoiceLocale(locale);
  return ELEVENLABS_LANGUAGE_CODE_BY_LOCALE[normalized] ?? "en";
}

function buildCharacterDraftFromPreset(entry: CharacterRosterEntry) {
  const p = entry.preset as OnboardingPreset;
  const name = entry.name;
  return {
    name,
    username: name,
    bio: p.bio.map((l: string) => replaceCharacterToken(l, name)).join("\n"),
    system: replaceCharacterToken(p.system, name),
    adjectives: [...p.adjectives],
    style: {
      all: [...p.style.all],
      chat: [...p.style.chat],
      post: [...p.style.post],
    },
    messageExamples: p.messageExamples.map((convo) => ({
      examples: convo.map((msg) => ({
        name:
          msg.user === "{{agentName}}"
            ? name
            : replaceCharacterToken(msg.user, name),
        content: { text: replaceCharacterToken(msg.content.text, name) },
      })),
    })),
    postExamples: p.postExamples.map((ex: string) =>
      replaceCharacterToken(ex, name),
    ),
  };
}

/* ── Component ─────────────────────────────────────────────────────── */

export function CharacterEditor({
  sceneOverlay: _sceneOverlay = false,
  inModal: _inModal = false,
}: {
  sceneOverlay?: boolean;
  inModal?: boolean;
} = {}) {
  const {
    tab,
    setTab,
    characterData,
    characterDraft,
    characterLoading,
    characterSaving,
    characterSaveSuccess,
    characterSaveError,
    handleCharacterFieldInput,
    handleCharacterArrayInput,
    handleCharacterStyleInput,
    handleSaveCharacter,
    loadCharacter,
    setState,
    onboardingOptions,
    selectedVrmIndex: _selectedVrmIndex,
    t: _t,
    registryStatus: _registryStatus,
    registryLoading: _registryLoading,
    registryRegistering: _registryRegistering,
    registryError: _registryError,
    dropStatus: _dropStatus,
    loadRegistryStatus,
    registerOnChain: _registerOnChain,
    syncRegistryProfile: _syncRegistryProfile,
    loadDropStatus,
    walletConfig: _walletConfig,
  } = useApp();

  useEffect(() => {
    void loadCharacter();
    void loadRegistryStatus();
    void loadDropStatus();
  }, [loadCharacter, loadRegistryStatus, loadDropStatus]);

  const handleFieldEdit = useCallback(
    (field: string, value: unknown) => {
      // biome-ignore lint/suspicious/noExplicitAny: typed field key interop
      handleCharacterFieldInput(field as any, value as any);
    },
    [handleCharacterFieldInput],
  );

  const handleStyleEdit = useCallback(
    (key: string, value: string) => {
      // biome-ignore lint/suspicious/noExplicitAny: typed field key interop
      handleCharacterStyleInput(key as any, value);
    },
    [handleCharacterStyleInput],
  );

  /* ── Generation ─────────────────────────────────────────────────── */
  const [generating, setGenerating] = useState<string | null>(null);
  const [mobilePage, setMobilePage] = useState<
    "identity" | "style" | "examples"
  >("identity");
  const [rightTab, setRightTab] = useState<"style" | "examples">("style");
  const [customizing, setCustomizing] = useState(false);

  // Sync rightTab with mobilePage on mobile
  useEffect(() => {
    if (mobilePage === "style") setRightTab("style");
    else if (mobilePage === "examples") setRightTab("examples");
  }, [mobilePage]);

  /* ── Style entry state ──────────────────────────────────────────── */
  const [pendingStyleEntries, setPendingStyleEntries] = useState<
    Record<string, string>
  >({ all: "", chat: "", post: "" });
  const [styleEntryDrafts, setStyleEntryDrafts] = useState<
    Record<string, string[]>
  >({ all: [], chat: [], post: [] });

  /* ── Roster state ───────────────────────────────────────────────── */
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null,
  );
  const [rosterStyles, setRosterStyles] = useState<OnboardingPreset[]>(
    // biome-ignore lint/suspicious/noExplicitAny: onboardingOptions is untyped API response
    (onboardingOptions as any)?.styles ?? [],
  );

  /* ── Voice config state ─────────────────────────────────────────── */
  type VoiceConfig = Record<
    string,
    Record<string, string> | string | undefined
  >;
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({});
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceSaveError, setVoiceSaveError] = useState<string | null>(null);
  const [voiceTesting, setVoiceTesting] = useState(false);
  const [voiceTestAudio] = useState<HTMLAudioElement | null>(null);
  const [selectedVoicePresetId, setSelectedVoicePresetId] = useState<
    string | null
  >(null);
  const [voiceSelectionLocked] = useState(false);

  /* ── Load roster ────────────────────────────────────────────────── */
  // Use static STYLE_PRESETS shipped in the frontend bundle — no API call
  // needed. If the server provides styles via onboardingOptions, prefer those.
  useEffect(() => {
    // biome-ignore lint/suspicious/noExplicitAny: onboardingOptions is untyped API response
    if ((onboardingOptions as any)?.styles?.length) {
      // biome-ignore lint/suspicious/noExplicitAny: onboardingOptions is untyped API response
      setRosterStyles((onboardingOptions as any).styles);
    } else {
      // biome-ignore lint/suspicious/noExplicitAny: STYLE_PRESETS needs cast to OnboardingPreset[]
      setRosterStyles(STYLE_PRESETS as any);
    }
    // biome-ignore lint/suspicious/noExplicitAny: onboardingOptions is untyped API response
  }, [(onboardingOptions as any)?.styles]);

  const characterRoster = resolveRosterEntries(rosterStyles);

  const d = characterDraft;
  const bioText =
    typeof d.bio === "string"
      ? d.bio
      : Array.isArray(d.bio)
        ? (d.bio as string[]).join("\n")
        : "";

  const hasCharacterContent = (c: unknown) =>
    Boolean(c && Object.keys(c as Record<string, unknown>).length > 0);
  const currentCharacter = hasCharacterContent(characterDraft)
    ? characterDraft
    : characterData;

  /* ── Resolve active roster entry ────────────────────────────────── */
  const activeCharacterRosterEntry: CharacterRosterEntry | null = (() => {
    if (selectedCharacterId) {
      const found = characterRoster.find((e) => e.id === selectedCharacterId);
      if (found) return found;
    }
    if (!currentCharacter) return null;
    const currentName =
      typeof currentCharacter.name === "string"
        ? currentCharacter.name.trim()
        : "";
    const byName = characterRoster.find((e) => e.name === currentName);
    if (byName) return byName;
    return characterRoster[0] ?? null;
  })();

  /* ── Load voice config on mount ─────────────────────────────────── */
  useEffect(() => {
    void (async () => {
      setVoiceLoading(true);
      try {
        const cfg = await client.getConfig();
        type TtsConfig = Record<string, Record<string, string> | undefined>;
        type MessagesConfig = { tts?: TtsConfig };
        const messages = cfg.messages as MessagesConfig | undefined;
        const tts = messages?.tts;
        if (tts) {
          setVoiceConfig(tts);
          if (tts.elevenlabs?.voiceId) {
            const preset = PREMADE_VOICES.find(
              (p) => p.voiceId === tts.elevenlabs?.voiceId,
            );
            setSelectedVoicePresetId(preset?.id ?? null);
          }
        }
      } catch {}
      setVoiceLoading(false);
    })();
  }, []);

  /* ── Voice helpers ──────────────────────────────────────────────── */
  const handleSelectPreset = useCallback(
    (preset: (typeof PREMADE_VOICES)[0]) => {
      const languageCode = getElevenLabsLanguageCode(getUiLanguage());
      setSelectedVoicePresetId(preset.id);
      setVoiceConfig((prev) => {
        const prevElevenlabs =
          typeof prev.elevenlabs === "object" && prev.elevenlabs
            ? (prev.elevenlabs as Record<string, string>)
            : {};
        return {
          ...prev,
          elevenlabs: {
            ...prevElevenlabs,
            voiceId: preset.voiceId,
            languageCode,
          },
        };
      });
    },
    [],
  );

  const applyVoicePresetForEntry = useCallback(
    (entry: CharacterRosterEntry) => {
      setVoiceSaveError(null);
      const languageCode = getElevenLabsLanguageCode(getUiLanguage());
      const selectedVoiceId = entry.elevenlabsVoiceId;
      if (selectedVoiceId) {
        const mappedPreset = PREMADE_VOICES.find(
          (p) => p.voiceId === selectedVoiceId,
        );
        setSelectedVoicePresetId(mappedPreset?.id ?? null);
        setVoiceConfig((prev) => {
          const prevElevenlabs =
            typeof prev.elevenlabs === "object" && prev.elevenlabs
              ? (prev.elevenlabs as Record<string, string>)
              : {};
          return {
            ...prev,
            elevenlabs: {
              ...prevElevenlabs,
              voiceId: selectedVoiceId,
              languageCode,
            },
          };
        });
        return;
      }
      if (!entry.voicePresetId) return;
      const voicePreset = PREMADE_VOICES.find(
        (p) => p.id === entry.voicePresetId,
      );
      if (voicePreset) handleSelectPreset(voicePreset);
    },
    [handleSelectPreset],
  );

  /* ── Character defaults ─────────────────────────────────────────── */
  const applyCharacterDefaults = useCallback(
    (entry: CharacterRosterEntry) => {
      const next = buildCharacterDraftFromPreset(entry);
      handleFieldEdit("name", next.name ?? "");
      handleFieldEdit("username", next.username ?? "");
      handleFieldEdit("bio", next.bio ?? "");
      handleFieldEdit("system", next.system ?? "");
      handleFieldEdit("adjectives", next.adjectives ?? []);
      handleFieldEdit("style", next.style ?? { all: [], chat: [], post: [] });
      handleFieldEdit("messageExamples", next.messageExamples ?? []);
      handleFieldEdit("postExamples", next.postExamples ?? []);
    },
    [handleFieldEdit],
  );

  const commitCharacterSelection = useCallback(
    (entry: CharacterRosterEntry, applyDefaults: boolean) => {
      const isNewCharacter = selectedCharacterId !== entry.id;
      setSelectedCharacterId(entry.id);
      setState("selectedVrmIndex", entry.avatarIndex);
      if (!voiceSelectionLocked && isNewCharacter) {
        applyVoicePresetForEntry(entry);
      }
      if (applyDefaults) {
        applyCharacterDefaults(entry);
      }
      // Play emote and speak catchphrase on character switch
      if (isNewCharacter && entry.catchphrase) {
        // Dispatch a wave emote after the VRM swaps in
        setTimeout(() => {
          dispatchWindowEvent(APP_EMOTE_EVENT, {
            emoteId: "wave",
            path: "/animations/emotes/waving-both-hands.glb",
            duration: 2.5,
            loop: false,
            showOverlay: false,
          });
        }, 800);
        // Speak the catchphrase via TTS
        void client.streamVoiceSpeak(entry.catchphrase).catch((err) => {
          const message =
            err instanceof Error ? err.message : "Voice preview failed.";
          setVoiceSaveError(message);
        });
      }
    },
    [
      applyCharacterDefaults,
      applyVoicePresetForEntry,
      selectedCharacterId,
      setState,
      voiceSelectionLocked,
    ],
  );

  /* ── Select character from roster ───────────────────────────────── */
  const handleSelectCharacter = useCallback(
    (entry: CharacterRosterEntry) => {
      commitCharacterSelection(entry, true);
    },
    [commitCharacterSelection],
  );

  /* ── Auto-select on mount ───────────────────────────────────────── */
  useEffect(() => {
    if (
      characterLoading ||
      selectedCharacterId ||
      !characterRoster.length ||
      !currentCharacter
    )
      return;
    const entry = activeCharacterRosterEntry ?? characterRoster[0] ?? null;
    if (!entry) return;
    commitCharacterSelection(entry, true);
  }, [
    characterLoading,
    characterRoster,
    commitCharacterSelection,
    currentCharacter,
    selectedCharacterId,
    activeCharacterRosterEntry,
  ]);

  /* ── Sync customizing state with tab ─────────────────────────────── */
  useEffect(() => {
    if (tab === "character") {
      setCustomizing(true);
    }
  }, [tab]);

  /* ── Sync style entry drafts ────────────────────────────────────── */
  useEffect(() => {
    setStyleEntryDrafts({
      all: [...(d.style?.all ?? [])],
      chat: [...(d.style?.chat ?? [])],
      post: [...(d.style?.post ?? [])],
    });
  }, [d.style]);

  /* ── Voice test ─────────────────────────────────────────────────── */

  const handleStopTest = useCallback(() => {
    if (voiceTestAudio) {
      voiceTestAudio.pause();
      voiceTestAudio.currentTime = 0;
    }
    setVoiceTesting(false);
  }, [voiceTestAudio]);

  /* ── Persist voice config ───────────────────────────────────────── */
  const persistVoiceConfig = useCallback(async () => {
    setVoiceSaveError(null);
    const normalized: Record<string, string> = {
      ...(voiceConfig.elevenlabs as Record<string, string> | undefined),
      modelId:
        (voiceConfig.elevenlabs as Record<string, string> | undefined)
          ?.modelId ?? DEFAULT_ELEVEN_FAST_MODEL,
      languageCode:
        (voiceConfig.elevenlabs as Record<string, string> | undefined)
          ?.languageCode ?? getElevenLabsLanguageCode(getUiLanguage()),
    };
    const rawApiKey = normalized?.apiKey;
    const resolvedApiKey =
      typeof rawApiKey === "string" ? rawApiKey.trim() : "";
    if (resolvedApiKey && resolvedApiKey !== "[REDACTED]")
      normalized.apiKey = resolvedApiKey;
    else delete normalized.apiKey;
    const normalizedVoiceConfig = {
      ...voiceConfig,
      provider: voiceConfig.provider ?? "elevenlabs",
      elevenlabs: normalized,
    };
    await client.updateConfig({ messages: { tts: normalizedVoiceConfig } });
    dispatchWindowEvent(VOICE_CONFIG_UPDATED_EVENT, normalizedVoiceConfig);
  }, [voiceConfig]);

  /* ── Save all ───────────────────────────────────────────────────── */
  const handleSaveAll = useCallback(async () => {
    setVoiceSaving(true);
    setVoiceSaveError(null);
    try {
      await persistVoiceConfig();
    } catch (err) {
      setVoiceSaveError(
        err instanceof Error ? err.message : "Failed to save voice settings.",
      );
      setVoiceSaving(false);
      return;
    }
    setVoiceSaving(false);
    await handleSaveCharacter();
  }, [handleSaveCharacter, persistVoiceConfig]);

  /* ── Reset to defaults ──────────────────────────────────────────── */
  const handleResetToDefaults = useCallback(() => {
    if (!activeCharacterRosterEntry) return;
    applyCharacterDefaults(activeCharacterRosterEntry);
    applyVoicePresetForEntry(activeCharacterRosterEntry);
  }, [
    activeCharacterRosterEntry,
    applyCharacterDefaults,
    applyVoicePresetForEntry,
  ]);

  /* ── Generate field ─────────────────────────────────────────────── */
  const getCharContext = useCallback(
    () => ({
      name: d.name ?? "",
      system: d.system ?? "",
      bio: bioText,
      style: d.style ?? { all: [], chat: [], post: [] },
      postExamples: d.postExamples ?? [],
    }),
    [d, bioText],
  );

  const handleGenerate = useCallback(
    async (field: string, mode: "replace" | "append" = "replace") => {
      setGenerating(field);
      try {
        const { generated } = await client.generateCharacterField(
          field,
          getCharContext(),
          mode,
        );
        if (field === "bio") {
          handleFieldEdit("bio", generated.trim());
        } else if (field === "system") {
          handleFieldEdit("system", generated.trim());
        } else if (field === "style") {
          try {
            const parsed = JSON.parse(generated);
            if (mode === "append") {
              handleStyleEdit(
                "all",
                [...(d.style?.all ?? []), ...(parsed.all ?? [])].join("\n"),
              );
              handleStyleEdit(
                "chat",
                [...(d.style?.chat ?? []), ...(parsed.chat ?? [])].join("\n"),
              );
              handleStyleEdit(
                "post",
                [...(d.style?.post ?? []), ...(parsed.post ?? [])].join("\n"),
              );
            } else {
              if (parsed.all) handleStyleEdit("all", parsed.all.join("\n"));
              if (parsed.chat) handleStyleEdit("chat", parsed.chat.join("\n"));
              if (parsed.post) handleStyleEdit("post", parsed.post.join("\n"));
            }
          } catch {}
        } else if (field === "chatExamples") {
          try {
            const parsed = JSON.parse(generated);
            if (Array.isArray(parsed)) {
              type ConvoMsg = { user: string; content: { text: string } };
              const formatted = parsed.map((convo: ConvoMsg[]) => ({
                examples: convo.map((msg: ConvoMsg) => ({
                  name: msg.user,
                  content: { text: msg.content.text },
                })),
              }));
              handleFieldEdit("messageExamples", formatted);
            }
          } catch {}
        } else if (field === "postExamples") {
          try {
            const parsed = JSON.parse(generated);
            if (Array.isArray(parsed)) {
              if (mode === "append") {
                handleCharacterArrayInput(
                  "postExamples",
                  [...(d.postExamples ?? []), ...parsed].join("\n"),
                );
              } else {
                handleCharacterArrayInput("postExamples", parsed.join("\n"));
              }
            }
          } catch {}
        }
      } catch {}
      setGenerating(null);
    },
    [
      getCharContext,
      d,
      handleFieldEdit,
      handleStyleEdit,
      handleCharacterArrayInput,
    ],
  );

  /* ── Style entry handlers ───────────────────────────────────────── */
  const handlePendingStyleEntryChange = useCallback(
    (key: string, value: string) => {
      setPendingStyleEntries((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleAddStyleEntry = useCallback(
    (key: string) => {
      const value = pendingStyleEntries[key].trim();
      if (!value) return;
      const nextItems = [...(d.style?.[key as "all" | "chat" | "post"] ?? [])];
      if (!nextItems.includes(value)) {
        nextItems.push(value);
        handleStyleEdit(key, nextItems.join("\n"));
      }
      setPendingStyleEntries((prev) => ({ ...prev, [key]: "" }));
    },
    [d.style, handleStyleEdit, pendingStyleEntries],
  );

  const handleRemoveStyleEntry = useCallback(
    (key: string, index: number) => {
      const nextItems = [...(d.style?.[key as "all" | "chat" | "post"] ?? [])];
      nextItems.splice(index, 1);
      handleStyleEdit(key, nextItems.join("\n"));
    },
    [d.style, handleStyleEdit],
  );

  const handleStyleEntryDraftChange = useCallback(
    (key: string, index: number, value: string) => {
      setStyleEntryDrafts((prev) => {
        const nextItems = [...(prev[key] ?? [])];
        nextItems[index] = value;
        return { ...prev, [key]: nextItems };
      });
    },
    [],
  );

  const handleCommitStyleEntry = useCallback(
    (key: string, index: number) => {
      const nextValue = styleEntryDrafts[key]?.[index]?.trim() ?? "";
      const nextItems = [...(d.style?.[key as "all" | "chat" | "post"] ?? [])];
      if (!nextValue) {
        nextItems.splice(index, 1);
      } else {
        nextItems[index] = nextValue;
      }
      handleStyleEdit(key, nextItems.join("\n"));
    },
    [d.style, handleStyleEdit, styleEntryDrafts],
  );

  /* ── Derived ────────────────────────────────────────────────────── */
  const activeVoicePreset =
    PREMADE_VOICES.find((p) => p.id === selectedVoicePresetId) ?? null;
  const configuredVoiceId =
    (voiceConfig.elevenlabs as Record<string, string> | undefined)?.voiceId ??
    null;
  const canPreviewVoice = Boolean(activeVoicePreset || configuredVoiceId);
  const voiceSelectValue = selectedVoicePresetId ?? null;
  const combinedSaveError = voiceSaveError ?? characterSaveError;

  /* ── Loading state ──────────────────────────────────────────────── */
  if (characterLoading && !characterData) {
    return (
      <div className="ce-root">
        <div className="ce-loading">Loading character data...</div>
      </div>
    );
  }

  /* ── Render ─────────────────────────────────────────────────────── */
  return (
    <div className="ce-root">
      {/* ── Character Roster (when NOT customizing) ────────────────── */}
      {!customizing && (
        <div className="ce-roster-wrap">
          <CharacterRoster
            entries={characterRoster}
            selectedId={selectedCharacterId}
            onSelect={handleSelectCharacter}
          />
        </div>
      )}

      {/* ── Mobile page tabs (when customizing) ────────────────────── */}
      {/* Identity (left panel) always shows; these tabs toggle the right panel content */}
      {customizing && (
        <div className="ce-page-tabs">
          <button
            type="button"
            className={`ce-page-tab ${rightTab === "style" ? "ce-page-tab--active" : ""}`}
            onClick={() => {
              setRightTab("style");
              setMobilePage("style");
            }}
          >
            Style Rules
          </button>
          <button
            type="button"
            className={`ce-page-tab ${rightTab === "examples" ? "ce-page-tab--active" : ""}`}
            onClick={() => {
              setRightTab("examples");
              setMobilePage("examples");
            }}
          >
            Examples
          </button>
        </div>
      )}

      {customizing && (
        <div className="ce-panels">
          {/* ── LEFT PANEL ────────────────────────────────────────────── */}
          <div className="ce-panel ce-panel-left">
            {/* Name + Voice (50/50 split) */}
            <section className="ce-section">
              <div className="ce-name-voice-row">
                <div className="ce-name-voice-col">
                  <div className="ce-section-header">
                    <span className="ce-label">Name</span>
                  </div>
                  <Input
                    type="text"
                    value={d.name ?? ""}
                    placeholder="Agent name"
                    onChange={(
                      e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
                    ) => handleFieldEdit("name", e.target.value)}
                    className="ce-input"
                  />
                </div>
                <div className="ce-name-voice-col">
                  <div className="ce-section-header">
                    <span className="ce-label">Voice</span>
                  </div>
                  <div className="ce-voice-inline">
                    <ThemedSelect
                      value={voiceSelectValue}
                      groups={VOICE_SELECT_GROUPS}
                      onChange={(id: string) => {
                        const preset = PREMADE_VOICES.find((p) => p.id === id);
                        if (preset) handleSelectPreset(preset);
                      }}
                      placeholder="Select a voice"
                      menuPlacement="bottom"
                      className="ce-voice-inline-select"
                      triggerClassName="h-8 rounded-md border-border/50 bg-bg/65 px-3 py-0 text-[11px] shadow-inner backdrop-blur-sm"
                      menuClassName="border-border/60 bg-bg/92 shadow-2xl backdrop-blur-md"
                    />
                    <Button
                      type="button"
                      variant={voiceTesting ? "destructive" : "outline"}
                      size="icon"
                      className="ce-voice-test-btn"
                      onClick={() => {
                        if (voiceTesting) {
                          handleStopTest();
                        } else if (activeCharacterRosterEntry?.catchphrase) {
                          setVoiceTesting(true);
                          void client
                            .streamVoiceSpeak(
                              activeCharacterRosterEntry.catchphrase,
                            )
                            .then(() => setVoiceTesting(false))
                            .catch((err) => {
                              const message =
                                err instanceof Error
                                  ? err.message
                                  : "Voice preview failed.";
                              setVoiceSaveError(message);
                              setVoiceTesting(false);
                            });
                        }
                      }}
                      aria-label={
                        voiceTesting ? "Stop voice preview" : "Preview voice"
                      }
                      disabled={!canPreviewVoice || voiceLoading}
                    >
                      {voiceTesting ? (
                        <VolumeX className="h-3.5 w-3.5" />
                      ) : (
                        <Volume2 className="h-3.5 w-3.5" />
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            </section>

            {/* Bio / About Me */}
            <section className="ce-section ce-section--grow">
              <div className="ce-section-header">
                <span className="ce-label">About Me</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ce-regen-btn"
                  onClick={() => void handleGenerate("bio")}
                  disabled={generating === "bio"}
                >
                  {generating === "bio" ? "generating..." : "regenerate"}
                </Button>
              </div>
              <Textarea
                value={bioText}
                rows={4}
                placeholder="Describe who your agent is..."
                onChange={(
                  e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
                ) => handleFieldEdit("bio", e.target.value)}
                className="ce-textarea ce-textarea--compact"
              />
            </section>

            {/* System Prompt / Directions */}
            <section className="ce-section ce-section--grow">
              <div className="ce-section-header">
                <span className="ce-label">System Prompt</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ce-regen-btn"
                  onClick={() => void handleGenerate("system")}
                  disabled={generating === "system"}
                >
                  {generating === "system" ? "generating..." : "regenerate"}
                </Button>
              </div>
              <Textarea
                value={d.system ?? ""}
                rows={4}
                maxLength={10000}
                placeholder="Write in first person..."
                onChange={(
                  e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
                ) => handleFieldEdit("system", e.target.value)}
                className="ce-textarea ce-textarea--compact"
              />
            </section>
          </div>

          {/* ── RIGHT PANEL ───────────────────────────────────────────── */}
          <div className="ce-panel ce-panel-right">
            {/* ── Toggle: Style Rules / Examples ───────────────────────── */}
            <div className="ce-right-toggle-row">
              <div className="ce-right-toggle">
                <button
                  type="button"
                  className={`ce-right-toggle-btn ${rightTab === "style" ? "ce-right-toggle-btn--active" : ""}`}
                  onClick={() => {
                    setRightTab("style");
                    setMobilePage("style");
                  }}
                >
                  Style Rules
                </button>
                <button
                  type="button"
                  className={`ce-right-toggle-btn ${rightTab === "examples" ? "ce-right-toggle-btn--active" : ""}`}
                  onClick={() => {
                    setRightTab("examples");
                    setMobilePage("examples");
                  }}
                >
                  Examples
                </button>
              </div>
              {customizing && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="ce-reset-btn"
                  onClick={handleResetToDefaults}
                  disabled={!activeCharacterRosterEntry}
                  title="Reset to Defaults"
                >
                  <RotateCcw className="h-4 w-4 mr-1" />
                  Reset
                </Button>
              )}
            </div>

            {/* Style Rules */}
            <section
              className="ce-section ce-section--grow"
              style={{ display: rightTab === "style" ? undefined : "none" }}
            >
              <div className="ce-section-header">
                <span className="ce-label">Style Rules</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ce-regen-btn"
                  onClick={() => void handleGenerate("style", "replace")}
                  disabled={generating === "style"}
                >
                  {generating === "style" ? "generating..." : "regenerate"}
                </Button>
              </div>
              <div className="ce-style-sections">
                {STYLE_SECTION_KEYS.map((key) => {
                  const items = d.style?.[key] ?? [];
                  return (
                    <div
                      key={key}
                      className="ce-style-group"
                      data-testid={`style-section-${key}`}
                    >
                      <div className="ce-style-group-header">
                        <span className="ce-style-group-label">{key}</span>
                        <span className="ce-style-group-count">
                          {items.length} rule{items.length === 1 ? "" : "s"}
                        </span>
                      </div>
                      <div className="ce-style-entries">
                        {items.length > 0 ? (
                          items.map((item, index) => (
                            <div
                              key={`${key}:${item}`}
                              className="ce-style-entry"
                            >
                              <span className="ce-style-entry-num">
                                {index + 1}
                              </span>
                              <Textarea
                                value={styleEntryDrafts[key]?.[index] ?? item}
                                rows={1}
                                onChange={(
                                  e: ChangeEvent<
                                    HTMLInputElement | HTMLTextAreaElement
                                  >,
                                ) =>
                                  handleStyleEntryDraftChange(
                                    key,
                                    index,
                                    e.target.value,
                                  )
                                }
                                onBlur={() =>
                                  handleCommitStyleEntry(key, index)
                                }
                                className="ce-style-entry-input"
                              />
                              <button
                                type="button"
                                className="ce-style-entry-remove"
                                onClick={() =>
                                  handleRemoveStyleEntry(key, index)
                                }
                                title="Remove"
                              >
                                <svg
                                  width="10"
                                  height="10"
                                  viewBox="0 0 10 10"
                                  fill="none"
                                  stroke="currentColor"
                                  strokeWidth="1.5"
                                  strokeLinecap="round"
                                  aria-hidden="true"
                                >
                                  <path d="M2 2l6 6M8 2l-6 6" />
                                </svg>
                              </button>
                            </div>
                          ))
                        ) : (
                          <div className="ce-style-empty">
                            {STYLE_SECTION_EMPTY_STATES[key]}
                          </div>
                        )}
                      </div>
                      <div className="ce-style-add">
                        <Input
                          type="text"
                          value={pendingStyleEntries[key]}
                          placeholder={STYLE_SECTION_PLACEHOLDERS[key]}
                          onChange={(
                            e: ChangeEvent<
                              HTMLInputElement | HTMLTextAreaElement
                            >,
                          ) =>
                            handlePendingStyleEntryChange(key, e.target.value)
                          }
                          onKeyDown={(e: KeyboardEvent<HTMLInputElement>) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              handleAddStyleEntry(key);
                            }
                          }}
                          className="ce-input ce-input--sm"
                        />
                        <Button
                          variant="ghost"
                          size="sm"
                          className="ce-regen-btn"
                          onClick={() => handleAddStyleEntry(key)}
                          disabled={!pendingStyleEntries[key].trim()}
                        >
                          + add
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* Chat Examples */}
            <section
              className="ce-section ce-section--grow"
              style={{
                display: rightTab === "examples" ? undefined : "none",
              }}
            >
              <div className="ce-section-header">
                <span className="ce-label">Chat Examples</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ce-regen-btn"
                  onClick={() => void handleGenerate("chatExamples", "replace")}
                  disabled={generating === "chatExamples"}
                >
                  {generating === "chatExamples" ? "generating..." : "generate"}
                </Button>
              </div>
              <div className="ce-examples-list">
                {(d.messageExamples ?? []).map((convo, ci) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: order is static in designer
                  <div key={`convo-${ci}`} className="ce-example-convo">
                    <div className="ce-example-convo-header">
                      <span className="ce-example-convo-label">
                        Conversation {ci + 1}
                      </span>
                      <button
                        type="button"
                        className="ce-style-entry-remove"
                        onClick={() => {
                          const updated = [...(d.messageExamples ?? [])];
                          updated.splice(ci, 1);
                          handleFieldEdit("messageExamples", updated);
                        }}
                      >
                        <svg
                          width="10"
                          height="10"
                          viewBox="0 0 10 10"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          aria-hidden="true"
                        >
                          <path d="M2 2l6 6M8 2l-6 6" />
                        </svg>
                      </button>
                    </div>
                    <div className="ce-example-messages">
                      {convo.examples.map((msg, mi) => (
                        // biome-ignore lint/suspicious/noArrayIndexKey: order is static in designer
                        <div key={`msg-${ci}-${mi}`} className="ce-example-msg">
                          <span
                            className={`ce-example-msg-role ${msg.name === "{{user1}}" ? "" : "ce-example-msg-role--agent"}`}
                          >
                            {msg.name === "{{user1}}" ? "user" : "agent"}
                          </span>
                          <input
                            type="text"
                            value={msg.content?.text ?? ""}
                            onChange={(e) => {
                              const updated = [...(d.messageExamples ?? [])];
                              const convoClone = {
                                examples: [...updated[ci].examples],
                              };
                              convoClone.examples[mi] = {
                                ...convoClone.examples[mi],
                                content: { text: e.target.value },
                              };
                              updated[ci] = convoClone;
                              handleFieldEdit("messageExamples", updated);
                            }}
                            className="ce-example-msg-input"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {(d.messageExamples ?? []).length === 0 && (
                  <div className="ce-style-empty">No chat examples yet.</div>
                )}
              </div>
            </section>

            {/* Post Examples */}
            <section
              className="ce-section ce-section--grow"
              style={{
                display: rightTab === "examples" ? undefined : "none",
              }}
            >
              <div className="ce-section-header">
                <span className="ce-label">Post Examples</span>
                <Button
                  variant="ghost"
                  size="sm"
                  className="ce-regen-btn"
                  onClick={() => void handleGenerate("postExamples", "replace")}
                  disabled={generating === "postExamples"}
                >
                  {generating === "postExamples" ? "generating..." : "generate"}
                </Button>
              </div>
              <div className="ce-examples-list">
                {(d.postExamples ?? []).map((post, pi) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: order is static in designer
                  <div key={`post-${pi}`} className="ce-example-post">
                    <input
                      type="text"
                      value={post}
                      onChange={(e) => {
                        const updated = [...(d.postExamples ?? [])];
                        updated[pi] = e.target.value;
                        handleFieldEdit("postExamples", updated);
                      }}
                      className="ce-example-msg-input"
                    />
                    <button
                      type="button"
                      className="ce-style-entry-remove"
                      onClick={() => {
                        const updated = [...(d.postExamples ?? [])];
                        updated.splice(pi, 1);
                        handleFieldEdit("postExamples", updated);
                      }}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        aria-hidden="true"
                      >
                        <path d="M2 2l6 6M8 2l-6 6" />
                      </svg>
                    </button>
                  </div>
                ))}
                {(d.postExamples ?? []).length === 0 && (
                  <div className="ce-style-empty">No post examples yet.</div>
                )}
                <button
                  type="button"
                  className="ce-add-post-btn"
                  onClick={() => {
                    const updated = [...(d.postExamples ?? []), ""];
                    handleFieldEdit("postExamples", updated);
                  }}
                >
                  + Add Post
                </button>
              </div>
            </section>
          </div>
        </div>
      )}

      {/* ── Footer ─────────────────────────────────────────────────── */}
      <div className="ce-footer">
        {/* Status messages */}
        {(characterSaveSuccess || combinedSaveError) && (
          <div className="ce-footer-status">
            {characterSaveSuccess && (
              <span className="ce-status-success">{characterSaveSuccess}</span>
            )}
            {combinedSaveError && (
              <span className="ce-status-error">{combinedSaveError}</span>
            )}
          </div>
        )}

        <div className="ce-footer-actions">
          {/* Save Character */}
          <Button
            size="sm"
            className="ce-save-btn"
            disabled={characterSaving || voiceSaving}
            onClick={() => void handleSaveAll()}
          >
            {characterSaving || voiceSaving ? "saving..." : "Save"}
          </Button>

          {/* Back to roster — only in customize view */}
          {customizing && (
            <Button
              type="button"
              variant="default"
              size="sm"
              className="ce-save-btn"
              onClick={() => {
                setCustomizing(false);
                setTab("character-select");
              }}
            >
              Select
            </Button>
          )}

          {/* Customize Character — only in roster view */}
          {!customizing && (
            <Button
              type="button"
              variant="default"
              size="sm"
              className="ce-save-btn"
              onClick={() => {
                setCustomizing(true);
                setTab("character");
              }}
            >
              Customize Character
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

/**
 * Re-export as CharacterView so the upstream App.tsx import resolves here
 * when the Vite alias redirects ./CharacterView to this file.
 */
export { CharacterEditor as CharacterView };
