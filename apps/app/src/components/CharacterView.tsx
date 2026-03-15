/**
 * Character view — roster-first character selection with optional customization.
 */

import {
  type CharacterData,
  client,
  type StylePreset,
  type VoiceConfig,
} from "@milady/app-core/api";
import {
  dispatchWindowEvent,
  VOICE_CONFIG_UPDATED_EVENT,
} from "@milady/app-core/events";
import { getVrmPreviewUrl, useApp } from "@milady/app-core/state";
import {
  PREMADE_VOICES,
  sanitizeApiKey,
  type VoicePreset,
} from "@milady/app-core/voice";
import { Button, Input, Textarea, ThemedSelect } from "@milady/ui";
import { BookOpen, FileText, Lock, LockOpen, Palette, Volume2, VolumeX } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useState } from "react";

const DEFAULT_ELEVEN_FAST_MODEL = "eleven_flash_v2_5";

type StyleSectionKey = "all" | "chat" | "post";
type CustomizeStep = "core" | "examples";
type ActiveSection = "aboutMe" | "directions" | "styleRules";
const STYLE_SECTION_KEYS: StyleSectionKey[] = ["all", "chat", "post"];
const STYLE_SECTION_PLACEHOLDERS: Record<StyleSectionKey, string> = {
  all: "Add shared rule",
  chat: "Add chat rule",
  post: "Add post rule",
};
const STYLE_SECTION_EMPTY_STATES: Record<StyleSectionKey, string> = {
  all: "No shared rules yet.",
  chat: "No chat rules yet.",
  post: "No post rules yet.",
};
const VOICE_SELECT_GROUPS = [
  {
    label: "Female",
    items: PREMADE_VOICES.filter((preset) => preset.gender === "female").map(
      (preset) => ({
        id: preset.id,
        text: preset.name,
      }),
    ),
  },
  {
    label: "Male",
    items: PREMADE_VOICES.filter((preset) => preset.gender === "male").map(
      (preset) => ({
        id: preset.id,
        text: preset.name,
      }),
    ),
  },
  {
    label: "Character",
    items: PREMADE_VOICES.filter((preset) => preset.gender === "character").map(
      (preset) => ({
        id: preset.id,
        text: preset.name,
      }),
    ),
  },
];
const CHARACTER_PRESET_META: Record<
  string,
  {
    name: string;
    avatarIndex: number;
    voicePresetId?: string;
  }
> = {
  "uwu~": { name: "Reimu", avatarIndex: 1, voicePresetId: "sarah" },
  "hell yeah": { name: "Marisa", avatarIndex: 2, voicePresetId: "adam" },
  "lol k": { name: "Yukari", avatarIndex: 3, voicePresetId: "liam" },
  "Noted.": { name: "Sakuya", avatarIndex: 4, voicePresetId: "alice" },
  "hehe~": { name: "Koishi", avatarIndex: 2, voicePresetId: "gigi" },
  "...": { name: "Remilia", avatarIndex: 4, voicePresetId: "lily" },
  "locked in": { name: "Reisen", avatarIndex: 3, voicePresetId: "josh" },
};

type CharacterRosterEntry = {
  id: string;
  name: string;
  avatarIndex: number;
  voicePresetId?: string;
  preset: StylePreset;
};

function replaceCharacterToken(value: string, name: string) {
  return value.replaceAll("{{name}}", name).replaceAll("{{agentName}}", name);
}

function buildCharacterFromPreset(
  preset: StylePreset,
  name: string,
): CharacterData {
  return {
    name,
    username: name,
    bio: preset.bio.map((line) => replaceCharacterToken(line, name)),
    system: replaceCharacterToken(preset.system, name),
    adjectives: [...preset.adjectives],
    style: {
      all: [...preset.style.all],
      chat: [...preset.style.chat],
      post: [...preset.style.post],
    },
    messageExamples: preset.messageExamples.map((conversation) => ({
      examples: conversation.map((message) => ({
        name:
          message.user === "{{agentName}}"
            ? name
            : replaceCharacterToken(message.user, name),
        content: {
          text: replaceCharacterToken(message.content.text, name),
        },
      })),
    })),
    postExamples: preset.postExamples.map((example) =>
      replaceCharacterToken(example, name),
    ),
  };
}

function buildCharacterDraftFromPreset(
  entry: CharacterRosterEntry,
): CharacterData {
  const character = buildCharacterFromPreset(entry.preset, entry.name);
  return {
    name: character.name ?? "",
    username: character.username ?? "",
    bio: Array.isArray(character.bio)
      ? character.bio.join("\n")
      : (character.bio ?? ""),
    system: character.system ?? "",
    adjectives: character.adjectives ?? [],
    style: {
      all: character.style?.all ?? [],
      chat: character.style?.chat ?? [],
      post: character.style?.post ?? [],
    },
    messageExamples: character.messageExamples ?? [],
    postExamples: character.postExamples ?? [],
  };
}

function normalizeCharacterDraftForComparison(
  character: CharacterData | null | undefined,
) {
  return {
    name: (character?.name ?? "").trim(),
    username: (character?.username ?? "").trim(),
    bio:
      typeof character?.bio === "string"
        ? character.bio.trim()
        : Array.isArray(character?.bio)
          ? character.bio.join("\n").trim()
          : "",
    system: (character?.system ?? "").trim(),
    adjectives: [...(character?.adjectives ?? [])],
    style: {
      all: [...(character?.style?.all ?? [])],
      chat: [...(character?.style?.chat ?? [])],
      post: [...(character?.style?.post ?? [])],
    },
    messageExamples: (character?.messageExamples ?? []).map((conversation) => ({
      examples: (conversation.examples ?? []).map((message) => ({
        name: message.name,
        content: {
          text: message.content?.text ?? "",
        },
      })),
    })),
    postExamples: [...(character?.postExamples ?? [])],
  };
}

function characterDraftMatchesPreset(
  character: CharacterData | null | undefined,
  avatarIndex: number,
  entry: CharacterRosterEntry,
) {
  if (avatarIndex !== entry.avatarIndex) return false;
  const normalizedCurrent = normalizeCharacterDraftForComparison(character);
  const normalizedPreset = normalizeCharacterDraftForComparison(
    buildCharacterDraftFromPreset(entry),
  );
  return JSON.stringify(normalizedCurrent) === JSON.stringify(normalizedPreset);
}

function resolveRosterEntries(
  styles: readonly StylePreset[],
): CharacterRosterEntry[] {
  return styles.map((preset, index) => {
    const meta = CHARACTER_PRESET_META[preset.catchphrase];
    const fallbackName = `Character ${index + 1}`;
    return {
      id: preset.catchphrase,
      name: meta?.name ?? fallbackName,
      avatarIndex: meta?.avatarIndex ?? (index % 4) + 1,
      voicePresetId: meta?.voicePresetId,
      preset,
    };
  });
}

function findMatchingRosterEntry(
  character: CharacterData | null,
  avatarIndex: number,
  roster: CharacterRosterEntry[],
) {
  if (!character) return null;
  const currentName =
    typeof character.name === "string" ? character.name.trim() : "";
  const exactNameMatch = roster.find((entry) => entry.name === currentName);
  if (exactNameMatch) return exactNameMatch.id;

  let bestMatch: { id: string; score: number } | null = null;
  for (const entry of roster) {
    let score = 0;
    if (entry.avatarIndex === avatarIndex) score += 3;

    const draftAdjectives = new Set(character.adjectives ?? []);
    for (const adjective of entry.preset.adjectives) {
      if (draftAdjectives.has(adjective)) score += 1;
    }

    if (
      typeof character.system === "string" &&
      character.system.includes(entry.preset.catchphrase)
    ) {
      score += 1;
    }

    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { id: entry.id, score };
    }
  }

  return bestMatch && bestMatch.score >= 4 ? bestMatch.id : null;
}

function findExactRosterEntry(
  character: CharacterData | null,
  roster: CharacterRosterEntry[],
) {
  if (!character) return null;
  const currentName =
    typeof character.name === "string" ? character.name.trim() : "";
  return roster.find((entry) => entry.name === currentName) ?? null;
}

function hasCharacterContent(character: CharacterData | null | undefined) {
  return Boolean(character && Object.keys(character).length > 0);
}

function resolveActiveRosterEntry(
  character: CharacterData | null | undefined,
  avatarIndex: number,
  selectedCharacterId: string | null,
  roster: CharacterRosterEntry[],
) {
  if (selectedCharacterId) {
    const selectedEntry =
      roster.find((entry) => entry.id === selectedCharacterId) ?? null;
    if (selectedEntry) return selectedEntry;
  }

  const exactEntry = findExactRosterEntry(character ?? null, roster);
  if (exactEntry) return exactEntry;

  const matchedId = findMatchingRosterEntry(
    character ?? null,
    avatarIndex,
    roster,
  );
  if (!matchedId) return null;
  return roster.find((entry) => entry.id === matchedId) ?? null;
}

function getStyleEntryRenderKey(
  section: StyleSectionKey,
  items: string[],
  item: string,
  index: number,
) {
  let occurrence = 0;
  for (const current of items.slice(0, index + 1)) {
    if (current === item) occurrence += 1;
  }
  return `${section}:${item}:${occurrence}`;
}

/* ── CharacterView ──────────────────────────────────────────────────── */

export function CharacterView({
  inModal,
  sceneOverlay = false,
}: {
  inModal?: boolean;
  sceneOverlay?: boolean;
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
    selectedVrmIndex,
    t,
    // Registry / Drop
    registryStatus,
    registryLoading,
    registryRegistering,
    registryError,
    dropStatus,
    loadRegistryStatus,
    registerOnChain,
    syncRegistryProfile,
    loadDropStatus,
    walletConfig,
  } = useApp();

  useEffect(() => {
    void loadCharacter();
    void loadRegistryStatus();
    void loadDropStatus();
  }, [loadCharacter, loadRegistryStatus, loadDropStatus]);

  const handleFieldEdit = useCallback(
    <K extends keyof CharacterData>(field: K, value: CharacterData[K]) => {
      handleCharacterFieldInput(field, value);
    },
    [handleCharacterFieldInput],
  );

  const handleStyleEdit = useCallback(
    (key: "all" | "chat" | "post", value: string) => {
      handleCharacterStyleInput(key, value);
    },
    [handleCharacterStyleInput],
  );

  /* ── Character generation state ─────────────────────────────────── */
  const [generating, setGenerating] = useState<string | null>(null);
  const [pendingStyleEntries, setPendingStyleEntries] = useState<
    Record<StyleSectionKey, string>
  >({
    all: "",
    chat: "",
    post: "",
  });
  const [styleEntryDrafts, setStyleEntryDrafts] = useState<
    Record<StyleSectionKey, string[]>
  >({
    all: [],
    chat: [],
    post: [],
  });
  const [customizeStep, setCustomizeStep] = useState<CustomizeStep>("core");
  const [customOverridesEnabled, setCustomOverridesEnabled] = useState(false);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(
    null,
  );
  const [rosterStyles, setRosterStyles] = useState<StylePreset[]>(
    onboardingOptions?.styles ?? [],
  );

  /* ── Voice config state ─────────────────────────────────────────── */
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({});
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceSaveError, setVoiceSaveError] = useState<string | null>(null);
  const [voiceTesting, setVoiceTesting] = useState(false);
  const [voiceTestAudio, setVoiceTestAudio] = useState<HTMLAudioElement | null>(
    null,
  );
  const [selectedVoicePresetId, setSelectedVoicePresetId] = useState<
    string | null
  >(null);
  const [voiceSelectionLocked, setVoiceSelectionLocked] = useState(false);

  useEffect(() => {
    if (onboardingOptions?.styles?.length) {
      setRosterStyles(onboardingOptions.styles);
      return;
    }

    let cancelled = false;
    void client
      .getOnboardingOptions()
      .then((options) => {
        if (!cancelled) {
          setRosterStyles(options.styles ?? []);
        }
      })
      .catch(() => {
        /* ignore */
      });

    return () => {
      cancelled = true;
    };
  }, [onboardingOptions?.styles]);

  const characterRoster = resolveRosterEntries(rosterStyles);
  const visibleCharacterRoster = characterRoster.slice(0, 4);
  const currentCharacter = hasCharacterContent(characterDraft)
    ? characterDraft
    : characterData;
  const activeRosterEntry = resolveActiveRosterEntry(
    currentCharacter,
    selectedVrmIndex,
    selectedCharacterId,
    characterRoster,
  );
  const detailedEditMode = tab === "character";

  /* Load voice config on mount */
  useEffect(() => {
    void (async () => {
      setVoiceLoading(true);
      try {
        const cfg = await client.getConfig();
        const messages = cfg.messages as
          | Record<string, Record<string, unknown>>
          | undefined;
        const tts = messages?.tts as VoiceConfig | undefined;
        if (tts) {
          setVoiceConfig(tts);
          if (tts.elevenlabs?.voiceId) {
            const preset = PREMADE_VOICES.find(
              (p) => p.voiceId === tts.elevenlabs?.voiceId,
            );
            setSelectedVoicePresetId(preset?.id ?? null);
          }
        }
      } catch {
        /* ignore */
      }
      setVoiceLoading(false);
    })();
  }, []);

  const handleSelectPreset = useCallback((preset: VoicePreset) => {
    setSelectedVoicePresetId(preset.id);
    setVoiceConfig((prev) => ({
      ...prev,
      elevenlabs: { ...(prev.elevenlabs ?? {}), voiceId: preset.voiceId },
    }));
  }, []);

  const applyVoicePresetForEntry = useCallback(
    (entry: CharacterRosterEntry) => {
      setVoiceSaveError(null);
      if (!entry.voicePresetId) return;
      const voicePreset = PREMADE_VOICES.find(
        (preset) => preset.id === entry.voicePresetId,
      );
      if (voicePreset) handleSelectPreset(voicePreset);
    },
    [handleSelectPreset],
  );

  const applyCharacterDefaults = useCallback(
    (entry: CharacterRosterEntry) => {
      const nextCharacter = buildCharacterDraftFromPreset(entry);
      handleFieldEdit("name", nextCharacter.name ?? "");
      handleFieldEdit("username", nextCharacter.username ?? "");
      handleFieldEdit("bio", nextCharacter.bio ?? "");
      handleFieldEdit("system", nextCharacter.system ?? "");
      handleFieldEdit("adjectives", nextCharacter.adjectives ?? []);
      handleFieldEdit(
        "style",
        nextCharacter.style ?? { all: [], chat: [], post: [] },
      );
      handleFieldEdit("messageExamples", nextCharacter.messageExamples ?? []);
      handleFieldEdit("postExamples", nextCharacter.postExamples ?? []);
    },
    [handleFieldEdit],
  );

  const commitCharacterSelection = useCallback(
    (entry: CharacterRosterEntry, applyDefaults: boolean) => {
      setSelectedCharacterId(entry.id);
      setState("selectedVrmIndex", entry.avatarIndex);
      if (!voiceSelectionLocked && selectedCharacterId !== entry.id) {
        applyVoicePresetForEntry(entry);
      }
      if (applyDefaults) {
        applyCharacterDefaults(entry);
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

  const handleTestVoice = useCallback(
    (previewUrl: string) => {
      if (voiceTestAudio) {
        voiceTestAudio.pause();
        voiceTestAudio.currentTime = 0;
      }
      setVoiceTesting(true);
      const audio = new Audio(previewUrl);
      setVoiceTestAudio(audio);
      audio.onended = () => setVoiceTesting(false);
      audio.onerror = () => setVoiceTesting(false);
      audio.play().catch(() => setVoiceTesting(false));
    },
    [voiceTestAudio],
  );

  const handleStopTest = useCallback(() => {
    if (voiceTestAudio) {
      voiceTestAudio.pause();
      voiceTestAudio.currentTime = 0;
    }
    setVoiceTesting(false);
  }, [voiceTestAudio]);

  const persistVoiceConfig = useCallback(async () => {
    setVoiceSaveError(null);
    const normalizedElevenlabs = {
      ...voiceConfig.elevenlabs,
      modelId: voiceConfig.elevenlabs?.modelId ?? DEFAULT_ELEVEN_FAST_MODEL,
    };
    const sanitizedKey = sanitizeApiKey(normalizedElevenlabs?.apiKey);
    if (sanitizedKey) normalizedElevenlabs.apiKey = sanitizedKey;
    else delete normalizedElevenlabs.apiKey;

    const normalizedVoiceConfig: VoiceConfig = {
      ...voiceConfig,
      provider: voiceConfig.provider ?? "elevenlabs",
      elevenlabs: normalizedElevenlabs,
    };

    await client.updateConfig({
      messages: {
        tts: normalizedVoiceConfig,
      },
    });
    dispatchWindowEvent(VOICE_CONFIG_UPDATED_EVENT, normalizedVoiceConfig);
  }, [voiceConfig]);

  const d = characterDraft;
  const bioText =
    typeof d.bio === "string"
      ? d.bio
      : Array.isArray(d.bio)
        ? d.bio.join("\n")
        : "";

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

  useEffect(() => {
    setStyleEntryDrafts({
      all: [...(d.style?.all ?? [])],
      chat: [...(d.style?.chat ?? [])],
      post: [...(d.style?.post ?? [])],
    });
  }, [d.style]);

  const handleGenerate = useCallback(
    async (field: string, mode: "append" | "replace" = "replace") => {
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
          } catch {
            /* raw text fallback */
          }
        } else if (field === "chatExamples") {
          try {
            const parsed = JSON.parse(generated);
            if (Array.isArray(parsed)) {
              const formatted = parsed.map(
                (
                  convo: Array<{ user: string; content: { text: string } }>,
                ) => ({
                  examples: convo.map((msg) => ({
                    name: msg.user,
                    content: { text: msg.content.text },
                  })),
                }),
              );
              handleFieldEdit("messageExamples", formatted);
            }
          } catch {
            /* raw text fallback */
          }
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
          } catch {
            /* raw text fallback */
          }
        }
      } catch {
        /* generation failed */
      }
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

  const handlePendingStyleEntryChange = useCallback(
    (key: StyleSectionKey, value: string) => {
      setPendingStyleEntries((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  const handleAddStyleEntry = useCallback(
    (key: StyleSectionKey) => {
      const value = pendingStyleEntries[key].trim();
      if (!value) return;

      const nextItems = [...(d.style?.[key] ?? [])];
      if (!nextItems.includes(value)) {
        nextItems.push(value);
        handleStyleEdit(key, nextItems.join("\n"));
      }

      setPendingStyleEntries((prev) => ({ ...prev, [key]: "" }));
    },
    [d.style, handleStyleEdit, pendingStyleEntries],
  );

  const handleRemoveStyleEntry = useCallback(
    (key: StyleSectionKey, index: number) => {
      const nextItems = [...(d.style?.[key] ?? [])];
      nextItems.splice(index, 1);
      handleStyleEdit(key, nextItems.join("\n"));
    },
    [d.style, handleStyleEdit],
  );

  const handleStyleEntryDraftChange = useCallback(
    (key: StyleSectionKey, index: number, value: string) => {
      setStyleEntryDrafts((prev) => {
        const nextItems = [...(prev[key] ?? [])];
        nextItems[index] = value;
        return { ...prev, [key]: nextItems };
      });
    },
    [],
  );

  const handleCommitStyleEntry = useCallback(
    (key: StyleSectionKey, index: number) => {
      const nextValue = styleEntryDrafts[key]?.[index]?.trim() ?? "";
      const nextItems = [...(d.style?.[key] ?? [])];

      if (!nextValue) {
        nextItems.splice(index, 1);
      } else {
        nextItems[index] = nextValue;
      }

      handleStyleEdit(key, nextItems.join("\n"));
    },
    [d.style, handleStyleEdit, styleEntryDrafts],
  );

  const handleSelectCharacter = useCallback(
    (entry: CharacterRosterEntry) => {
      const shouldApplyDefaults =
        !customOverridesEnabled &&
        (!currentCharacter ||
          !activeRosterEntry ||
          characterDraftMatchesPreset(
            currentCharacter,
            selectedVrmIndex,
            activeRosterEntry,
          ));
      commitCharacterSelection(entry, shouldApplyDefaults);
    },
    [
      activeRosterEntry,
      commitCharacterSelection,
      currentCharacter,
      customOverridesEnabled,
      selectedVrmIndex,
    ],
  );

  const handleCustomOverridesChange = useCallback(
    (enabled: boolean) => {
      setTab(enabled ? "character" : "character-select");
      setCustomOverridesEnabled(enabled);
      setCustomizeStep("core");
      if (enabled) return;

      const activeEntry = resolveActiveRosterEntry(
        currentCharacter,
        selectedVrmIndex,
        selectedCharacterId,
        characterRoster,
      );
      if (activeEntry) {
        setSelectedCharacterId(activeEntry.id);
      }
    },
    [
      characterRoster,
      currentCharacter,
      selectedCharacterId,
      selectedVrmIndex,
      setTab,
    ],
  );

  useEffect(() => {
    setCustomOverridesEnabled(detailedEditMode);
    if (detailedEditMode) {
      setCustomizeStep("core");
    }
  }, [detailedEditMode]);

  useEffect(() => {
    if (
      characterLoading ||
      selectedCharacterId ||
      !characterRoster.length ||
      !currentCharacter
    ) {
      return;
    }

    const activeEntry =
      resolveActiveRosterEntry(
        currentCharacter,
        selectedVrmIndex,
        selectedCharacterId,
        characterRoster,
      ) ??
      characterRoster[0] ??
      null;
    if (!activeEntry) return;
    const matchesFactory = characterDraftMatchesPreset(
      currentCharacter,
      selectedVrmIndex,
      activeEntry,
    );
    setSelectedCharacterId(activeEntry.id);
    setCustomOverridesEnabled(detailedEditMode);
    if (matchesFactory) {
      commitCharacterSelection(activeEntry, true);
    }
  }, [
    characterLoading,
    characterRoster,
    commitCharacterSelection,
    currentCharacter,
    detailedEditMode,
    selectedCharacterId,
    selectedVrmIndex,
  ]);

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

  /* ── Helpers ────────────────────────────────────────────────────── */
  const cardCls = sceneOverlay
    ? "p-5 border border-white/10 bg-black/15 backdrop-blur-md rounded-2xl shadow-[0_18px_48px_rgba(0,0,0,0.28)]"
    : "p-5 border border-border/40 bg-card/40 backdrop-blur-xl rounded-2xl shadow-sm";
  const editorCardCls = `${cardCls} flex min-h-0 flex-col overflow-hidden`;
  const sectionCls =
    sceneOverlay && !inModal ? "relative z-10 mt-4 px-1" : `mt-4 ${cardCls}`;
  const hintCls = "text-[11px] text-muted";
  const scrollPaneCls =
    "min-h-0 overflow-y-auto pr-1 [scrollbar-gutter:stable] custom-scrollbar";

  if (characterLoading && !characterData) {
    return (
      <div className={sectionCls}>
        <div className="text-center py-6 text-[var(--muted)] text-[13px]">
          {t("characterview.loadingCharacterDa")}
        </div>
      </div>
    );
  }

  const hasWallet = Boolean(walletConfig?.evmAddress);
  const isRegistered = registryStatus?.registered === true;
  const dropLive =
    dropStatus?.dropEnabled &&
    dropStatus?.publicMintOpen &&
    !dropStatus?.mintedOut;
  const userMinted = dropStatus?.userHasMinted === true;
  const activeVoicePreset =
    PREMADE_VOICES.find((preset) => preset.id === selectedVoicePresetId) ??
    null;
  const voiceSelectValue = selectedVoicePresetId ?? null;
  const combinedSaveError = voiceSaveError ?? characterSaveError;
  const customizationActionLabel = customOverridesEnabled
    ? t("characterview.backToCharacterSelect")
    : t("characterview.customize");
  const characterRosterGridCls =
    "flex flex-wrap items-start justify-center gap-y-1";
  const rosterSlantClipPath =
    "polygon(32px 0, 100% 0, calc(100% - 32px) 100%, 0 100%)";
  const insetShadowClipPath =
  "polygon(0px 0, 100% 0, calc(100% - 4px) 100%, -8px 100%)";
  const rootCls =
    sceneOverlay && !inModal
      ? "relative z-10 flex min-h-full flex-col justify-end pb-4"
      : `${inModal || sceneOverlay ? "pb-8" : ""} ${
          sceneOverlay ? "relative z-10" : ""
        }`;
  /* ── Notebook section collapse state ── */
  const [notebookOpen, setNotebookOpen] = useState<Record<string, boolean>>({
    aboutMe: true,
    directions: false,
    styleAll: false,
    styleChat: false,
    stylePost: false,
  });
  const toggleSection = (key: string) =>
    setNotebookOpen((prev) => ({ ...prev, [key]: !prev[key] }));

  const notebookCls = sceneOverlay
    ? "border border-white/10 bg-black/20 backdrop-blur-md rounded-xl shadow-[0_18px_48px_rgba(0,0,0,0.28)]"
    : "border border-border/50 bg-card/80 backdrop-blur-xl rounded-xl shadow-sm";

  const notebookSectionRow = (
    key: string,
    label: string,
    isFirst: boolean,
    actions?: ReactNode,
    content?: ReactNode,
  ) => (
    <div key={key} data-testid={`notebook-section-${key}`}>
      {!isFirst && <div className="mx-4 h-px bg-border/30" />}
      <button
        type="button"
        className="flex w-full items-center justify-between gap-2 px-5 py-3 text-left transition-colors hover:bg-bg/40"
        onClick={() => toggleSection(key)}
      >
        <span className="flex items-center gap-2 text-sm font-medium text-txt">
          <span
            className={`inline-block text-[10px] text-muted transition-transform duration-200 ${notebookOpen[key] ? "rotate-90" : ""}`}
          >
            ▶
          </span>
          {label}
        </span>
        {actions}
      </button>
      {notebookOpen[key] && (
        <div className="px-5 pb-4">{content}</div>
      )}
    </div>
  );

  const notebookPanel = (
    <div
      className={`${notebookCls} flex flex-col overflow-hidden`}
      data-testid="character-notebook"
    >
      {/* ── About Me ── */}
      {notebookSectionRow(
        "aboutMe",
        t("characterview.aboutMe"),
        true,
        <Button
          variant="ghost"
          size="sm"
          className="h-6 rounded-md px-2 text-[10px] font-bold text-accent"
          onClick={(e) => { e.stopPropagation(); void handleGenerate("bio"); }}
          disabled={generating === "bio"}
        >
          {generating === "bio" ? "generating..." : "regenerate"}
        </Button>,
        <Textarea
          value={bioText}
          rows={6}
          placeholder={t("characterview.describeWhoYourAg")}
          onChange={(e) => handleFieldEdit("bio", e.target.value)}
          className="min-h-[10rem] resize-none overflow-y-auto rounded-lg border-border/40 bg-bg/60 p-3 text-sm leading-relaxed focus-visible:border-accent focus-visible:ring-accent/50"
        />,
      )}

      {/* ── Directions & Things to Remember ── */}
      {notebookSectionRow(
        "directions",
        t("characterview.directionsAndThing"),
        false,
        <Button
          variant="ghost"
          size="sm"
          className="h-6 rounded-md px-2 text-[10px] font-bold text-accent"
          onClick={(e) => { e.stopPropagation(); void handleGenerate("system"); }}
          disabled={generating === "system"}
        >
          {generating === "system" ? "generating..." : "regenerate"}
        </Button>,
        <Textarea
          value={d.system ?? ""}
          rows={7}
          maxLength={10000}
          placeholder={t("characterview.writeInFirstPerso")}
          onChange={(e) => handleFieldEdit("system", e.target.value)}
          className="min-h-[10rem] resize-none overflow-y-auto rounded-lg border-border/40 bg-bg/60 p-3 font-mono text-xs leading-relaxed focus-visible:border-accent focus-visible:ring-accent/50"
        />,
      )}

      {/* ── Style Rules (one section per key) ── */}
      {STYLE_SECTION_KEYS.map((key) => {
        const sectionKey = `style${key.charAt(0).toUpperCase()}${key.slice(1)}` as string;
        const items = d.style?.[key] ?? [];
        return notebookSectionRow(
          sectionKey,
          `${t("characterview.StyleRules")} — ${key} (${items.length})`,
          false,
          <Button
            variant="ghost"
            size="sm"
            className="h-6 rounded-md px-2 text-[10px] font-bold text-accent"
            onClick={(e) => { e.stopPropagation(); void handleGenerate("style", "replace"); }}
            disabled={generating === "style"}
          >
            {generating === "style" ? "generating..." : "regenerate"}
          </Button>,
          <div className="flex flex-col gap-2" data-testid={`style-section-${key}`}>
            <div className={`${scrollPaneCls} max-h-[20rem]`}>
              <div className="flex flex-col gap-2">
                {items.length > 0 ? (
                  items.map((item, index) => (
                    <div
                      key={getStyleEntryRenderKey(key, items, item, index)}
                      className="flex items-start gap-2 rounded-lg border border-border/25 bg-bg/40 p-2.5"
                      data-testid={`style-entry-${key}-${index}`}
                    >
                      <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/10 text-[10px] font-bold text-accent">
                        {index + 1}
                      </span>
                      <Textarea
                        value={styleEntryDrafts[key]?.[index] ?? item}
                        rows={2}
                        onChange={(e) =>
                          handleStyleEntryDraftChange(key, index, e.target.value)
                        }
                        onBlur={() => handleCommitStyleEntry(key, index)}
                        className="min-h-[60px] min-w-0 flex-1 resize-none rounded-md border-border/30 bg-bg/60 p-2 text-xs leading-relaxed text-txt focus-visible:border-accent/50 focus-visible:ring-accent/50"
                        data-testid={`style-entry-editor-${key}-${index}`}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 text-muted hover:bg-danger/10 hover:text-danger"
                        onClick={() => handleRemoveStyleEntry(key, index)}
                        title={t("characterview.remove")}
                      >
                        ×
                      </Button>
                    </div>
                  ))
                ) : (
                  <div className={`${hintCls} rounded-md border border-dashed border-border/30 bg-bg/30 px-3 py-2`}>
                    {STYLE_SECTION_EMPTY_STATES[key]}
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Input
                type="text"
                value={pendingStyleEntries[key]}
                placeholder={STYLE_SECTION_PLACEHOLDERS[key]}
                onChange={(e) => handlePendingStyleEntryChange(key, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleAddStyleEntry(key);
                  }
                }}
                className="h-8 min-w-0 flex-1 rounded-md border-border/30 bg-bg/60 focus-visible:border-accent focus-visible:ring-accent/50"
                data-testid={`style-entry-input-${key}`}
              />
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0 rounded-md px-3 text-[11px] font-bold"
                onClick={() => handleAddStyleEntry(key)}
                disabled={!pendingStyleEntries[key].trim()}
              >
                + add
              </Button>
            </div>
          </div>,
        );
      })}
    </div>
  );
  const chatExamplesPanel = (
    <div
      className={`${editorCardCls} min-h-[24rem]`}
      data-testid="character-chat-examples-card"
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <div className="text-sm font-bold tracking-wide text-txt">
            {t("characterview.chatExamples")}
          </div>
          <span className="rounded-full border border-white/5 bg-black/10 px-2 py-0.5 text-[11px] font-medium text-muted">
            {t("characterview.HowTheAgentResp")}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 border-border/50 bg-bg/50 text-[11px] font-bold text-accent shadow-inner transition-all hover:border-accent/40 hover:text-accent"
          onClick={() => void handleGenerate("chatExamples", "replace")}
          disabled={generating === "chatExamples"}
        >
          {generating === "chatExamples" ? "generating..." : "generate"}
        </Button>
      </div>

      <div className={`${scrollPaneCls} flex flex-1 flex-col gap-3 pr-2`}>
        {(d.messageExamples ?? []).map((convo, ci) => (
          <div
            key={convo.examples
              .map((msg) => `${msg.name}:${msg.content?.text ?? ""}`)
              .join("|")}
            className="rounded-xl border border-border/40 bg-black/10 p-4 shadow-inner backdrop-blur-sm"
          >
            <div className="mb-3 flex items-center justify-between border-b border-border/30 pb-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-muted">
                {t("characterview.conversation")} {ci + 1}
              </span>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-[10px] font-bold text-muted transition-all hover:bg-danger/10 hover:text-danger"
                onClick={() => {
                  const updated = [...(d.messageExamples ?? [])];
                  updated.splice(ci, 1);
                  handleFieldEdit("messageExamples", updated);
                }}
              >
                {t("characterview.remove")}
              </Button>
            </div>
            <div className="flex flex-col gap-2">
              {convo.examples.map((msg, mi) => (
                <div
                  key={`${msg.name}:${msg.content?.text ?? ""}`}
                  className="flex items-center gap-3"
                >
                  <span
                    className={`w-12 shrink-0 text-right text-[11px] font-bold uppercase tracking-wider ${msg.name === "{{user1}}" ? "text-muted" : "text-accent"}`}
                  >
                    {msg.name === "{{user1}}" ? "user" : "agent"}
                  </span>
                  <Input
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
                    className="h-9 flex-1 rounded-lg border-border/50 bg-bg/50 text-xs shadow-inner backdrop-blur-md transition-all focus-visible:border-accent/50 focus-visible:ring-accent/50"
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
        {(d.messageExamples ?? []).length === 0 && (
          <div
            className={`${hintCls} rounded-xl border border-white/5 bg-black/5 py-3 text-center`}
          >
            {t("characterview.noChatExamplesYet")}
          </div>
        )}
      </div>
    </div>
  );
  const postExamplesPanel = (
    <div
      className={`${editorCardCls} min-h-[24rem]`}
      data-testid="character-post-examples-card"
    >
      <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/40 pb-3">
        <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
          <div className="text-sm font-bold tracking-wide text-txt">
            {t("characterview.postExamples")}
          </div>
          <span className="rounded-full border border-white/5 bg-black/10 px-2 py-0.5 text-[11px] font-medium text-muted">
            {t("characterview.SocialMediaVoice")}
          </span>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="h-7 shrink-0 border-border/50 bg-bg/50 text-[11px] font-bold text-accent shadow-inner transition-all hover:border-accent/40 hover:text-accent"
          onClick={() => void handleGenerate("postExamples", "replace")}
          disabled={generating === "postExamples"}
        >
          {generating === "postExamples" ? "generating..." : "generate"}
        </Button>
      </div>

      <div className={`${scrollPaneCls} flex flex-1 flex-col gap-2 pr-2`}>
        {(d.postExamples ?? []).map((post: string, pi: number) => (
          <div key={post || `post-${pi}`} className="flex items-center gap-2">
            <Input
              type="text"
              value={post}
              onChange={(e) => {
                const updated = [...(d.postExamples ?? [])];
                updated[pi] = e.target.value;
                handleFieldEdit("postExamples", updated);
              }}
              className="h-9 flex-1 rounded-lg border-border/50 bg-bg/50 text-xs shadow-inner backdrop-blur-md transition-all focus-visible:border-accent/50 focus-visible:ring-accent/50"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted hover:bg-danger/10 hover:text-danger"
              onClick={() => {
                const updated = [...(d.postExamples ?? [])];
                updated.splice(pi, 1);
                handleFieldEdit("postExamples", updated);
              }}
            >
              ×
            </Button>
          </div>
        ))}
        {(d.postExamples ?? []).length === 0 && (
          <div
            className={`${hintCls} rounded-xl border border-white/5 bg-black/5 py-3 text-center`}
          >
            {t("characterview.noPostExamplesYet")}
          </div>
        )}
      </div>

      <div className="border-t border-border/40 pt-4">
        <Button
          variant="ghost"
          size="sm"
          className="self-start rounded-md border border-transparent text-[11px] font-bold text-accent transition-all hover:border-accent/30 hover:bg-accent/10"
          onClick={() => {
            const updated = [...(d.postExamples ?? []), ""];
            handleFieldEdit("postExamples", updated);
          }}
        >
          {t("characterview.AddPost")}
        </Button>
      </div>
    </div>
  );

  return (
    <div className={rootCls}>
      {/* ═══ ON-CHAIN IDENTITY ═══ */}
      {hasWallet && (
        <div className={sectionCls}>
          {!isRegistered && !dropLive && (
            <div className="flex flex-col gap-3">
              <div className="text-[12px] text-[var(--muted)]">
                {t("characterview.RegisterYourAgent")}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn text-xs py-[5px] px-4 !mt-0 cursor-pointer"
                  disabled={registryRegistering || registryLoading}
                  onClick={() => void registerOnChain()}
                >
                  {registryRegistering ? "registering..." : "register now"}
                </button>
                {registryError && (
                  <span className="text-xs text-[var(--danger,#e74c3c)]">
                    {registryError}
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {isRegistered &&
        (() => {
          const currentName = characterDraft?.name || d.name || "";
          const onChainName = registryStatus.agentName || "";
          const nameOutOfSync =
            currentName && onChainName && currentName !== onChainName;
          return (
            <div className={sectionCls}>
              <div className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[12px]">
                  <span className="text-green-400 font-bold tracking-wide">
                    {t("characterview.Registered")}
                  </span>
                  <span className="text-muted/50">|</span>
                  <span className="text-muted font-medium">
                    {t("characterview.Token")}
                    {registryStatus.tokenId}
                  </span>
                  <span className="text-muted/50">|</span>
                  <span className="text-txt font-semibold">{onChainName}</span>
                </div>
                {nameOutOfSync && (
                  <div className="flex items-center gap-3 bg-amber-400/10 border border-amber-400/20 px-3 py-2 rounded-lg">
                    <span className="text-[11px] text-amber-400/80 font-medium tracking-wide">
                      {t("characterview.OnChainName")}{" "}
                      <strong className="text-amber-400">{onChainName}</strong>{" "}
                      {t("characterview.DiffersFrom")}{" "}
                      <strong className="text-amber-400">{currentName}"</strong>
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-[10px] h-6 px-2.5 border-amber-400/50 text-amber-400 hover:bg-amber-400/20 transition-all font-bold"
                      disabled={registryRegistering}
                      onClick={() => void syncRegistryProfile()}
                    >
                      {registryRegistering ? "syncing..." : "sync to chain"}
                    </Button>
                  </div>
                )}
                {registryError && (
                  <span className="text-xs text-[var(--danger,#e74c3c)]">
                    {registryError}
                  </span>
                )}
                <a
                  href={`https://etherscan.io/token/${registryStatus.walletAddress}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] underline text-[var(--accent)]"
                >
                  {t("characterview.viewOnEtherscan")}
                </a>
              </div>
            </div>
          );
        })()}

      {hasWallet && userMinted && !isRegistered && (
        <div className={sectionCls}>
          <div className="text-[12px] text-[var(--ok,#16a34a)]">
            {t("characterview.MintedFromCollecti")}
          </div>
        </div>
      )}

      {!customOverridesEnabled ? (
        <div className={sectionCls}>
          <div className="overflow-hidden" data-testid="character-roster-grid">
            <div className={characterRosterGridCls}>
              {visibleCharacterRoster.length > 0 ? (
                visibleCharacterRoster.map((entry: CharacterRosterEntry) => {
                  const isSelected = selectedCharacterId === entry.id;

                  return (
                    <button
                      key={entry.id}
                      type="button"
                      className={`group relative -mx-3 min-w-0 w-[9.75rem] text-center transition-all duration-300 ease-out ${
                        isSelected
                          ? "z-100 scale-[1.00] opacity-100"
                          : "scale-[1.00] opacity-70 hover:scale-[1.00] hover:opacity-100"
                      }`}
                      onClick={() => handleSelectCharacter(entry)}
                      data-testid={`character-preset-${entry.id}`}
                    >
                      <div
                        className={`relative h-[10rem] w-full p-[2px] transition-all duration-300 ${
                          isSelected
                            ? "bg-yellow-400 shadow-[0_0_28px_rgba(250,204,21,0.32)]"
                            : sceneOverlay
                              ? "bg-white/10 hover:bg-white/35"
                              : "bg-border/20 hover:bg-border/60"
                        }`}
                        style={{
                          clipPath: rosterSlantClipPath,
                        }}
                      >
                        <div
                          className="relative h-full w-full overflow-hidden"
                          style={{
                            clipPath: rosterSlantClipPath,
                          }}
                        >
                          {isSelected && (
                            <div
                              className="pointer-events-none absolute -inset-3 bg-yellow-300/15 blur-xl"
                              style={{ clipPath: rosterSlantClipPath }}
                            />
                          )}
                          <img
                            src={getVrmPreviewUrl(entry.avatarIndex)}
                            alt={entry.name}
                            className={`h-full w-full object-cover transition-transform duration-300 ease-out ${
                              isSelected
                                ? "scale-[1.04]"
                                : "scale-100 group-hover:scale-[1.02]"
                            }`}
                          />
                          <div className="absolute inset-x-0 bottom-0">
                            <div
                              className={`px-2 py-1 text-sm font-semibold text-white transition-all ${
                                isSelected
                                  ? "bg-black/78 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                                  : "bg-black/62"
                              }`}
                              style={{
                                clipPath: insetShadowClipPath,
                              }}
                            >
                              {entry.name}
                            </div>
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-border/40 bg-black/10 p-4 text-sm text-muted">
                  Loading character presets...
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {customOverridesEnabled && (
        <div className="mt-3 flex flex-col gap-4">
          <div
            className="flex items-center justify-start"
            data-testid="character-edit-toolbar"
          >
            <div className="inline-flex items-center gap-2">
              <Button
                type="button"
                variant={customizeStep === "core" ? "default" : "outline"}
                size="sm"
                className="h-8 rounded-lg px-3 text-xs font-semibold"
                onClick={() => setCustomizeStep("core")}
              >
                {t("characterview.core")}
              </Button>
              <Button
                type="button"
                variant={customizeStep === "examples" ? "default" : "outline"}
                size="sm"
                className="h-8 rounded-lg px-3 text-xs font-semibold"
                onClick={() => setCustomizeStep("examples")}
              >
                {t("characterview.examples")}
              </Button>
            </div>
          </div>

          {customizeStep === "examples" ? (
            <div
              className="grid min-h-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)_minmax(0,24rem)] xl:items-start xl:gap-6"
              data-testid="character-examples-grid"
            >
              {chatExamplesPanel}
              <div aria-hidden className="hidden xl:block" />
              {postExamplesPanel}
            </div>
          ) : (
            <div
              className="mx-auto w-full max-w-2xl"
              data-testid="character-customize-grid"
            >
              {notebookPanel}
            </div>
          )}
        </div>
      )}

      <div className={`${sectionCls} relative z-10`}>
        {(characterSaveSuccess || combinedSaveError) && (
          <div className="mb-3 flex flex-wrap items-center justify-center gap-2">
            {characterSaveSuccess && (
              <span className="rounded-lg border border-green-400/20 bg-green-400/10 px-3 py-1.5 text-xs font-bold text-green-400">
                {characterSaveSuccess}
              </span>
            )}
            {combinedSaveError && (
              <span className="rounded-lg border border-danger/20 bg-danger/10 px-3 py-1.5 text-xs font-medium text-danger">
                {combinedSaveError}
              </span>
            )}
          </div>
        )}

        <div className="relative flex flex-col gap-3 md:min-h-10 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center justify-center md:justify-start">
            <div
              className="flex min-w-0 items-center gap-2"
              data-testid="character-voice-picker"
            >
              <Button
                type="button"
                variant={voiceSelectionLocked ? "default" : "outline"}
                size="icon"
                className="h-8 w-8 rounded-full border-border/50 bg-bg/65 p-0 shadow-inner backdrop-blur-sm"
                onClick={() => setVoiceSelectionLocked((value) => !value)}
                aria-label={
                  voiceSelectionLocked
                    ? "Unlock voice selection"
                    : "Lock voice selection"
                }
                title={
                  voiceSelectionLocked
                    ? "Voice stays pinned when switching characters"
                    : "Lock current voice"
                }
              >
                {voiceSelectionLocked ? (
                  <Lock className="h-3.5 w-3.5" />
                ) : (
                  <LockOpen className="h-3.5 w-3.5" />
                )}
              </Button>
              <ThemedSelect
                value={voiceSelectValue}
                groups={VOICE_SELECT_GROUPS}
                onChange={(id) => {
                  const preset = PREMADE_VOICES.find(
                    (voicePreset) => voicePreset.id === id,
                  );
                  if (preset) handleSelectPreset(preset);
                }}
                placeholder={t("characterview.selectAVoice")}
                menuPlacement="top"
                className="w-[11rem] max-w-[58vw]"
                triggerClassName="h-8 rounded-full border-border/50 bg-bg/65 px-4 py-0 text-[11px] shadow-inner backdrop-blur-sm"
                menuClassName="border-border/60 bg-bg/92 shadow-2xl backdrop-blur-md"
              />
              <Button
                type="button"
                variant={voiceTesting ? "destructive" : "outline"}
                size="icon"
                className="h-8 w-8 rounded-full border-border/50 bg-bg/65 p-0 shadow-inner backdrop-blur-sm"
                onClick={() =>
                  voiceTesting
                    ? handleStopTest()
                    : activeVoicePreset
                      ? handleTestVoice(activeVoicePreset.previewUrl)
                      : undefined
                }
                aria-label={voiceTesting ? "Stop voice preview" : "Preview voice"}
                title={voiceTesting ? "Stop voice preview" : "Preview voice"}
                disabled={!activeVoicePreset || voiceLoading}
              >
                {voiceTesting ? (
                  <VolumeX className="h-3.5 w-3.5" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center md:absolute md:left-1/2 md:top-1/2 md:z-10 md:-translate-x-1/2 md:-translate-y-1/2">
            <Button
              size="lg"
              className="rounded-xl px-8 text-[13px] font-bold tracking-wider shadow-[0_0_15px_rgba(var(--accent),0.2)] transition-all hover:shadow-[0_0_20px_rgba(var(--accent),0.4)]"
              disabled={characterSaving || voiceSaving}
              onClick={() => void handleSaveAll()}
            >
              {characterSaving || voiceSaving ? "saving..." : "Save Character"}
            </Button>
          </div>

          <div className="flex items-center justify-center md:justify-end">
            <Button
              type="button"
              variant={customOverridesEnabled ? "outline" : "default"}
              size="sm"
              className={`h-10 rounded-xl px-4 text-sm font-semibold ${
                customOverridesEnabled
                  ? "border-border/40 bg-bg/40 text-txt"
                  : "shadow-[0_0_18px_rgba(var(--accent),0.18)]"
              }`}
              onClick={() =>
                handleCustomOverridesChange(!customOverridesEnabled)
              }
              data-testid="character-customize-toggle"
            >
              {customizationActionLabel}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
