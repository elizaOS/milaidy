/**
 * Character view — agent identity, personality, and avatar.
 *
 * Features:
 *   - Import/export character as JSON
 *   - Unsaved changes indicator
 *   - Adjectives and topics editors
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { useApp } from "../AppContext";
import { client, type VoiceProvider, type VoiceConfig } from "../api-client";
import { AvatarSelector } from "./AvatarSelector";

export function CharacterView() {
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
    // Cloud (for ElevenLabs via Eliza Cloud)
    cloudConnected,
    cloudUserId,
    cloudLoginBusy,
    cloudLoginError,
    cloudDisconnecting,
    handleCloudLogin,
    handleCloudDisconnect,
  } = useApp();

  useEffect(() => {
    void loadCharacter();
  }, [loadCharacter]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFieldEdit = useCallback((field: string, value: string | string[] | Record<string, unknown>[]) => {
    handleCharacterFieldInput(field as never, value as never);
  }, [handleCharacterFieldInput]);

  const handleStyleEdit = useCallback((key: "all" | "chat" | "post", value: string) => {
    handleCharacterStyleInput(key, value);
  }, [handleCharacterStyleInput]);

  /* ── Import / Export ────────────────────────────────────────────── */
  const handleExport = useCallback(() => {
    const d = characterDraft;
    const exportData = {
      name: d.name ?? "",
      bio: typeof d.bio === "string" ? d.bio.split("\n").filter(Boolean) : (d.bio ?? []),
      system: d.system ?? "",
      style: {
        all: d.style?.all ?? [],
        chat: d.style?.chat ?? [],
        post: d.style?.post ?? [],
      },
      adjectives: d.adjectives ?? [],
      topics: d.topics ?? [],
      messageExamples: (d.messageExamples ?? []).map((convo: any) =>
        (convo.examples ?? []).map((msg: any) => ({
          user: msg.name,
          content: { text: msg.content?.text ?? "" },
        }))
      ),
      postExamples: d.postExamples ?? [],
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(d.name ?? "character").toLowerCase().replace(/\s+/g, "-")}.character.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [characterDraft]);

  const handleImport = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string);
        if (data.name) handleCharacterFieldInput("name", data.name);
        if (data.bio) handleCharacterFieldInput("bio",
          Array.isArray(data.bio) ? data.bio.join("\n") : data.bio);
        if (data.system) handleCharacterFieldInput("system", data.system);
        if (data.adjectives) handleCharacterFieldInput("adjectives" as any, data.adjectives);
        if (data.topics) handleCharacterFieldInput("topics" as any, data.topics);
        if (data.style) {
          if (data.style.all) handleCharacterStyleInput("all",
            Array.isArray(data.style.all) ? data.style.all.join("\n") : data.style.all);
          if (data.style.chat) handleCharacterStyleInput("chat",
            Array.isArray(data.style.chat) ? data.style.chat.join("\n") : data.style.chat);
          if (data.style.post) handleCharacterStyleInput("post",
            Array.isArray(data.style.post) ? data.style.post.join("\n") : data.style.post);
        }
        if (data.messageExamples) {
          const formatted = data.messageExamples.map((convo: any[]) => ({
            examples: convo.map((msg: any) => ({
              name: msg.user ?? msg.name ?? "{{user1}}",
              content: { text: msg.content?.text ?? msg.text ?? "" },
            })),
          }));
          handleCharacterFieldInput("messageExamples" as any, formatted);
        }
        if (data.postExamples) handleCharacterFieldInput("postExamples" as any, data.postExamples);
      } catch {
        alert("invalid json file");
      }
    };
    reader.readAsText(file);
    // Reset input so same file can be re-imported
    e.target.value = "";
  }, [handleCharacterFieldInput, handleCharacterStyleInput]);

  /* ── Character generation state ─────────────────────────────────── */
  const [generating, setGenerating] = useState<string | null>(null);

  /* ── Voice config state ─────────────────────────────────────────── */
  const [voiceProvider, setVoiceProvider] = useState<VoiceProvider>("elevenlabs");
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>({});
  const [voiceLoading, setVoiceLoading] = useState(false);
  const [voiceSaving, setVoiceSaving] = useState(false);
  const [voiceSaveSuccess, setVoiceSaveSuccess] = useState(false);
  const [voiceSaveError, setVoiceSaveError] = useState<string | null>(null);
  const [voiceMode, setVoiceMode] = useState<"cloud" | "own-key">("cloud");
  const [voiceTesting, setVoiceTesting] = useState(false);
  const [voiceTestAudio, setVoiceTestAudio] = useState<HTMLAudioElement | null>(null);
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null);

  /* ── ElevenLabs voice presets ──────────────────────────────────── */
  type VoicePreset = { id: string; name: string; voiceId: string; gender: "female" | "male" | "character"; hint: string; previewUrl: string };
  const VOICE_PRESETS: VoicePreset[] = [
    // Female
    { id: "rachel", name: "Rachel", voiceId: "21m00Tcm4TlvDq8ikWAM", gender: "female", hint: "Calm, clear", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/21m00Tcm4TlvDq8ikWAM/df6788f9-5c96-470d-8312-aab3b3d8f50a.mp3" },
    { id: "sarah", name: "Sarah", voiceId: "EXAVITQu4vr4xnSDxMaL", gender: "female", hint: "Soft, warm", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/EXAVITQu4vr4xnSDxMaL/6851ec91-9950-471f-8586-357c52539069.mp3" },
    { id: "matilda", name: "Matilda", voiceId: "XrExE9yKIg1WjnnlVkGX", gender: "female", hint: "Warm, friendly", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/XrExE9yKIg1WjnnlVkGX/b930e18d-6b4d-466e-bab2-0ae97c6d8535.mp3" },
    { id: "lily", name: "Lily", voiceId: "pFZP5JQG7iQjIQuC4Bku", gender: "female", hint: "British, raspy", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/pFZP5JQG7iQjIQuC4Bku/0ab8bd74-fcd2-489d-b70a-3e1bcde8c999.mp3" },
    { id: "alice", name: "Alice", voiceId: "Xb7hH8MSUJpSbSDYk0k2", gender: "female", hint: "British, confident", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/Xb7hH8MSUJpSbSDYk0k2/f5409e2f-d9c3-4ac9-9e7d-916a5dbd1ef1.mp3" },
    // Male
    { id: "brian", name: "Brian", voiceId: "nPczCjzI2devNBz1zQrb", gender: "male", hint: "Deep, smooth", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/nPczCjzI2devNBz1zQrb/f4dbda0c-aff0-45c0-93fa-f5d5ec95a2eb.mp3" },
    { id: "adam", name: "Adam", voiceId: "pNInz6obpgDQGcFmaJgB", gender: "male", hint: "Deep, authoritative", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/pNInz6obpgDQGcFmaJgB/38a69695-2ca9-4b9e-b9ec-f07ced494a58.mp3" },
    { id: "josh", name: "Josh", voiceId: "TxGEqnHWrfWFTfGW9XjX", gender: "male", hint: "Young, deep", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/TxGEqnHWrfWFTfGW9XjX/3ae2fc71-d5f9-4769-bb71-2a43633cd186.mp3" },
    { id: "daniel", name: "Daniel", voiceId: "onwK4e9ZLuTAKqWW03F9", gender: "male", hint: "British, presenter", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/onwK4e9ZLuTAKqWW03F9/7eee0236-1a72-4b86-b303-5dcadc007ba9.mp3" },
    { id: "liam", name: "Liam", voiceId: "TX3LPaxmHKxFdv7VOQHJ", gender: "male", hint: "Young, natural", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/TX3LPaxmHKxFdv7VOQHJ/63148076-6363-42db-aea8-31424308b92c.mp3" },
    // Character / Cutesy / Game
    { id: "gigi", name: "Gigi", voiceId: "jBpfuIE2acCO8z3wKNLl", gender: "character", hint: "Childish, cute", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/jBpfuIE2acCO8z3wKNLl/3a7e4339-78fa-404e-8d10-c3ef5587935b.mp3" },
    { id: "mimi", name: "Mimi", voiceId: "zrHiDhphv9ZnVXBqCLjz", gender: "character", hint: "Cute, animated", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/zrHiDhphv9ZnVXBqCLjz/decbf20b-0f57-4fac-985b-a4f0290ebfc4.mp3" },
    { id: "dorothy", name: "Dorothy", voiceId: "ThT5KcBeYPX3keUQqHPh", gender: "character", hint: "Sweet, storybook", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/ThT5KcBeYPX3keUQqHPh/981f0855-6598-48d2-9f8f-b6d92fbbe3fc.mp3" },
    { id: "glinda", name: "Glinda", voiceId: "z9fAnlkpzviPz146aGWa", gender: "character", hint: "Magical, whimsical", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/z9fAnlkpzviPz146aGWa/cbc60443-7b61-4ebb-b8e1-5c03237ea01d.mp3" },
    { id: "charlotte", name: "Charlotte", voiceId: "XB0fDUnXU5powFXDhCwa", gender: "character", hint: "Alluring, game NPC", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/XB0fDUnXU5powFXDhCwa/942356dc-f10d-4d89-bda5-4f8505ee038b.mp3" },
    { id: "callum", name: "Callum", voiceId: "N2lVS1w4EtoT3dr4eOWO", gender: "character", hint: "Gruff, game hero", previewUrl: "https://storage.googleapis.com/eleven-public-prod/premade/voices/N2lVS1w4EtoT3dr4eOWO/ac833bd8-ffda-4938-9ebc-b0f99ca25481.mp3" },
  ];

  /* Load voice config on mount */
  useEffect(() => {
    void (async () => {
      setVoiceLoading(true);
      try {
        const cfg = await client.getConfig();
        const messages = cfg.messages as Record<string, Record<string, unknown>> | undefined;
        const tts = messages?.tts as VoiceConfig | undefined;
        if (tts?.provider) setVoiceProvider(tts.provider);
        if (tts) {
          setVoiceConfig(tts);
          // Detect voice mode: if user has own API key set, default to own-key mode
          if (tts.elevenlabs?.apiKey) setVoiceMode("own-key");
          // Detect selected preset
          if (tts.elevenlabs?.voiceId) {
            const preset = VOICE_PRESETS.find((p) => p.voiceId === tts.elevenlabs?.voiceId);
            setSelectedPresetId(preset?.id ?? "custom");
          }
        }
      } catch { /* ignore */ }
      setVoiceLoading(false);
    })();
  }, []);

  const handleVoiceFieldChange = useCallback(
    (provider: "elevenlabs" | "edge", key: string, value: string | number) => {
      setVoiceConfig((prev) => ({
        ...prev,
        [provider]: { ...(prev[provider] ?? {}), [key]: value },
      }));
    },
    [],
  );

  const handleSelectPreset = useCallback(
    (preset: VoicePreset) => {
      setSelectedPresetId(preset.id);
      setVoiceConfig((prev) => ({
        ...prev,
        elevenlabs: { ...(prev.elevenlabs ?? {}), voiceId: preset.voiceId },
      }));
    },
    [],
  );

  const handleTestVoice = useCallback(
    (previewUrl: string) => {
      // Stop any existing playback
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
      const elConfig = { ...(voiceConfig.elevenlabs ?? {}) };
      // In cloud mode, don't send apiKey — cloud handles it
      if (voiceMode === "cloud") {
        delete elConfig.apiKey;
      }
      await client.updateConfig({
        messages: {
          tts: {
            provider: voiceProvider,
            ...(voiceProvider === "elevenlabs" ? { elevenlabs: elConfig } : {}),
            ...(voiceProvider === "edge" && voiceConfig.edge
              ? { edge: voiceConfig.edge }
              : {}),
          },
        },
      });
      setVoiceSaveSuccess(true);
      setTimeout(() => setVoiceSaveSuccess(false), 2500);
    } catch (err) {
      setVoiceSaveError(err instanceof Error ? err.message : "Failed to save — is the agent running?");
    }
    setVoiceSaving(false);
  }, [voiceProvider, voiceConfig, voiceMode]);

  const d = characterDraft;
  const bioText = typeof d.bio === "string" ? d.bio : Array.isArray(d.bio) ? d.bio.join("\n") : "";
  const styleAllText = (d.style?.all ?? []).join("\n");
  const styleChatText = (d.style?.chat ?? []).join("\n");
  const stylePostText = (d.style?.post ?? []).join("\n");

  const getCharContext = useCallback(() => ({
    name: d.name ?? "",
    system: d.system ?? "",
    bio: bioText,
    style: d.style ?? { all: [], chat: [], post: [] },
    postExamples: d.postExamples ?? [],
  }), [d, bioText]);

  const handleGenerate = useCallback(async (field: string, mode: "append" | "replace" = "replace") => {
    setGenerating(field);
    try {
      const { generated } = await client.generateCharacterField(field, getCharContext(), mode);
      if (field === "bio") {
        handleFieldEdit("bio", generated.trim());
      } else if (field === "style") {
        try {
          const parsed = JSON.parse(generated);
          if (mode === "append") {
            handleStyleEdit("all", [...(d.style?.all ?? []), ...(parsed.all ?? [])].join("\n"));
            handleStyleEdit("chat", [...(d.style?.chat ?? []), ...(parsed.chat ?? [])].join("\n"));
            handleStyleEdit("post", [...(d.style?.post ?? []), ...(parsed.post ?? [])].join("\n"));
          } else {
            if (parsed.all) handleStyleEdit("all", parsed.all.join("\n"));
            if (parsed.chat) handleStyleEdit("chat", parsed.chat.join("\n"));
            if (parsed.post) handleStyleEdit("post", parsed.post.join("\n"));
          }
        } catch { /* raw text fallback */ }
      } else if (field === "chatExamples") {
        try {
          const parsed = JSON.parse(generated);
          if (Array.isArray(parsed)) {
            const formatted = parsed.map((convo: Array<{ user: string; content: { text: string } }>) => ({
              examples: convo.map((msg) => ({ name: msg.user, content: { text: msg.content.text } })),
            }));
            handleFieldEdit("messageExamples", formatted);
          }
        } catch { /* raw text fallback */ }
      } else if (field === "postExamples") {
        try {
          const parsed = JSON.parse(generated);
          if (Array.isArray(parsed)) {
            if (mode === "append") {
              handleCharacterArrayInput("postExamples", [...(d.postExamples ?? []), ...parsed].join("\n"));
            } else {
              handleCharacterArrayInput("postExamples", parsed.join("\n"));
            }
          }
        } catch { /* raw text fallback */ }
      }
    } catch { /* generation failed */ }
    setGenerating(null);
  }, [getCharContext, d, handleFieldEdit, handleStyleEdit, handleCharacterArrayInput]);

  const handleRandomName = useCallback(async () => {
    try {
      const { name } = await client.getRandomName();
      handleFieldEdit("name", name);
    } catch { /* ignore */ }
  }, [handleFieldEdit]);

  /* ── Helpers ────────────────────────────────────────────────────── */
  const inputCls = "px-2.5 py-1.5 border border-[var(--border)] bg-[var(--card)] text-xs focus:border-[var(--accent)] focus:outline-none";
  const textareaCls = `${inputCls} font-inherit resize-y leading-relaxed`;
  const labelCls = "font-semibold text-xs";
  const hintCls = "text-[11px] text-[var(--muted)]";
  const tinyBtnCls = "text-[10px] px-1.5 py-0.5 border border-[var(--border)] bg-[var(--card)] cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors disabled:opacity-40";

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-bold">Character</h2>
          <p className="text-[13px] text-[var(--muted)]">soul, identity, and appearance.</p>
        </div>
        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          <button
            className={tinyBtnCls}
            onClick={() => fileInputRef.current?.click()}
            title="import character.json"
            type="button"
          >
            import
          </button>
          <button
            className={tinyBtnCls}
            onClick={handleExport}
            title="export as character.json"
            type="button"
          >
            export
          </button>
        </div>
      </div>

      {/* ═══ SOUL & IDENTITY ═══ */}
      <div className="mt-4 p-4 border border-[var(--border)] bg-[var(--card)]">
        {characterLoading && !characterData ? (
          <div className="text-center py-6 text-[var(--muted)] text-[13px]">
            loading character data...
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {/* Name + reload */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className={labelCls}>name</label>
                <button
                  className={tinyBtnCls}
                  onClick={() => void loadCharacter()}
                  disabled={characterLoading}
                >
                  {characterLoading ? "loading..." : "reload"}
                </button>
              </div>
              <div className="flex items-center gap-2 max-w-[280px]">
                <input
                  type="text"
                  value={d.name ?? ""}
                  maxLength={50}
                  placeholder="agent name"
                  onChange={(e) => handleFieldEdit("name", e.target.value)}
                  className={inputCls + " flex-1 text-[13px]"}
                />
                <button
                  className={tinyBtnCls}
                  onClick={() => void handleRandomName()}
                  title="random name"
                  type="button"
                >
                  random
                </button>
              </div>
            </div>

            {/* Avatar (below name, full width) */}
            <div className="flex flex-col gap-1">
              <label className={labelCls}>avatar</label>
              <AvatarSelector
                selected={selectedVrmIndex}
                onSelect={(i) => setState("selectedVrmIndex", i)}
                onUpload={(file) => {
                  const url = URL.createObjectURL(file);
                  setState("customVrmUrl", url);
                  setState("selectedVrmIndex", 0);
                }}
                showUpload
              />
            </div>

            {/* Identity (bio) */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className={labelCls}>about me</label>
                <button
                  className={tinyBtnCls}
                  onClick={() => void handleGenerate("bio")}
                  disabled={generating === "bio"}
                  type="button"
                >
                  {generating === "bio" ? "generating..." : "regenerate"}
                </button>
              </div>
              <textarea
                value={bioText}
                rows={4}
                placeholder="describe who your agent is. personality, background, how they see the world."
                onChange={(e) => handleFieldEdit("bio", e.target.value)}
                className={textareaCls}
              />
            </div>

            {/* Soul (system prompt) */}
            <div className="flex flex-col gap-1">
              <div className="flex items-center justify-between">
                <label className={labelCls}>important stuff i know</label>
                <button
                  className={tinyBtnCls}
                  onClick={() => void handleGenerate("system")}
                  disabled={generating === "system"}
                  type="button"
                >
                  {generating === "system" ? "generating..." : "regenerate"}
                </button>
              </div>
              <textarea
                value={d.system ?? ""}
                rows={8}
                maxLength={10000}
                placeholder="write in first person. this is who they are, not instructions about them."
                onChange={(e) => handleFieldEdit("system", e.target.value)}
                className={textareaCls + " font-[var(--mono)]"}
              />
            </div>

            {/* Style */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5">
                  <label className={labelCls}>style rules</label>
                  <span className="font-normal text-[11px] text-[var(--muted)]">— communication guidelines</span>
                </div>
                <button
                  className={tinyBtnCls}
                  onClick={() => void handleGenerate("style", "replace")}
                  disabled={generating === "style"}
                  type="button"
                >
                  {generating === "style" ? "generating..." : "regenerate"}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3 p-3 border border-[var(--border)] bg-[var(--bg-muted)]">
                {(["all", "chat", "post"] as const).map((key) => {
                  const val = key === "all" ? styleAllText : key === "chat" ? styleChatText : stylePostText;
                  return (
                    <div key={key} className="flex flex-col gap-1">
                      <label className="font-semibold text-[11px] text-[var(--muted)]">{key}</label>
                      <textarea
                        value={val}
                        rows={4}
                        placeholder={`${key} style rules, one per line`}
                        onChange={(e) => handleStyleEdit(key, e.target.value)}
                        className={textareaCls}
                      />
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Chat Examples */}
            <details className="group">
              <summary className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-semibold list-none [&::-webkit-details-marker]:hidden">
                <span className="inline-block transition-transform group-open:rotate-90">&#9654;</span>
                chat examples
                <span className="font-normal text-[var(--muted)]">— how the agent responds</span>
                <button
                  className={tinyBtnCls + " ml-auto"}
                  onClick={(e) => { e.preventDefault(); void handleGenerate("chatExamples", "replace"); }}
                  disabled={generating === "chatExamples"}
                  type="button"
                >
                  {generating === "chatExamples" ? "generating..." : "generate"}
                </button>
              </summary>
              <div className="flex flex-col gap-2 mt-3">
                {(d.messageExamples ?? []).map((convo, ci) => (
                  <div key={ci} className="p-2.5 border border-[var(--border)] bg-[var(--bg-muted)]">
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-[10px] text-[var(--muted)] font-semibold">conversation {ci + 1}</span>
                      <button
                        className="text-[10px] text-[var(--muted)] hover:text-[var(--danger,#e74c3c)] cursor-pointer"
                        onClick={() => {
                          const updated = [...(d.messageExamples ?? [])];
                          updated.splice(ci, 1);
                          handleFieldEdit("messageExamples", updated);
                        }}
                        type="button"
                      >
                        remove
                      </button>
                    </div>
                    {convo.examples.map((msg: any, mi: number) => (
                      <div key={mi} className="flex gap-2 mb-1 last:mb-0">
                        <span className={`text-[10px] font-semibold shrink-0 w-16 pt-0.5 ${msg.name === "{{user1}}" ? "text-[var(--muted)]" : "text-[var(--accent)]"}`}>
                          {msg.name === "{{user1}}" ? "user" : "agent"}
                        </span>
                        <input
                          type="text"
                          value={msg.content?.text ?? ""}
                          onChange={(e) => {
                            const updated = [...(d.messageExamples ?? [])];
                            const convoClone = { examples: [...updated[ci].examples] };
                            convoClone.examples[mi] = { ...convoClone.examples[mi], content: { text: e.target.value } };
                            updated[ci] = convoClone;
                            handleFieldEdit("messageExamples", updated);
                          }}
                          className={inputCls + " flex-1"}
                        />
                      </div>
                    ))}
                  </div>
                ))}
                {(d.messageExamples ?? []).length === 0 && (
                  <div className={hintCls + " py-2"}>no chat examples yet. click generate to create some.</div>
                )}
              </div>
            </details>

            {/* Post Examples */}
            <details className="group">
              <summary className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-semibold list-none [&::-webkit-details-marker]:hidden">
                <span className="inline-block transition-transform group-open:rotate-90">&#9654;</span>
                post examples
                <span className="font-normal text-[var(--muted)]">— social media voice</span>
                <button
                  className={tinyBtnCls + " ml-auto"}
                  onClick={(e) => { e.preventDefault(); void handleGenerate("postExamples", "replace"); }}
                  disabled={generating === "postExamples"}
                  type="button"
                >
                  {generating === "postExamples" ? "generating..." : "generate"}
                </button>
              </summary>
              <div className="flex flex-col gap-1.5 mt-3">
                {(d.postExamples ?? []).map((post: string, pi: number) => (
                  <div key={pi} className="flex gap-2 items-start">
                    <input
                      type="text"
                      value={post}
                      onChange={(e) => {
                        const updated = [...(d.postExamples ?? [])];
                        updated[pi] = e.target.value;
                        handleFieldEdit("postExamples", updated);
                      }}
                      className={inputCls + " flex-1"}
                    />
                    <button
                      className="text-[10px] text-[var(--muted)] hover:text-[var(--danger,#e74c3c)] cursor-pointer shrink-0 py-1.5"
                      onClick={() => {
                        const updated = [...(d.postExamples ?? [])];
                        updated.splice(pi, 1);
                        handleFieldEdit("postExamples", updated);
                      }}
                      type="button"
                    >
                      &times;
                    </button>
                  </div>
                ))}
                {(d.postExamples ?? []).length === 0 && (
                  <div className={hintCls + " py-2"}>no post examples yet. click generate to create some.</div>
                )}
                <button
                  className="text-[11px] text-[var(--muted)] hover:text-[var(--accent)] cursor-pointer self-start mt-0.5"
                  onClick={() => {
                    const updated = [...(d.postExamples ?? []), ""];
                    handleFieldEdit("postExamples", updated);
                  }}
                  type="button"
                >
                  + add post
                </button>
              </div>
            </details>

            {/* Save */}
            <div className="flex items-center gap-3 mt-2 pt-3 border-t border-[var(--border)]">
              <button
                className="btn text-[13px] py-2 px-6 !mt-0"
                disabled={characterSaving}
                onClick={() => void handleSaveCharacter()}
              >
                {characterSaving ? "saving..." : "save character"}
              </button>
              {hasUnsavedChanges && !characterSaving && !characterSaveSuccess && (
                <span className="text-xs text-[var(--muted)]">unsaved changes</span>
              )}
              {characterSaveSuccess && (
                <span className="text-xs text-[var(--ok,#16a34a)]">{characterSaveSuccess}</span>
              )}
              {characterSaveError && (
                <span className="text-xs text-[var(--danger,#e74c3c)]">{characterSaveError}</span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* ═══ VOICE ═══ */}
      <div className="mt-4 p-4 border border-[var(--border)] bg-[var(--card)]">
        <div className="font-bold text-sm mb-3">Voice</div>

        {voiceLoading ? (
          <div className="text-center py-4 text-[var(--muted)] text-[13px]">Loading voice config...</div>
        ) : (
          <>
            {/* Provider selector buttons */}
            <div className="grid grid-cols-3 gap-1.5">
              {([
                { id: "elevenlabs" as const, label: "ElevenLabs", hint: "Premium neural voices" },
                { id: "simple-voice" as const, label: "Simple Voice", hint: "Retro SAM TTS" },
                { id: "edge" as const, label: "Microsoft Edge", hint: "Free browser voices" },
              ] as const).map((p) => {
                const active = voiceProvider === p.id;
                return (
                  <button
                    key={p.id}
                    className={`text-center px-2 py-2.5 border cursor-pointer transition-colors ${
                      active
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                    }`}
                    onClick={() => setVoiceProvider(p.id)}
                  >
                    <div className={`text-xs font-bold whitespace-nowrap ${active ? "" : "text-[var(--text)]"}`}>
                      {p.label}
                    </div>
                    <div className={`text-[10px] mt-0.5 ${active ? "opacity-80" : "text-[var(--muted)]"}`}>
                      {p.hint}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* ── ElevenLabs settings ─────────────────────────────── */}
            {voiceProvider === "elevenlabs" && (
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                {/* Cloud / Own Key toggle */}
                <div className="grid grid-cols-2 gap-1.5 mb-4">
                  <button
                    className={`text-center px-2 py-2 border cursor-pointer transition-colors ${
                      voiceMode === "cloud"
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                    }`}
                    onClick={() => setVoiceMode("cloud")}
                  >
                    <div className={`text-xs font-bold ${voiceMode === "cloud" ? "" : "text-[var(--text)]"}`}>Eliza Cloud</div>
                    <div className={`text-[10px] mt-0.5 ${voiceMode === "cloud" ? "opacity-80" : "text-[var(--muted)]"}`}>No keys needed</div>
                  </button>
                  <button
                    className={`text-center px-2 py-2 border cursor-pointer transition-colors ${
                      voiceMode === "own-key"
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                        : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                    }`}
                    onClick={() => setVoiceMode("own-key")}
                  >
                    <div className={`text-xs font-bold ${voiceMode === "own-key" ? "" : "text-[var(--text)]"}`}>Your Own Key</div>
                    <div className={`text-[10px] mt-0.5 ${voiceMode === "own-key" ? "opacity-80" : "text-[var(--muted)]"}`}>Bring your API key</div>
                  </button>
                </div>

                {/* Cloud mode status */}
                {voiceMode === "cloud" && (
                  <div className="mb-4 p-3 border border-[var(--border)] bg-[var(--bg-muted)]">
                    {cloudConnected ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-full bg-[var(--ok,#16a34a)]" />
                          <span className="text-xs font-semibold">Logged into Eliza Cloud</span>
                          {cloudUserId && (
                            <code className="text-[10px] text-[var(--muted)] font-[var(--mono)]">{cloudUserId}</code>
                          )}
                        </div>
                        <button
                          className="text-[10px] px-2 py-0.5 border border-[var(--border)] bg-[var(--card)] cursor-pointer hover:border-[var(--accent)] hover:text-[var(--accent)] transition-colors"
                          onClick={() => void handleCloudDisconnect()}
                          disabled={cloudDisconnecting}
                        >
                          {cloudDisconnecting ? "..." : "Disconnect"}
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className="inline-block w-2 h-2 rounded-full bg-[var(--muted)]" />
                          <span className="text-xs text-[var(--muted)]">Not connected — log in to use cloud TTS</span>
                        </div>
                        <button
                          className="btn text-xs py-[3px] px-3 !mt-0 font-bold"
                          onClick={() => void handleCloudLogin()}
                          disabled={cloudLoginBusy}
                        >
                          {cloudLoginBusy ? "Waiting..." : "Log in"}
                        </button>
                      </div>
                    )}
                    {cloudLoginError && (
                      <div className="text-[10px] text-[var(--danger,#e74c3c)] mt-1.5">{cloudLoginError}</div>
                    )}
                  </div>
                )}

                {/* Own key mode */}
                {voiceMode === "own-key" && (
                  <div className="mb-4 flex flex-col gap-1">
                    <div className="flex items-center gap-1.5 text-xs">
                      <label className="font-semibold">ElevenLabs API Key</label>
                      {voiceConfig.elevenlabs?.apiKey && (
                        <span className="text-[10px] text-[var(--ok,#16a34a)]">configured</span>
                      )}
                      <a href="https://elevenlabs.io/app/settings/api-keys" target="_blank" rel="noopener noreferrer" className="text-[10px] text-[var(--accent)] ml-auto">Get key</a>
                    </div>
                    <input
                      type="password"
                      value={voiceConfig.elevenlabs?.apiKey ?? ""}
                      placeholder="sk_..."
                      onChange={(e) => handleVoiceFieldChange("elevenlabs", "apiKey", e.target.value)}
                      className="w-full px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] font-[var(--mono)] transition-colors focus:border-[var(--accent)] focus:outline-none"
                    />
                  </div>
                )}

                {/* ── Voice presets ──────────────────────────────────── */}
                <div className="mb-4">
                  <div className="text-xs font-semibold mb-2">Choose a Voice</div>

                  {/* Female */}
                  <div className="text-[10px] text-[var(--muted)] font-semibold uppercase tracking-wider mb-1.5">Female</div>
                  <div className="grid grid-cols-5 gap-1.5 mb-3">
                    {VOICE_PRESETS.filter((p) => p.gender === "female").map((p) => {
                      const active = selectedPresetId === p.id;
                      return (
                        <button
                          key={p.id}
                          className={`relative text-center px-1.5 py-2 border cursor-pointer transition-colors group ${
                            active
                              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                              : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                          }`}
                          onClick={() => handleSelectPreset(p)}
                        >
                          <div className={`text-[11px] font-bold ${active ? "" : "text-[var(--text)]"}`}>{p.name}</div>
                          <div className={`text-[9px] mt-0.5 ${active ? "opacity-80" : "text-[var(--muted)]"}`}>{p.hint}</div>
                          <button
                            className={`absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity ${active ? "text-[var(--accent-foreground)]" : "text-[var(--accent)]"}`}
                            onClick={(e) => { e.stopPropagation(); handleTestVoice(p.previewUrl); }}
                            title="Preview voice"
                          >
                            &#9654;
                          </button>
                        </button>
                      );
                    })}
                  </div>

                  {/* Male */}
                  <div className="text-[10px] text-[var(--muted)] font-semibold uppercase tracking-wider mb-1.5">Male</div>
                  <div className="grid grid-cols-5 gap-1.5 mb-3">
                    {VOICE_PRESETS.filter((p) => p.gender === "male").map((p) => {
                      const active = selectedPresetId === p.id;
                      return (
                        <button
                          key={p.id}
                          className={`relative text-center px-1.5 py-2 border cursor-pointer transition-colors group ${
                            active
                              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                              : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                          }`}
                          onClick={() => handleSelectPreset(p)}
                        >
                          <div className={`text-[11px] font-bold ${active ? "" : "text-[var(--text)]"}`}>{p.name}</div>
                          <div className={`text-[9px] mt-0.5 ${active ? "opacity-80" : "text-[var(--muted)]"}`}>{p.hint}</div>
                          <button
                            className={`absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity ${active ? "text-[var(--accent-foreground)]" : "text-[var(--accent)]"}`}
                            onClick={(e) => { e.stopPropagation(); handleTestVoice(p.previewUrl); }}
                            title="Preview voice"
                          >
                            &#9654;
                          </button>
                        </button>
                      );
                    })}
                  </div>

                  {/* Character / Game */}
                  <div className="text-[10px] text-[var(--muted)] font-semibold uppercase tracking-wider mb-1.5">Character / Game</div>
                  <div className="grid grid-cols-6 gap-1.5 mb-3">
                    {VOICE_PRESETS.filter((p) => p.gender === "character").map((p) => {
                      const active = selectedPresetId === p.id;
                      return (
                        <button
                          key={p.id}
                          className={`relative text-center px-1.5 py-2 border cursor-pointer transition-colors group ${
                            active
                              ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                              : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)]"
                          }`}
                          onClick={() => handleSelectPreset(p)}
                        >
                          <div className={`text-[11px] font-bold ${active ? "" : "text-[var(--text)]"}`}>{p.name}</div>
                          <div className={`text-[9px] mt-0.5 ${active ? "opacity-80" : "text-[var(--muted)]"}`}>{p.hint}</div>
                          <button
                            className={`absolute top-0.5 right-0.5 w-5 h-5 flex items-center justify-center text-[10px] opacity-0 group-hover:opacity-100 transition-opacity ${active ? "text-[var(--accent-foreground)]" : "text-[var(--accent)]"}`}
                            onClick={(e) => { e.stopPropagation(); handleTestVoice(p.previewUrl); }}
                            title="Preview voice"
                          >
                            &#9654;
                          </button>
                        </button>
                      );
                    })}
                  </div>

                  {/* Custom voice ID */}
                  <div className="flex items-center gap-2 mt-2">
                    <button
                      className={`text-center px-3 py-1.5 border cursor-pointer transition-colors text-[11px] font-bold ${
                        selectedPresetId === "custom"
                          ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-foreground)]"
                          : "border-[var(--border)] bg-[var(--card)] hover:border-[var(--accent)] text-[var(--text)]"
                      }`}
                      onClick={() => setSelectedPresetId("custom")}
                    >
                      Custom
                    </button>
                    {selectedPresetId === "custom" && (
                      <input
                        type="text"
                        value={voiceConfig.elevenlabs?.voiceId ?? ""}
                        placeholder="Paste ElevenLabs voice ID..."
                        onChange={(e) => handleVoiceFieldChange("elevenlabs", "voiceId", e.target.value)}
                        className="flex-1 px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] font-[var(--mono)] transition-colors focus:border-[var(--accent)] focus:outline-none"
                      />
                    )}
                  </div>
                </div>

                {/* ── Advanced settings (collapsed) ─────────────────── */}
                <details className="group mb-3">
                  <summary className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-semibold list-none [&::-webkit-details-marker]:hidden">
                    <span className="inline-block transition-transform group-open:rotate-90">&#9654;</span>
                    Advanced Settings
                  </summary>
                  <div className="mt-3 flex flex-col gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="font-semibold text-xs">Model</label>
                      <select
                        value={voiceConfig.elevenlabs?.modelId ?? ""}
                        onChange={(e) => handleVoiceFieldChange("elevenlabs", "modelId", e.target.value)}
                        className="w-full px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] transition-colors focus:border-[var(--accent)] focus:outline-none"
                      >
                        <option value="">Default (Multilingual v2)</option>
                        <option value="eleven_multilingual_v2">Multilingual v2</option>
                        <option value="eleven_turbo_v2_5">Turbo v2.5</option>
                        <option value="eleven_turbo_v2">Turbo v2</option>
                        <option value="eleven_monolingual_v1">Monolingual v1</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-3 gap-3">
                      <div className="flex flex-col gap-1">
                        <label className="font-semibold text-[11px]">Stability</label>
                        <input type="number" min={0} max={1} step={0.05} value={voiceConfig.elevenlabs?.stability ?? ""} placeholder="0.5" onChange={(e) => handleVoiceFieldChange("elevenlabs", "stability", parseFloat(e.target.value) || 0)} className="w-full px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] font-[var(--mono)] transition-colors focus:border-[var(--accent)] focus:outline-none" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-semibold text-[11px]">Similarity</label>
                        <input type="number" min={0} max={1} step={0.05} value={voiceConfig.elevenlabs?.similarityBoost ?? ""} placeholder="0.75" onChange={(e) => handleVoiceFieldChange("elevenlabs", "similarityBoost", parseFloat(e.target.value) || 0)} className="w-full px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] font-[var(--mono)] transition-colors focus:border-[var(--accent)] focus:outline-none" />
                      </div>
                      <div className="flex flex-col gap-1">
                        <label className="font-semibold text-[11px]">Speed</label>
                        <input type="number" min={0.5} max={2} step={0.1} value={voiceConfig.elevenlabs?.speed ?? ""} placeholder="1.0" onChange={(e) => handleVoiceFieldChange("elevenlabs", "speed", parseFloat(e.target.value) || 1)} className="w-full px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] font-[var(--mono)] transition-colors focus:border-[var(--accent)] focus:outline-none" />
                      </div>
                    </div>
                  </div>
                </details>

                {/* Stop test button */}
                {voiceTesting && (
                  <div className="mb-3">
                    <button
                      className="btn text-xs py-[3px] px-3 !mt-0 !bg-transparent !border-[var(--border)] !text-[var(--muted)]"
                      onClick={handleStopTest}
                    >
                      Stop Preview
                    </button>
                  </div>
                )}
              </div>
            )}

            {/* ── Simple Voice settings ───────────────────────────── */}
            {voiceProvider === "simple-voice" && (
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <div className="text-[11px] text-[var(--muted)]">
                  No configuration needed. Works offline.
                </div>
              </div>
            )}

            {/* ── Microsoft Edge TTS settings ─────────────────────── */}
            {voiceProvider === "edge" && (
              <div className="mt-4 pt-4 border-t border-[var(--border)]">
                <div className="flex flex-col gap-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="font-semibold text-xs">Voice</label>
                      <input
                        type="text"
                        value={voiceConfig.edge?.voice ?? ""}
                        placeholder="en-US-AriaNeural"
                        onChange={(e) => handleVoiceFieldChange("edge", "voice", e.target.value)}
                        className="w-full px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] font-[var(--mono)] transition-colors focus:border-[var(--accent)] focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="font-semibold text-xs">Language</label>
                      <input
                        type="text"
                        value={voiceConfig.edge?.lang ?? ""}
                        placeholder="en-US"
                        onChange={(e) => handleVoiceFieldChange("edge", "lang", e.target.value)}
                        className="w-full px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] font-[var(--mono)] transition-colors focus:border-[var(--accent)] focus:outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="flex flex-col gap-1">
                      <label className="font-semibold text-[11px]">Rate</label>
                      <input
                        type="text"
                        value={voiceConfig.edge?.rate ?? ""}
                        placeholder="+0%"
                        onChange={(e) => handleVoiceFieldChange("edge", "rate", e.target.value)}
                        className="w-full px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] font-[var(--mono)] transition-colors focus:border-[var(--accent)] focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="font-semibold text-[11px]">Pitch</label>
                      <input
                        type="text"
                        value={voiceConfig.edge?.pitch ?? ""}
                        placeholder="+0Hz"
                        onChange={(e) => handleVoiceFieldChange("edge", "pitch", e.target.value)}
                        className="w-full px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] font-[var(--mono)] transition-colors focus:border-[var(--accent)] focus:outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-1">
                      <label className="font-semibold text-[11px]">Volume</label>
                      <input
                        type="text"
                        value={voiceConfig.edge?.volume ?? ""}
                        placeholder="+0%"
                        onChange={(e) => handleVoiceFieldChange("edge", "volume", e.target.value)}
                        className="w-full px-2.5 py-[7px] border border-[var(--border)] bg-[var(--card)] text-[13px] font-[var(--mono)] transition-colors focus:border-[var(--accent)] focus:outline-none"
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Save button */}
            <div className="flex items-center gap-3 mt-4">
              <button
                className={`btn text-xs py-[5px] px-4 !mt-0 ${voiceSaveSuccess ? "!bg-[var(--ok,#16a34a)] !border-[var(--ok,#16a34a)]" : ""}`}
                onClick={() => void handleVoiceSave()}
                disabled={voiceSaving}
              >
                {voiceSaving ? "Saving..." : voiceSaveSuccess ? "Saved" : "Save Voice Config"}
              </button>
              {voiceSaveError && (
                <span className="text-xs text-[var(--danger,#e74c3c)]">{voiceSaveError}</span>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
