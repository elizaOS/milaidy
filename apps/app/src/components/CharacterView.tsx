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
  ConfigRenderer,
  defaultRegistry,
  type JsonSchemaObject,
} from "@milady/app-core/config";
import {
  dispatchWindowEvent,
  VOICE_CONFIG_UPDATED_EVENT,
} from "@milady/app-core/events";
import { getVrmPreviewUrl, useApp } from "@milady/app-core/state";
import type { ConfigUiHint } from "@milady/app-core/types";
import { alertDesktopMessage } from "@milady/app-core/utils";
import {
  PREMADE_VOICES,
  sanitizeApiKey,
  type VoicePreset,
} from "@milady/app-core/voice";
import {
  Button,
  Checkbox,
  Input,
  TagEditor,
  Textarea,
  ThemedSelect,
} from "@milady/ui";
import { useCallback, useEffect, useRef, useState } from "react";

const DEFAULT_ELEVEN_FAST_MODEL = "eleven_flash_v2_5";

type CharacterConversation = NonNullable<
  CharacterData["messageExamples"]
>[number];
type CharacterMessage = CharacterConversation["examples"][number];
type StyleSectionKey = "all" | "chat" | "post";

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
    topics: [...preset.topics],
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
    topics: character.topics ?? [],
    style: {
      all: character.style?.all ?? [],
      chat: character.style?.chat ?? [],
      post: character.style?.post ?? [],
    },
    messageExamples: character.messageExamples ?? [],
    postExamples: character.postExamples ?? [],
  };
}

function normalizeCharacterDraft(character: CharacterData | null | undefined) {
  return {
    name: typeof character?.name === "string" ? character.name.trim() : "",
    bio:
      typeof character?.bio === "string"
        ? character.bio.trim()
        : Array.isArray(character?.bio)
          ? character.bio.join("\n").trim()
          : "",
    system:
      typeof character?.system === "string" ? character.system.trim() : "",
    adjectives: Array.isArray(character?.adjectives)
      ? [...character.adjectives]
      : [],
    topics: Array.isArray(character?.topics) ? [...character.topics] : [],
    style: {
      all: Array.isArray(character?.style?.all) ? [...character.style.all] : [],
      chat: Array.isArray(character?.style?.chat)
        ? [...character.style.chat]
        : [],
      post: Array.isArray(character?.style?.post)
        ? [...character.style.post]
        : [],
    },
    messageExamples: character?.messageExamples ?? [],
    postExamples: Array.isArray(character?.postExamples)
      ? [...character.postExamples]
      : [],
  };
}

function doesDraftMatchRosterEntry(
  character: CharacterData | null | undefined,
  entry: CharacterRosterEntry,
) {
  return (
    JSON.stringify(normalizeCharacterDraft(character)) ===
    JSON.stringify(
      normalizeCharacterDraft(buildCharacterDraftFromPreset(entry)),
    )
  );
}

function truncateCopy(value: string, max = 170) {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max - 1).trimEnd()}…`;
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
    const draftTopics = new Set(character.topics ?? []);
    for (const adjective of entry.preset.adjectives) {
      if (draftAdjectives.has(adjective)) score += 1;
    }
    for (const topic of entry.preset.topics) {
      if (draftTopics.has(topic)) score += 1;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out = value.filter((item): item is string => typeof item === "string");
  return out.length > 0 ? out : [];
}

function parseImportedMessage(value: unknown): CharacterMessage | null {
  if (!isRecord(value)) return null;
  const speaker =
    typeof value.user === "string"
      ? value.user
      : typeof value.name === "string"
        ? value.name
        : "{{user1}}";
  const content = value.content;
  const contentText =
    isRecord(content) && typeof content.text === "string"
      ? content.text
      : typeof value.text === "string"
        ? value.text
        : "";
  return {
    name: speaker,
    content: { text: contentText },
  };
}

function parseImportedMessageExamples(
  value: unknown,
): CharacterData["messageExamples"] {
  if (!Array.isArray(value)) return [];
  const conversations: CharacterConversation[] = [];
  for (const convo of value) {
    const source = Array.isArray(convo)
      ? convo
      : isRecord(convo) && Array.isArray(convo.examples)
        ? convo.examples
        : null;
    if (!source) continue;
    const examples: CharacterMessage[] = [];
    for (const message of source) {
      const parsed = parseImportedMessage(message);
      if (parsed) examples.push(parsed);
    }
    if (examples.length > 0) {
      conversations.push({ examples });
    }
  }
  return conversations;
}

/* ── CharacterView ──────────────────────────────────────────────────── */

export function CharacterView({ inModal }: { inModal?: boolean } = {}) {
  const {
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

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  /* ── Import / Export ────────────────────────────────────────────── */
  const handleExport = useCallback(() => {
    const d = characterDraft;
    const exportData = {
      name: d.name ?? "",
      bio:
        typeof d.bio === "string"
          ? d.bio.split("\n").filter(Boolean)
          : (d.bio ?? []),
      system: d.system ?? "",
      style: {
        all: d.style?.all ?? [],
        chat: d.style?.chat ?? [],
        post: d.style?.post ?? [],
      },
      adjectives: d.adjectives ?? [],
      topics: d.topics ?? [],
      messageExamples: (d.messageExamples ?? []).map((convo) =>
        (convo.examples ?? []).map((msg) => ({
          user: msg.name,
          content: { text: msg.content?.text ?? "" },
        })),
      ),
      postExamples: d.postExamples ?? [],
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(d.name ?? "character").toLowerCase().replace(/\s+/g, "-")}.character.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [characterDraft]);

  const handleImport = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const rawText = reader.result;
          if (typeof rawText !== "string") throw new Error("invalid file");
          const parsed: unknown = JSON.parse(rawText);
          if (!isRecord(parsed)) throw new Error("invalid file");

          if (typeof parsed.name === "string") {
            handleCharacterFieldInput("name", parsed.name);
          }
          if (typeof parsed.bio === "string") {
            handleCharacterFieldInput("bio", parsed.bio);
          } else {
            const bio = readStringArray(parsed.bio);
            if (bio) {
              handleCharacterFieldInput("bio", bio.join("\n"));
            }
          }
          if (typeof parsed.system === "string") {
            handleCharacterFieldInput("system", parsed.system);
          }

          const adjectives = readStringArray(parsed.adjectives);
          if (adjectives) handleCharacterFieldInput("adjectives", adjectives);
          const topics = readStringArray(parsed.topics);
          if (topics) handleCharacterFieldInput("topics", topics);

          if (isRecord(parsed.style)) {
            const all = readStringArray(parsed.style.all);
            if (all) handleCharacterStyleInput("all", all.join("\n"));
            else if (typeof parsed.style.all === "string")
              handleCharacterStyleInput("all", parsed.style.all);

            const chat = readStringArray(parsed.style.chat);
            if (chat) handleCharacterStyleInput("chat", chat.join("\n"));
            else if (typeof parsed.style.chat === "string")
              handleCharacterStyleInput("chat", parsed.style.chat);

            const post = readStringArray(parsed.style.post);
            if (post) handleCharacterStyleInput("post", post.join("\n"));
            else if (typeof parsed.style.post === "string")
              handleCharacterStyleInput("post", parsed.style.post);
          }

          const messageExamples =
            parseImportedMessageExamples(parsed.messageExamples) ?? [];
          if (messageExamples.length > 0) {
            handleCharacterFieldInput("messageExamples", messageExamples);
          }

          const postExamples = readStringArray(parsed.postExamples);
          if (postExamples)
            handleCharacterFieldInput("postExamples", postExamples);
          setSelectedCharacterId(null);
          setCustomOverridesEnabled(true);
        } catch {
          void alertDesktopMessage({
            title: "Invalid Character File",
            message: "Invalid JSON file.",
            type: "error",
          });
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [handleCharacterFieldInput, handleCharacterStyleInput],
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
            setSelectedVoicePresetId(preset?.id ?? "custom");
          }
        }
      } catch {
        /* ignore */
      }
      setVoiceLoading(false);
    })();
  }, []);

  const handleVoiceFieldChange = useCallback(
    (key: string, value: string | number) => {
      setVoiceConfig((prev) => ({
        ...prev,
        elevenlabs: { ...(prev.elevenlabs ?? {}), [key]: value },
      }));
    },
    [],
  );

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
      handleFieldEdit("topics", nextCharacter.topics ?? []);
      handleFieldEdit(
        "style",
        nextCharacter.style ?? { all: [], chat: [], post: [] },
      );
      handleFieldEdit("messageExamples", nextCharacter.messageExamples ?? []);
      handleFieldEdit("postExamples", nextCharacter.postExamples ?? []);
      applyVoicePresetForEntry(entry);
    },
    [applyVoicePresetForEntry, handleFieldEdit],
  );

  const commitCharacterSelection = useCallback(
    (entry: CharacterRosterEntry, applyDefaults: boolean) => {
      setSelectedCharacterId(entry.id);
      setState("selectedVrmIndex", entry.avatarIndex);
      if (applyDefaults) {
        applyCharacterDefaults(entry);
      }
    },
    [applyCharacterDefaults, setState],
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
      topics: d.topics ?? [],
      style: d.style ?? { all: [], chat: [], post: [] },
      postExamples: d.postExamples ?? [],
    }),
    [d, bioText],
  );

  useEffect(() => {
    if (selectedCharacterId || !characterRoster.length) return;
    const matchedId = findMatchingRosterEntry(
      characterData ?? characterDraft,
      selectedVrmIndex,
      characterRoster,
    );
    if (!matchedId) {
      setCustomOverridesEnabled(true);
      return;
    }
    const matchedEntry =
      characterRoster.find((entry) => entry.id === matchedId) ?? null;
    if (!matchedEntry) return;
    setSelectedCharacterId(matchedId);
    setCustomOverridesEnabled(
      !doesDraftMatchRosterEntry(characterDraft, matchedEntry),
    );
  }, [
    characterData,
    characterDraft,
    characterRoster,
    selectedCharacterId,
    selectedVrmIndex,
  ]);

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
      commitCharacterSelection(entry, !customOverridesEnabled);
    },
    [commitCharacterSelection, customOverridesEnabled],
  );

  const handleCustomOverridesChange = useCallback(
    (enabled: boolean) => {
      setCustomOverridesEnabled(enabled);
      if (enabled) return;

      const activeEntry =
        characterRoster.find((entry) => entry.id === selectedCharacterId) ??
        null;
      if (activeEntry) {
        commitCharacterSelection(activeEntry, true);
      }
    },
    [characterRoster, commitCharacterSelection, selectedCharacterId],
  );

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
  const cardCls =
    "p-5 border border-border/40 bg-card/40 backdrop-blur-xl rounded-2xl shadow-sm";
  const editorCardCls = `${cardCls} flex min-h-0 flex-col overflow-hidden`;
  const sectionCls = inModal ? `mt-4 ${cardCls}` : `mt-4 ${cardCls}`;
  const labelCls = "font-medium text-xs text-muted mb-1 block";
  const hintCls = "text-[11px] text-muted";
  const scrollPaneCls =
    "min-h-0 overflow-y-auto pr-1 [scrollbar-gutter:stable] custom-scrollbar";

  /* Hidden file input for import */
  const fileInput = (
    <input
      ref={fileInputRef}
      type="file"
      accept=".json"
      className="hidden"
      onChange={handleImport}
    />
  );

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
  const activeCharacter =
    characterRoster.find((entry) => entry.id === selectedCharacterId) ?? null;
  const activeVoicePreset =
    PREMADE_VOICES.find((preset) => preset.id === selectedVoicePresetId) ??
    null;
  const combinedSaveError = voiceSaveError ?? characterSaveError;

  return (
    <div className={inModal ? "pb-8" : ""}>
      {fileInput}

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

      <div className={sectionCls}>
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-border/40 pb-3">
          <div className="font-bold text-sm tracking-wide text-txt">
            Character Select
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] font-medium border-border/50 bg-bg/50 backdrop-blur-sm shadow-inner hover:text-accent hover:border-accent/40 transition-all"
              onClick={() => {
                setSelectedCharacterId(null);
                setCustomOverridesEnabled(false);
                void loadCharacter();
              }}
              disabled={characterLoading}
            >
              {characterLoading ? "loading..." : "reload"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] font-medium border-border/50 bg-bg/50 backdrop-blur-sm shadow-inner hover:text-accent hover:border-accent/40 transition-all"
              onClick={() => fileInputRef.current?.click()}
              title={t("characterview.importCharacterJso")}
            >
              {t("characterview.import")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] font-medium border-border/50 bg-bg/50 backdrop-blur-sm shadow-inner hover:text-accent hover:border-accent/40 transition-all"
              onClick={handleExport}
              title={t("characterview.exportAsCharacter")}
            >
              {t("characterview.export")}
            </Button>
          </div>
        </div>
        <div
          className="mt-4 overflow-hidden"
          data-testid="character-roster-grid"
        >
          <div className="grid grid-cols-4 gap-4">
            {visibleCharacterRoster.length > 0 ? (
              visibleCharacterRoster.map((entry) => {
                const isSelected = selectedCharacterId === entry.id;
                const rosterBio = truncateCopy(
                  replaceCharacterToken(entry.preset.bio[0] ?? "", entry.name),
                  120,
                );
                const rosterDirections = truncateCopy(
                  replaceCharacterToken(entry.preset.system, entry.name),
                  160,
                );

                return (
                  <button
                    key={entry.id}
                    type="button"
                    className={`flex min-w-0 w-full flex-col rounded-2xl border p-4 text-left transition-all ${
                      isSelected
                        ? "border-accent bg-accent/5 shadow-[0_0_0_1px_rgba(var(--accent),0.25)]"
                        : "border-border/40 bg-black/10 hover:border-accent/30 hover:bg-accent/5"
                    }`}
                    onClick={() => handleSelectCharacter(entry)}
                    data-testid={`character-preset-${entry.id}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="text-base font-semibold text-txt">
                          {entry.name}
                        </div>
                        <div className="mt-1 text-xs uppercase tracking-[0.18em] text-muted">
                          {entry.preset.hint}
                        </div>
                      </div>
                      <span
                        className={`rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-[0.18em] ${
                          isSelected
                            ? "border-accent/40 bg-accent/10 text-accent"
                            : "border-white/10 bg-black/20 text-muted"
                        }`}
                      >
                        {isSelected ? "selected" : entry.preset.catchphrase}
                      </span>
                    </div>

                    <img
                      src={getVrmPreviewUrl(entry.avatarIndex)}
                      alt={entry.name}
                      className="mt-4 h-44 w-full rounded-2xl object-cover"
                    />

                    <p className="mt-4 text-sm leading-relaxed text-muted">
                      {rosterBio}
                    </p>

                    <div className="mt-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
                        Directions
                      </div>
                      <p className="mt-2 text-xs leading-relaxed text-muted">
                        {rosterDirections}
                      </p>
                    </div>

                    <div className="mt-4">
                      <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">
                        Topics
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {entry.preset.topics.slice(0, 4).map((topic) => (
                          <span
                            key={topic}
                            className="rounded-full border border-border/40 bg-bg/50 px-2 py-1 text-[11px] text-txt"
                          >
                            {topic}
                          </span>
                        ))}
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

        <div className="mt-6 rounded-2xl border border-border/40 bg-black/10 p-4 shadow-inner">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div className="space-y-1">
              <div className="text-sm font-bold tracking-wide text-txt">
                Custom Overrides
              </div>
              <div className="text-xs leading-relaxed text-muted">
                When custom is on, the fields below override the selected
                character and switching characters only swaps the avatar. Turn
                custom off to use the selected character defaults.
              </div>
            </div>
            <label
              htmlFor="character-customize-toggle"
              className="flex items-center gap-3 rounded-xl border border-border/40 bg-bg/40 px-3 py-2 text-sm text-txt cursor-pointer"
            >
              <Checkbox
                id="character-customize-toggle"
                checked={customOverridesEnabled}
                onCheckedChange={(checked) =>
                  handleCustomOverridesChange(checked === true)
                }
                data-testid="character-customize-toggle"
              />
              <span className="font-medium">Enable custom overrides</span>
            </label>
          </div>
          {!customOverridesEnabled && (
            <div className="mt-4 rounded-xl border border-border/30 bg-bg/40 px-3 py-2 text-xs text-muted">
              {activeCharacter
                ? `${activeCharacter.name} defaults are active. Turn custom on to override them below.`
                : "Pick a character to load its defaults, then turn custom on if you want to override them."}
            </div>
          )}
        </div>
      </div>

      {customOverridesEnabled && (
        <>
          <div
            className="mt-4 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]"
            data-testid="character-customize-grid"
          >
            <div className="grid min-h-0 gap-6 xl:h-[50rem] xl:grid-rows-[minmax(0,1fr)_minmax(0,1fr)]">
              <div className={editorCardCls}>
                <div className="flex items-center justify-between">
                  <span className={labelCls}>{t("characterview.aboutMe")}</span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] font-bold text-accent hover:bg-accent/10 border border-transparent hover:border-accent/30 transition-all rounded-md"
                    onClick={() => void handleGenerate("bio")}
                    disabled={generating === "bio"}
                  >
                    {generating === "bio" ? "generating..." : "regenerate"}
                  </Button>
                </div>
                <Textarea
                  value={bioText}
                  rows={6}
                  placeholder={t("characterview.describeWhoYourAg")}
                  onChange={(e) => handleFieldEdit("bio", e.target.value)}
                  className="min-h-0 flex-1 resize-none overflow-y-auto rounded-xl border-border/50 bg-bg/50 p-3 text-sm leading-relaxed shadow-inner backdrop-blur-md focus-visible:border-accent focus-visible:ring-accent/50"
                />
              </div>

              <div className={editorCardCls}>
                <div className="flex items-center justify-between">
                  <span className={labelCls}>
                    {t("characterview.directionsAndThing")}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-2 text-[10px] font-bold text-accent hover:bg-accent/10 border border-transparent hover:border-accent/30 transition-all rounded-md"
                    onClick={() => void handleGenerate("system")}
                    disabled={generating === "system"}
                  >
                    {generating === "system" ? "generating..." : "regenerate"}
                  </Button>
                </div>
                <Textarea
                  value={d.system ?? ""}
                  rows={7}
                  maxLength={10000}
                  placeholder={t("characterview.writeInFirstPerso")}
                  onChange={(e) => handleFieldEdit("system", e.target.value)}
                  className="min-h-0 flex-1 resize-none overflow-y-auto rounded-xl border-border/50 bg-bg/50 p-3 font-mono text-xs leading-relaxed shadow-inner backdrop-blur-md focus-visible:border-accent focus-visible:ring-accent/50"
                />
              </div>
            </div>

            <div
              className="grid min-h-0 gap-6 xl:h-[50rem] xl:grid-rows-[minmax(0,0.8fr)_minmax(0,1.2fr)]"
              data-testid="character-customize-sidebar"
            >
              <div
                className={editorCardCls}
                data-testid="character-topics-card"
              >
                <TagEditor
                  className="min-h-0 flex-1"
                  label={t("characterview.topics")}
                  items={d.topics ?? []}
                  onChange={(items) =>
                    handleCharacterArrayInput("topics", items.join("\n"))
                  }
                  placeholder={t("characterview.addTopic")}
                  listClassName={`flex-1 ${scrollPaneCls}`}
                />
              </div>

              <div
                className={`${editorCardCls} relative z-20`}
                data-testid="character-voice-card"
              >
                <div className="mb-4 border-b border-border/40 pb-3 text-sm font-bold tracking-wide text-txt">
                  {t("characterview.Voice")}
                </div>

                {voiceLoading ? (
                  <div className="flex flex-1 items-center justify-center rounded-xl border border-white/5 bg-black/5 py-8 text-center text-[13px] text-muted animate-pulse">
                    {t("characterview.LoadingVoiceConfig")}
                  </div>
                ) : (
                  <>
                    <div
                      className={`${scrollPaneCls} flex flex-1 flex-col gap-5 pr-2`}
                    >
                      <div className="max-w-lg text-xs leading-relaxed text-muted/80">
                        {t("characterview.ChooseTheSpeaking")}
                      </div>

                      <div className="flex flex-col gap-2">
                        <span className={labelCls}>
                          {t("characterview.voice")}
                        </span>
                        <div className="flex flex-wrap items-center gap-3">
                          <ThemedSelect
                            value={
                              selectedVoicePresetId === "custom"
                                ? "__custom__"
                                : (selectedVoicePresetId ?? null)
                            }
                            groups={[
                              {
                                label: "Female",
                                items: PREMADE_VOICES.filter(
                                  (preset) => preset.gender === "female",
                                ).map((preset) => ({
                                  id: preset.id,
                                  text: preset.name,
                                  hint: preset.hint,
                                })),
                              },
                              {
                                label: "Male",
                                items: PREMADE_VOICES.filter(
                                  (preset) => preset.gender === "male",
                                ).map((preset) => ({
                                  id: preset.id,
                                  text: preset.name,
                                  hint: preset.hint,
                                })),
                              },
                              {
                                label: "Character",
                                items: PREMADE_VOICES.filter(
                                  (preset) => preset.gender === "character",
                                ).map((preset) => ({
                                  id: preset.id,
                                  text: preset.name,
                                  hint: preset.hint,
                                })),
                              },
                              {
                                label: "Other",
                                items: [
                                  {
                                    id: "__custom__",
                                    text: "Custom voice ID...",
                                  },
                                ],
                              },
                            ]}
                            onChange={(id) => {
                              if (id === "__custom__") {
                                setSelectedVoicePresetId("custom");
                              } else {
                                const preset = PREMADE_VOICES.find(
                                  (voicePreset) => voicePreset.id === id,
                                );
                                if (preset) handleSelectPreset(preset);
                              }
                            }}
                            placeholder={t("characterview.selectAVoice")}
                          />
                          {activeVoicePreset &&
                            (voiceTesting ? (
                              <Button
                                variant="destructive"
                                size="sm"
                                className="h-9 px-4 font-bold rounded-xl shadow-sm"
                                onClick={handleStopTest}
                              >
                                {t("characterview.stop")}
                              </Button>
                            ) : (
                              <Button
                                variant="secondary"
                                size="sm"
                                className="h-9 px-4 font-bold border border-white/5 shadow-sm hover:shadow-[0_0_10px_rgba(255,255,255,0.1)] transition-all rounded-xl"
                                onClick={() =>
                                  handleTestVoice(activeVoicePreset.previewUrl)
                                }
                              >
                                {t("characterview.preview")}
                              </Button>
                            ))}
                        </div>
                      </div>

                      {selectedVoicePresetId === "custom" && (
                        <div className="flex flex-col gap-2">
                          <span className={labelCls}>
                            {t("characterview.voiceID")}
                          </span>
                          <Input
                            type="text"
                            value={voiceConfig.elevenlabs?.voiceId ?? ""}
                            placeholder={t("characterview.pasteElevenLabsVoi")}
                            onChange={(e) =>
                              handleVoiceFieldChange("voiceId", e.target.value)
                            }
                            className="h-9 w-full rounded-xl border-border/50 bg-bg/50 font-mono text-[13px] shadow-inner backdrop-blur-md transition-all focus-visible:border-accent focus-visible:ring-accent/50"
                          />
                        </div>
                      )}

                      <details className="group">
                        <summary className="flex cursor-pointer list-none select-none items-center gap-2 rounded-xl border border-white/5 bg-black/5 p-3 text-xs font-bold transition-colors hover:bg-black/10 [&::-webkit-details-marker]:hidden">
                          <span className="inline-block text-accent transition-transform group-open:rotate-90">
                            &#9654;
                          </span>

                          {t("characterview.advancedVoiceSetti")}
                        </summary>
                        <div className="mt-4 rounded-xl border border-border/20 bg-black/10 p-4 shadow-inner">
                          <ConfigRenderer
                            schema={
                              {
                                type: "object",
                                properties: {
                                  modelId: {
                                    type: "string",
                                    enum: [
                                      "",
                                      "eleven_flash_v2_5",
                                      "eleven_turbo_v2_5",
                                      "eleven_multilingual_v2",
                                      "eleven_turbo_v2",
                                      "eleven_monolingual_v1",
                                    ],
                                  },
                                  stability: {
                                    type: "number",
                                    minimum: 0,
                                    maximum: 1,
                                  },
                                  similarityBoost: {
                                    type: "number",
                                    minimum: 0,
                                    maximum: 1,
                                  },
                                  speed: {
                                    type: "number",
                                    minimum: 0.5,
                                    maximum: 2,
                                  },
                                },
                              } satisfies JsonSchemaObject
                            }
                            hints={{
                              modelId: {
                                label: "Model",
                                type: "select",
                                width: "full",
                                options: [
                                  { value: "", label: "Default (Flash v2.5)" },
                                  {
                                    value: "eleven_flash_v2_5",
                                    label: "Flash v2.5 (Fastest)",
                                  },
                                  {
                                    value: "eleven_turbo_v2_5",
                                    label: "Turbo v2.5",
                                  },
                                  {
                                    value: "eleven_multilingual_v2",
                                    label: "Multilingual v2",
                                  },
                                  {
                                    value: "eleven_turbo_v2",
                                    label: "Turbo v2",
                                  },
                                  {
                                    value: "eleven_monolingual_v1",
                                    label: "Monolingual v1",
                                  },
                                ],
                              } satisfies ConfigUiHint,
                              stability: {
                                label: "Stability",
                                type: "number",
                                width: "third",
                                placeholder: "0.5",
                                step: 0.05,
                              } satisfies ConfigUiHint,
                              similarityBoost: {
                                label: "Similarity",
                                type: "number",
                                width: "third",
                                placeholder: "0.75",
                                step: 0.05,
                              } satisfies ConfigUiHint,
                              speed: {
                                label: "Speed",
                                type: "number",
                                width: "third",
                                placeholder: "1.0",
                                step: 0.1,
                              } satisfies ConfigUiHint,
                            }}
                            values={{
                              modelId: voiceConfig.elevenlabs?.modelId ?? "",
                              stability:
                                voiceConfig.elevenlabs?.stability ?? "",
                              similarityBoost:
                                voiceConfig.elevenlabs?.similarityBoost ?? "",
                              speed: voiceConfig.elevenlabs?.speed ?? "",
                            }}
                            registry={defaultRegistry}
                            onChange={(key, value) => {
                              handleVoiceFieldChange(
                                key,
                                key === "modelId"
                                  ? String(value)
                                  : typeof value === "number"
                                    ? value
                                    : parseFloat(String(value)) || 0,
                              );
                            }}
                          />
                        </div>
                      </details>
                    </div>

                    <div className="border-t border-border/40 pt-4 text-xs text-muted">
                      Voice settings save with the character.
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div
            className="mt-4 flex flex-col gap-6"
            data-testid="character-style-examples-grid"
          >
            <div
              className={`${editorCardCls} lg:h-[36rem] xl:h-[38rem]`}
              data-testid="character-style-editor"
            >
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-border/40 pb-3">
                <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                  <div className="font-bold text-sm tracking-wide text-txt">
                    {t("characterview.StyleRules")}
                  </div>
                  <span className="rounded-full border border-white/5 bg-black/10 px-2 py-0.5 text-[11px] font-medium tracking-wide text-muted">
                    {t("characterview.CommunicationGuid")}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 border-border/50 bg-bg/50 text-[11px] font-bold text-accent shadow-inner transition-all hover:border-accent/40 hover:text-accent"
                  onClick={() => void handleGenerate("style", "replace")}
                  disabled={generating === "style"}
                >
                  {generating === "style" ? "generating..." : "regenerate"}
                </Button>
              </div>

              <div
                className="grid min-h-0 flex-1 gap-4 lg:grid-cols-2 xl:grid-cols-3"
                data-testid="character-style-editor-scroll"
              >
                {STYLE_SECTION_KEYS.map((key) => {
                  const items = d.style?.[key] ?? [];
                  return (
                    <div
                      key={key}
                      className="flex min-h-0 flex-col overflow-hidden rounded-xl border border-border/40 bg-black/10 shadow-inner"
                      data-testid={`style-section-${key}`}
                    >
                      <div className="flex items-center justify-between gap-2 border-b border-border/30 px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-bold uppercase tracking-widest text-muted">
                            {key}
                          </span>
                          <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted/70">
                            {items.length} rule{items.length === 1 ? "" : "s"}
                          </span>
                        </div>
                      </div>

                      <div className={`${scrollPaneCls} flex-1 p-4 pr-2`}>
                        <div className="flex flex-col gap-2">
                          {items.length > 0 ? (
                            items.map((item, index) => (
                              <div
                                key={getStyleEntryRenderKey(
                                  key,
                                  items,
                                  item,
                                  index,
                                )}
                                className="flex items-start gap-3 rounded-lg border border-border/30 bg-bg/40 p-3"
                                data-testid={`style-entry-${key}-${index}`}
                              >
                                <span className="mt-0.5 shrink-0 text-[10px] font-bold text-muted/70">
                                  {index + 1}
                                </span>
                                <Textarea
                                  value={styleEntryDrafts[key]?.[index] ?? item}
                                  rows={2}
                                  onChange={(e) =>
                                    handleStyleEntryDraftChange(
                                      key,
                                      index,
                                      e.target.value,
                                    )
                                  }
                                  onBlur={() =>
                                    handleCommitStyleEntry(key, index)
                                  }
                                  className="min-h-[88px] min-w-0 flex-1 resize-none rounded-lg border-border/50 bg-bg/50 p-2 text-xs leading-relaxed text-txt shadow-inner backdrop-blur-md transition-all focus-visible:border-accent/50 focus-visible:ring-accent/50"
                                  data-testid={`style-entry-editor-${key}-${index}`}
                                />
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7 shrink-0 text-muted hover:bg-danger/10 hover:text-danger"
                                  onClick={() =>
                                    handleRemoveStyleEntry(key, index)
                                  }
                                  title={t("characterview.remove")}
                                >
                                  ×
                                </Button>
                              </div>
                            ))
                          ) : (
                            <div
                              className={`${hintCls} rounded-lg border border-dashed border-border/40 bg-bg/30 px-3 py-2`}
                            >
                              {STYLE_SECTION_EMPTY_STATES[key]}
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="border-t border-border/30 p-4">
                        <div className="flex items-center gap-2">
                          <Input
                            type="text"
                            value={pendingStyleEntries[key]}
                            placeholder={STYLE_SECTION_PLACEHOLDERS[key]}
                            onChange={(e) =>
                              handlePendingStyleEntryChange(key, e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddStyleEntry(key);
                              }
                            }}
                            className="h-9 min-w-0 flex-1 rounded-xl border-border/50 bg-bg/50 shadow-inner backdrop-blur-md transition-all focus-visible:border-accent focus-visible:ring-accent/50"
                            data-testid={`style-entry-input-${key}`}
                          />
                          <Button
                            variant="outline"
                            size="sm"
                            className="h-9 shrink-0 border-border/50 bg-bg/50 px-3 text-[11px] font-bold text-txt shadow-inner transition-all hover:border-accent/40 hover:text-txt"
                            onClick={() => handleAddStyleEntry(key)}
                            disabled={!pendingStyleEntries[key].trim()}
                          >
                            + add
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div
              className="grid min-h-0 grid-cols-1 gap-6 lg:h-[36rem] lg:grid-cols-2 xl:h-[38rem]"
              data-testid="character-examples-grid"
            >
              <div
                className={editorCardCls}
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
                    onClick={() =>
                      void handleGenerate("chatExamples", "replace")
                    }
                    disabled={generating === "chatExamples"}
                  >
                    {generating === "chatExamples"
                      ? "generating..."
                      : "generate"}
                  </Button>
                </div>

                <div
                  className={`${scrollPaneCls} flex flex-1 flex-col gap-3 pr-2`}
                >
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

              <div
                className={editorCardCls}
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
                    onClick={() =>
                      void handleGenerate("postExamples", "replace")
                    }
                    disabled={generating === "postExamples"}
                  >
                    {generating === "postExamples"
                      ? "generating..."
                      : "generate"}
                  </Button>
                </div>

                <div
                  className={`${scrollPaneCls} flex flex-1 flex-col gap-2 pr-2`}
                >
                  {(d.postExamples ?? []).map((post: string, pi: number) => (
                    <div
                      key={post || `post-${pi}`}
                      className="flex items-center gap-2"
                    >
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
            </div>
          </div>
        </>
      )}

      <div className={`${sectionCls} relative z-10`}>
        <div className="flex items-center justify-end gap-4">
          {characterSaveSuccess && (
            <span className="text-xs text-green-400 font-bold bg-green-400/10 px-3 py-1.5 rounded-lg border border-green-400/20">
              {characterSaveSuccess}
            </span>
          )}
          {combinedSaveError && (
            <span className="text-xs text-danger bg-danger/10 px-3 py-1.5 rounded-lg border border-danger/20 font-medium">
              {combinedSaveError}
            </span>
          )}
          <Button
            size="lg"
            className="font-bold tracking-wider px-8 shadow-[0_0_15px_rgba(var(--accent),0.2)] hover:shadow-[0_0_20px_rgba(var(--accent),0.4)] transition-all text-[13px] rounded-xl"
            disabled={characterSaving || voiceSaving}
            onClick={() => void handleSaveAll()}
          >
            {characterSaving || voiceSaving ? "saving..." : "SAVE CHARACTER"}
          </Button>
        </div>
      </div>
    </div>
  );
}
