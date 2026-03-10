/**
 * Character view — agent identity, personality, and avatar.
 *
 * Layout: 4 section cards
 *   1. Identity + Personality — name, avatar, bio, adjectives/topics, system prompt
 *   2. Style — 3-column style rule textareas
 *   3. Examples — collapsible chat + post examples
 *   4. Voice — voice selection + preview
 *   + Save bar at bottom
 */

import {
  type CharacterData,
  client,
  type VoiceConfig,
} from "@milady/app-core/api";
import {
  dispatchWindowEvent,
  VOICE_CONFIG_UPDATED_EVENT,
} from "@milady/app-core/events";
import type { ConfigUiHint } from "@milady/app-core/types";
import { resolveApiUrl } from "@milady/app-core/utils";
import {
  PREMADE_VOICES,
  sanitizeApiKey,
  type VoicePreset,
} from "@milady/app-core/voice";
import { Button, Input, TagEditor, Textarea, ThemedSelect } from "@milady/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { useApp } from "../AppContext";
import { useTimeout } from "../hooks/useTimeout";
import { AvatarSelector } from "./AvatarSelector";
import type { JsonSchemaObject } from "./config-catalog";
import { ConfigRenderer, defaultRegistry } from "./config-renderer";

const DEFAULT_ELEVEN_FAST_MODEL = "eleven_flash_v2_5";

type CharacterConversation = NonNullable<
  CharacterData["messageExamples"]
>[number];
type CharacterMessage = CharacterConversation["examples"][number];

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
  const { setTimeout } = useTimeout();

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
    selectedVrmIndex,
    t,
    // Registry / Drop
    registryStatus,
    registryLoading,
    registryRegistering,
    registryError,
    dropStatus,
    mintInProgress,
    mintResult,
    mintError,
    mintShiny,
    loadRegistryStatus,
    registerOnChain,
    syncRegistryProfile,
    loadDropStatus,
    mintFromDrop,
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
        } catch {
          alert("invalid json file");
        }
      };
      reader.readAsText(file);
      e.target.value = "";
    },
    [handleCharacterFieldInput, handleCharacterStyleInput],
  );

  /* ── Character generation state ─────────────────────────────────── */
  const [generating, setGenerating] = useState<string | null>(null);

  /* ── Voice config state ─────────────────────────────────────────── */
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({});
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceSaveSuccess, setVoiceSaveSuccess] = useState(false);
  const [voiceSaveError, setVoiceSaveError] = useState<string | null>(null);
  const [voiceTesting, setVoiceTesting] = useState(false);
  const [voiceTestAudio, setVoiceTestAudio] = useState<HTMLAudioElement | null>(
    null,
  );
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

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
            setSelectedPresetId(preset?.id ?? "custom");
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
    setSelectedPresetId(preset.id);
    setVoiceConfig((prev) => ({
      ...prev,
      elevenlabs: { ...(prev.elevenlabs ?? {}), voiceId: preset.voiceId },
    }));
  }, []);

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

  const handleVoiceSave = useCallback(async () => {
    setVoiceSaving(true);
    setVoiceSaveError(null);
    setVoiceSaveSuccess(false);
    try {
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
      setVoiceSaveSuccess(true);
      setTimeout(() => setVoiceSaveSuccess(false), 2500);
    } catch (err) {
      setVoiceSaveError(
        err instanceof Error
          ? err.message
          : "Failed to save — is the agent running?",
      );
    }
    setVoiceSaving(false);
  }, [voiceConfig, setTimeout]);

  const d = characterDraft;
  const bioText =
    typeof d.bio === "string"
      ? d.bio
      : Array.isArray(d.bio)
        ? d.bio.join("\n")
        : "";
  const styleAllText = (d.style?.all ?? []).join("\n");
  const styleChatText = (d.style?.chat ?? []).join("\n");
  const stylePostText = (d.style?.post ?? []).join("\n");

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

  const handleRandomName = useCallback(async () => {
    try {
      const { name } = await client.getRandomName();
      handleFieldEdit("name", name);
    } catch {
      /* ignore */
    }
  }, [handleFieldEdit]);

  /* ── Helpers ────────────────────────────────────────────────────── */
  const sectionCls = inModal
    ? "mt-4 p-5 border border-border/40 bg-card/40 backdrop-blur-xl rounded-2xl shadow-sm"
    : "mt-4 p-5 border border-border/40 bg-card/40 backdrop-blur-xl rounded-2xl shadow-sm";
  const labelCls = "font-medium text-xs text-muted mb-1 block";
  const hintCls = "text-[11px] text-muted";

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
                  className="btn text-xs py-[5px] px-4 !mt-0"
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

          {hasWallet && !isRegistered && dropLive && !userMinted && (
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2 px-3 py-2 border border-accent/40 bg-accent/10 rounded-xl shadow-inner backdrop-blur-md">
                <span className="text-xs font-bold text-accent tracking-widest drop-shadow-[0_0_8px_rgba(var(--accent),0.4)]">
                  {t("characterview.MINTISLIVE")}
                </span>
                <span className="text-[11px] text-muted font-medium">
                  {t("characterview.MiladyMaker")}
                  {(dropStatus?.currentSupply ?? 0) + 1} of{" "}
                  {dropStatus?.maxSupply ?? 2138}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-1">
                <Button
                  variant="default"
                  disabled={mintInProgress}
                  onClick={() => void mintFromDrop(false)}
                  className="font-bold tracking-wide shadow-[0_0_15px_rgba(var(--accent),0.2)] hover:shadow-[0_0_20px_rgba(var(--accent),0.4)] transition-all"
                >
                  {mintInProgress && !mintShiny ? "minting..." : "free mint"}
                </Button>
                <Button
                  variant="outline"
                  disabled={mintInProgress}
                  onClick={() => void mintFromDrop(true)}
                  className="font-bold border-border/50 bg-bg/50 backdrop-blur-md hover:border-accent hover:text-accent transition-all shadow-sm"
                >
                  {mintInProgress && mintShiny
                    ? "minting..."
                    : "shiny mint (0.1 ETH)"}
                </Button>
              </div>
              {mintError && (
                <span className="text-xs text-[var(--danger,#e74c3c)]">
                  {mintError}
                </span>
              )}
              {mintResult && (
                <div className="text-xs text-green-400 bg-green-400/10 px-3 py-2 rounded-lg border border-green-400/20">
                  {t("characterview.MintedToken")}
                  {mintResult.agentId} {t("characterview.MiladyMaker1")}
                  {mintResult.mintNumber}
                  {mintResult.isShiny && " (shiny)"}{" "}
                  <a
                    href={`https://etherscan.io/tx/${mintResult.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline text-accent hover:opacity-80 transition-opacity"
                  >
                    {t("characterview.viewTx")}
                  </a>
                </div>
              )}
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
          );
        })()}

      {hasWallet && userMinted && !isRegistered && (
        <div className="text-[12px] text-[var(--ok,#16a34a)]">
          {t("characterview.MintedFromCollecti")}
        </div>
      )}
      {/* ═══ SECTION 1: IDENTITY + PERSONALITY ═══ */}
      <div className={sectionCls}>
        {/* Header row: title + action buttons */}
        <div className="flex items-center justify-between mb-5 border-b border-border/40 pb-3">
          <div className="font-bold text-sm tracking-wide text-txt">
            {t("characterview.IdentityPersonali")}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              className="h-7 text-[11px] font-medium border-border/50 bg-bg/50 backdrop-blur-sm shadow-inner hover:text-accent hover:border-accent/40 transition-all"
              onClick={() => void loadCharacter()}
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

        <div className="flex flex-col gap-5">
          {/* Name */}
          <div className="flex flex-col gap-1.5">
            <span className={labelCls}>{t("characterview.name")}</span>
            <div className="flex items-center gap-3 max-w-[320px]">
              <Input
                type="text"
                value={d.name ?? ""}
                maxLength={50}
                placeholder={t("characterview.agentName")}
                onChange={(e) => handleFieldEdit("name", e.target.value)}
                className="flex-1 bg-bg/50 backdrop-blur-md border-border/50 shadow-inner focus-visible:ring-accent/50 focus-visible:border-accent h-9 rounded-xl transition-all"
              />
              <Button
                variant="secondary"
                size="sm"
                className="h-9 px-4 font-bold border border-white/5 shadow-sm hover:shadow-[0_0_10px_rgba(255,255,255,0.1)] transition-all rounded-xl"
                onClick={() => void handleRandomName()}
                title={t("characterview.randomName")}
              >
                {t("characterview.random")}
              </Button>
            </div>
          </div>

          {/* Avatar full-width row */}
          <div className="flex flex-col gap-1 w-full">
            <span className={labelCls}>{t("characterview.avatar")}</span>
            <div className="w-full">
              <AvatarSelector
                selected={selectedVrmIndex}
                onSelect={(i) => setState("selectedVrmIndex", i)}
                onUpload={(file) => {
                  const previousIndex = selectedVrmIndex;
                  const url = URL.createObjectURL(file);
                  setState("customVrmUrl", url);
                  setState("selectedVrmIndex", 0);
                  client
                    .uploadCustomVrm(file)
                    .then(() => {
                      setState(
                        "customVrmUrl",
                        resolveApiUrl(`/api/avatar/vrm?t=${Date.now()}`),
                      );
                      requestAnimationFrame(() => URL.revokeObjectURL(url));
                    })
                    .catch(() => {
                      setState("selectedVrmIndex", previousIndex);
                      URL.revokeObjectURL(url);
                    });
                }}
                showUpload
                fullWidth
              />
            </div>
          </div>

          {/* About me + adjectives + topics */}
          <div className="mt-1 grid grid-cols-1 md:grid-cols-[1.2fr_1fr_1fr] gap-5">
            <div className="flex flex-col gap-2 h-[220px]">
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
                rows={4}
                placeholder={t("characterview.describeWhoYourAg")}
                onChange={(e) => handleFieldEdit("bio", e.target.value)}
                className="flex-1 min-h-[160px] bg-bg/50 backdrop-blur-md border-border/50 shadow-inner focus-visible:ring-accent/50 focus-visible:border-accent rounded-xl text-sm leading-relaxed p-3 custom-scrollbar"
              />
            </div>
            <TagEditor
              label={t("characterview.adjectives")}
              items={d.adjectives ?? []}
              onChange={(items) =>
                handleCharacterArrayInput("adjectives", items.join("\n"))
              }
              placeholder={t("characterview.addAdjective")}
            />
            <TagEditor
              label={t("characterview.topics")}
              items={d.topics ?? []}
              onChange={(items) =>
                handleCharacterArrayInput("topics", items.join("\n"))
              }
              placeholder={t("characterview.addTopic")}
            />
          </div>

          {/* System prompt below */}
          <div className="flex flex-col gap-2 mt-2">
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
              rows={5}
              maxLength={10000}
              placeholder={t("characterview.writeInFirstPerso")}
              onChange={(e) => handleFieldEdit("system", e.target.value)}
              className="font-mono bg-bg/50 backdrop-blur-md border-border/50 shadow-inner focus-visible:ring-accent/50 focus-visible:border-accent rounded-xl text-xs leading-relaxed p-3 custom-scrollbar"
            />
          </div>
        </div>
      </div>

      {/* ═══ SECTION 2: STYLE ═══ */}
      <div className={sectionCls}>
        <div className="flex items-center justify-between mb-4 border-b border-border/40 pb-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3">
            <div className="font-bold text-sm tracking-wide text-txt">
              {t("characterview.StyleRules")}
            </div>
            <span className="font-medium text-[11px] text-muted tracking-wide bg-black/10 px-2 py-0.5 rounded-full border border-white/5">
              {t("characterview.CommunicationGuid")}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-[11px] font-bold border-border/50 bg-bg/50 backdrop-blur-sm shadow-inner hover:text-accent hover:border-accent/40 transition-all text-accent"
            onClick={() => void handleGenerate("style", "replace")}
            disabled={generating === "style"}
          >
            {generating === "style" ? "generating..." : "regenerate"}
          </Button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {(["all", "chat", "post"] as const).map((key) => {
            const val =
              key === "all"
                ? styleAllText
                : key === "chat"
                  ? styleChatText
                  : stylePostText;
            return (
              <div key={key} className="flex flex-col gap-2">
                <span className="font-bold text-[11px] text-muted uppercase tracking-widest pl-1">
                  {key}
                </span>
                <Textarea
                  value={val}
                  rows={4}
                  placeholder={`${key} style rules, one per line`}
                  onChange={(e) => handleStyleEdit(key, e.target.value)}
                  className="bg-bg/50 backdrop-blur-md border-border/50 shadow-inner focus-visible:ring-accent/50 focus-visible:border-accent rounded-xl text-xs leading-relaxed p-3 custom-scrollbar"
                />
              </div>
            );
          })}
        </div>
      </div>

      {/* ═══ SECTION 3: EXAMPLES ═══ */}
      <div className={sectionCls}>
        <div className="font-bold text-sm mb-4 border-b border-border/40 pb-3 text-txt tracking-wide">
          {t("characterview.Examples")}
        </div>

        <div className="flex flex-col gap-5">
          {/* Chat Examples */}
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold list-none [&::-webkit-details-marker]:hidden">
              <span className="inline-block transition-transform group-open:rotate-90 text-accent">
                &#9654;
              </span>

              {t("characterview.chatExamples")}
              <span className="font-medium text-[11px] text-muted bg-black/10 px-2 py-0.5 rounded-full border border-white/5 ml-1">
                {t("characterview.HowTheAgentResp")}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7 text-[11px] font-bold border-border/50 bg-bg/50 backdrop-blur-sm shadow-inner hover:text-accent hover:border-accent/40 transition-all text-accent"
                onClick={(e) => {
                  e.preventDefault();
                  void handleGenerate("chatExamples", "replace");
                }}
                disabled={generating === "chatExamples"}
              >
                {generating === "chatExamples" ? "generating..." : "generate"}
              </Button>
            </summary>
            <div className="flex flex-col gap-3 mt-4">
              {(d.messageExamples ?? []).map((convo, ci) => (
                <div
                  key={convo.examples
                    .map((msg) => `${msg.name}:${msg.content?.text ?? ""}`)
                    .join("|")}
                  className="p-4 border border-border/40 bg-black/10 rounded-xl shadow-inner backdrop-blur-sm"
                >
                  <div className="flex items-center justify-between mb-3 border-b border-border/30 pb-2">
                    <span className="text-[11px] text-muted font-bold tracking-widest uppercase">
                      {t("characterview.conversation")} {ci + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[10px] text-muted hover:text-danger hover:bg-danger/10 font-bold transition-all"
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
                        className="flex gap-3 items-center"
                      >
                        <span
                          className={`text-[11px] font-bold shrink-0 w-12 text-right uppercase tracking-wider ${msg.name === "{{user1}}" ? "text-muted" : "text-accent"}`}
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
                          className="flex-1 bg-bg/50 backdrop-blur-md border-border/50 shadow-inner focus-visible:ring-accent/50 focus-visible:border-accent h-9 rounded-lg transition-all text-xs"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              ))}
              {(d.messageExamples ?? []).length === 0 && (
                <div
                  className={`${hintCls} py-3 bg-black/5 rounded-xl border border-white/5 text-center`}
                >
                  {t("characterview.noChatExamplesYet")}
                </div>
              )}
            </div>
          </details>

          {/* Post Examples */}
          <details className="group">
            <summary className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold list-none [&::-webkit-details-marker]:hidden">
              <span className="inline-block transition-transform group-open:rotate-90 text-accent">
                &#9654;
              </span>

              {t("characterview.postExamples")}
              <span className="font-medium text-[11px] text-muted bg-black/10 px-2 py-0.5 rounded-full border border-white/5 ml-1">
                {t("characterview.SocialMediaVoice")}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="ml-auto h-7 text-[11px] font-bold border-border/50 bg-bg/50 backdrop-blur-sm shadow-inner hover:text-accent hover:border-accent/40 transition-all text-accent"
                onClick={(e) => {
                  e.preventDefault();
                  void handleGenerate("postExamples", "replace");
                }}
                disabled={generating === "postExamples"}
              >
                {generating === "postExamples" ? "generating..." : "generate"}
              </Button>
            </summary>
            <div className="flex flex-col gap-2 mt-4">
              {(d.postExamples ?? []).map((post: string, pi: number) => (
                <div key={post} className="flex gap-2 items-center">
                  <Input
                    type="text"
                    value={post}
                    onChange={(e) => {
                      const updated = [...(d.postExamples ?? [])];
                      updated[pi] = e.target.value;
                      handleFieldEdit("postExamples", updated);
                    }}
                    className="flex-1 bg-bg/50 backdrop-blur-md border-border/50 shadow-inner focus-visible:ring-accent/50 focus-visible:border-accent h-9 rounded-lg transition-all text-xs"
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted hover:text-danger hover:bg-danger/10"
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
                  className={`${hintCls} py-3 bg-black/5 rounded-xl border border-white/5 text-center`}
                >
                  {t("characterview.noPostExamplesYet")}
                </div>
              )}
              <Button
                variant="ghost"
                size="sm"
                className="text-[11px] font-bold text-accent hover:bg-accent/10 border border-transparent hover:border-accent/30 transition-all rounded-md mt-1 self-start"
                onClick={() => {
                  const updated = [...(d.postExamples ?? []), ""];
                  handleFieldEdit("postExamples", updated);
                }}
              >
                + {t("characterview.AddPost")}
              </Button>
            </div>
          </details>
        </div>
      </div>

      {/* ═══ SECTION 4: VOICE ═══ */}
      <div className={sectionCls}>
        <div className="font-bold text-sm mb-4 border-b border-border/40 pb-3 text-txt tracking-wide">
          {t("characterview.Voice")}
        </div>

        {voiceLoading ? (
          <div className="text-center py-8 text-muted text-[13px] bg-black/5 rounded-xl border border-white/5 animate-pulse">
            {t("characterview.LoadingVoiceConfig")}
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            <div className="text-xs text-muted/80 leading-relaxed max-w-lg">
              {t("characterview.ChooseTheSpeaking")}
            </div>

            <div className="flex flex-col gap-2">
              <span className={labelCls}>{t("characterview.voice")}</span>
              <div className="flex items-center gap-3">
                <ThemedSelect
                  value={
                    selectedPresetId === "custom"
                      ? "__custom__"
                      : (selectedPresetId ?? null)
                  }
                  groups={[
                    {
                      label: "Female",
                      items: PREMADE_VOICES.filter(
                        (p) => p.gender === "female",
                      ).map((p) => ({
                        id: p.id,
                        text: p.name,
                        hint: p.hint,
                      })),
                    },
                    {
                      label: "Male",
                      items: PREMADE_VOICES.filter(
                        (p) => p.gender === "male",
                      ).map((p) => ({
                        id: p.id,
                        text: p.name,
                        hint: p.hint,
                      })),
                    },
                    {
                      label: "Character",
                      items: PREMADE_VOICES.filter(
                        (p) => p.gender === "character",
                      ).map((p) => ({
                        id: p.id,
                        text: p.name,
                        hint: p.hint,
                      })),
                    },
                    {
                      label: "Other",
                      items: [{ id: "__custom__", text: "Custom voice ID..." }],
                    },
                  ]}
                  onChange={(id) => {
                    if (id === "__custom__") {
                      setSelectedPresetId("custom");
                    } else {
                      const preset = PREMADE_VOICES.find((p) => p.id === id);
                      if (preset) handleSelectPreset(preset);
                    }
                  }}
                  placeholder={t("characterview.selectAVoice")}
                />
                {(() => {
                  const activePreset = PREMADE_VOICES.find(
                    (p) => p.id === selectedPresetId,
                  );
                  if (!activePreset) return null;
                  return voiceTesting ? (
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
                      onClick={() => handleTestVoice(activePreset.previewUrl)}
                    >
                      {t("characterview.preview")}
                    </Button>
                  );
                })()}
              </div>
            </div>

            {selectedPresetId === "custom" && (
              <div className="flex flex-col gap-2">
                <span className={labelCls}>{t("characterview.voiceID")}</span>
                <Input
                  type="text"
                  value={voiceConfig.elevenlabs?.voiceId ?? ""}
                  placeholder={t("characterview.pasteElevenLabsVoi")}
                  onChange={(e) =>
                    handleVoiceFieldChange("voiceId", e.target.value)
                  }
                  className="w-full font-mono text-[13px] bg-bg/50 backdrop-blur-md border-border/50 shadow-inner focus-visible:ring-accent/50 focus-visible:border-accent h-9 rounded-xl transition-all"
                />
              </div>
            )}

            <details className="group">
              <summary className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold list-none [&::-webkit-details-marker]:hidden bg-black/5 p-3 rounded-xl border border-white/5 hover:bg-black/10 transition-colors">
                <span className="inline-block transition-transform group-open:rotate-90 text-accent">
                  &#9654;
                </span>

                {t("characterview.advancedVoiceSetti")}
              </summary>
              <div className="mt-4 p-4 border border-border/20 rounded-xl bg-black/10 shadow-inner">
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
                        stability: { type: "number", minimum: 0, maximum: 1 },
                        similarityBoost: {
                          type: "number",
                          minimum: 0,
                          maximum: 1,
                        },
                        speed: { type: "number", minimum: 0.5, maximum: 2 },
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
                        { value: "eleven_turbo_v2_5", label: "Turbo v2.5" },
                        {
                          value: "eleven_multilingual_v2",
                          label: "Multilingual v2",
                        },
                        { value: "eleven_turbo_v2", label: "Turbo v2" },
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
                    stability: voiceConfig.elevenlabs?.stability ?? "",
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

            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border/40">
              <Button
                size="sm"
                className={`font-bold tracking-wide rounded-xl shadow-sm hover:shadow-[0_0_15px_rgba(255,255,255,0.1)] transition-all ${voiceSaveSuccess ? "bg-green-500/20 text-green-400 border-green-500/30 hover:bg-green-500/30" : ""}`}
                onClick={() => void handleVoiceSave()}
                disabled={voiceSaving}
              >
                {voiceSaving
                  ? "saving..."
                  : voiceSaveSuccess
                    ? "saved"
                    : "save voice"}
              </Button>
              {voiceSaveError && (
                <span className="text-xs text-danger font-medium">
                  {voiceSaveError}
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ SAVE BAR ═══ */}
      <div className={sectionCls}>
        <div className="flex items-center justify-end gap-4">
          {characterSaveSuccess && (
            <span className="text-xs text-green-400 font-bold bg-green-400/10 px-3 py-1.5 rounded-lg border border-green-400/20">
              {characterSaveSuccess}
            </span>
          )}
          {characterSaveError && (
            <span className="text-xs text-danger bg-danger/10 px-3 py-1.5 rounded-lg border border-danger/20 font-medium">
              {characterSaveError}
            </span>
          )}
          <Button
            size="lg"
            className="font-bold tracking-wider px-8 shadow-[0_0_15px_rgba(var(--accent),0.2)] hover:shadow-[0_0_20px_rgba(var(--accent),0.4)] transition-all text-[13px] rounded-xl"
            disabled={characterSaving}
            onClick={() => void handleSaveCharacter()}
          >
            {characterSaving ? "saving..." : "SAVE CHARACTER"}
          </Button>
        </div>
      </div>
    </div>
  );
}
