/**
 * Chat view component.
 *
 * Layout: flex column filling parent. Header row (title + clear + toggles).
 * Scrollable messages area. Share/file notices below messages.
 * Input row at bottom with mic + textarea + send button.
 */

import {
  client,
  type ImageAttachment,
  type VoiceConfig,
} from "@milady/app-core/api";
import { VOICE_CONFIG_UPDATED_EVENT } from "@milady/app-core/events";
import { Button, Textarea } from "@milady/ui";
import { Mic, Paperclip, Send, Smile, Square } from "lucide-react";
import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { getVrmPreviewUrl, useApp } from "../AppContext";
import { useTimeout } from "../hooks/useTimeout";
import {
  useVoiceChat,
  type VoicePlaybackStartEvent,
} from "../hooks/useVoiceChat";
import { AgentActivityBox } from "./AgentActivityBox";
import { ChatEmptyState, ChatMessage, TypingIndicator } from "./ChatMessage";
import { MessageContent } from "./MessageContent";

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

const CHAT_INPUT_MIN_HEIGHT_PX = 38;
const CHAT_INPUT_MAX_HEIGHT_PX = 200;

/**
 * Routine coding-agent status messages that belong in the activity box, not chat.
 * These messages are intentionally stored in the database (for audit/debugging)
 * but filtered from the visible chat UI — this is by design, not a bug.
 */
const ROUTINE_CODING_AGENT_RE =
  /^\[.+?\] (?:Approved:|Responded:|Sent keys:|Turn done, continuing:|Idle for \d+[smh])/;

export function isRoutineCodingAgentMessage(msg: {
  source?: string;
  text: string;
}): boolean {
  return (
    msg.source === "coding-agent" && ROUTINE_CODING_AGENT_RE.test(msg.text)
  );
}

type ChatViewVariant = "default" | "game-modal";

function GameModalMessage({
  msg,
  children,
}: {
  msg: { timestamp?: number; role?: string };
  children: React.ReactNode;
}) {
  const [faded, setFaded] = useState(false);
  useEffect(() => {
    if (!msg.timestamp) return;
    const age = Date.now() - msg.timestamp;
    if (age > 60000) {
      setFaded(true);
    } else {
      const timer = setTimeout(() => setFaded(true), 60000 - age);
      return () => clearTimeout(timer);
    }
  }, [msg.timestamp]);

  const isUser = msg.role === "user";
  return (
    <div
      className={`flex w-full transition-opacity duration-1000 ${faded ? "opacity-0 pointer-events-none" : "opacity-100"} ${isUser ? "justify-end" : "justify-start"}`}
    >
      {children}
    </div>
  );
}

interface ChatViewProps {
  variant?: ChatViewVariant;
}

export function ChatView({ variant = "default" }: ChatViewProps) {
  const { setTimeout } = useTimeout();

  const isGameModal = variant === "game-modal";
  const {
    agentStatus,
    chatInput,
    chatSending,
    chatFirstTokenReceived,
    conversationMessages,
    handleChatSend,
    handleChatStop,
    handleChatRetry,
    setState,
    droppedFiles,
    shareIngestNotice,
    chatAgentVoiceMuted: agentVoiceMuted,
    selectedVrmIndex,
    chatPendingImages,
    setChatPendingImages,
    uiLanguage,
    openEmotePicker,
    ptySessions,
    t,
  } = useApp();

  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageDragOver, setImageDragOver] = useState(false);

  // ── Voice config (ElevenLabs / browser TTS) ────────────────────────
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig | null>(null);

  const loadVoiceConfig = useCallback(async () => {
    try {
      const cfg = await client.getConfig();
      const messages = cfg.messages as
        | Record<string, Record<string, string>>
        | undefined;
      const tts = messages?.tts as VoiceConfig | undefined;
      setVoiceConfig(tts ?? null);
    } catch {
      /* ignore — will use browser TTS fallback */
    }
  }, []);

  // Load saved voice config on mount so the correct TTS provider is used
  useEffect(() => {
    void loadVoiceConfig();
  }, [loadVoiceConfig]);

  // Keep chat voice config synchronized when Settings/Character voice is saved.
  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const handler = (event: Event) => {
      const detail = (event as CustomEvent<VoiceConfig | undefined>).detail;
      if (detail && typeof detail === "object") {
        setVoiceConfig(detail);
        return;
      }
      void loadVoiceConfig();
    };

    window.addEventListener(VOICE_CONFIG_UPDATED_EVENT, handler);
    return () =>
      window.removeEventListener(VOICE_CONFIG_UPDATED_EVENT, handler);
  }, [loadVoiceConfig]);

  // ── Derived composer state ──────────────────────────────────────
  const isAgentStarting =
    agentStatus?.state === "starting" || agentStatus?.state === "restarting";
  const isComposerLocked = chatSending || isAgentStarting;

  // ── Voice chat ────────────────────────────────────────────────────
  const pendingVoiceTurnRef = useRef<{
    speechEndedAtMs: number;
    expiresAtMs: number;
    firstTokenAtMs?: number;
    voiceStartedAtMs?: number;
    firstSegmentCached?: boolean;
  } | null>(null);

  const [voiceLatency, setVoiceLatency] = useState<{
    speechEndToFirstTokenMs: number | null;
    speechEndToVoiceStartMs: number | null;
    firstSegmentCached: boolean | null;
  } | null>(null);

  const handleVoiceTranscript = useCallback(
    (text: string) => {
      if (isComposerLocked) return;
      const speechEndedAtMs = nowMs();
      pendingVoiceTurnRef.current = {
        speechEndedAtMs,
        expiresAtMs: speechEndedAtMs + 15000,
      };
      setVoiceLatency(null);
      setState("chatInput", text);
      setTimeout(() => void handleChatSend("VOICE_DM"), 50);
    },
    [isComposerLocked, setState, handleChatSend, setTimeout],
  );

  const handleVoicePlaybackStart = useCallback(
    (event: VoicePlaybackStartEvent) => {
      const pending = pendingVoiceTurnRef.current;
      if (!pending) return;
      if (event.startedAtMs > pending.expiresAtMs) {
        pendingVoiceTurnRef.current = null;
        return;
      }
      if (pending.voiceStartedAtMs != null) return;

      pending.voiceStartedAtMs = event.startedAtMs;
      pending.firstSegmentCached = event.cached;

      const silenceMs = Math.max(
        0,
        Math.round(event.startedAtMs - pending.speechEndedAtMs),
      );
      setVoiceLatency((prev) => ({
        speechEndToFirstTokenMs: prev?.speechEndToFirstTokenMs ?? null,
        speechEndToVoiceStartMs: silenceMs,
        firstSegmentCached: event.cached,
      }));
    },
    [],
  );

  const voice = useVoiceChat({
    onTranscript: handleVoiceTranscript,
    onPlaybackStart: handleVoicePlaybackStart,
    lang: uiLanguage === "zh-CN" ? "zh-CN" : "en-US",
    voiceConfig,
  });
  const { queueAssistantSpeech, stopSpeaking } = voice;

  const agentName = agentStatus?.agentName ?? "Agent";
  const msgs = conversationMessages;
  const visibleMsgs = useMemo(
    () =>
      msgs.filter(
        (msg) =>
          !(
            chatSending &&
            !chatFirstTokenReceived &&
            msg.role === "assistant" &&
            !msg.text.trim()
          ) && !isRoutineCodingAgentMessage(msg),
      ),
    [chatFirstTokenReceived, chatSending, msgs],
  );
  const agentAvatarSrc =
    selectedVrmIndex > 0 ? getVrmPreviewUrl(selectedVrmIndex) : null;

  useEffect(() => {
    if (agentVoiceMuted) return;

    const latestAssistant = [...msgs]
      .reverse()
      .find((message) => message.role === "assistant");
    if (!latestAssistant || !latestAssistant.text.trim()) return;

    queueAssistantSpeech(
      latestAssistant.id,
      latestAssistant.text,
      !chatSending,
    );
  }, [msgs, chatSending, agentVoiceMuted, queueAssistantSpeech]);

  useEffect(() => {
    if (!agentVoiceMuted) return;
    stopSpeaking();
  }, [agentVoiceMuted, stopSpeaking]);

  useEffect(() => {
    setState(
      "chatAvatarSpeaking",
      voice.isSpeaking && !voice.usingAudioAnalysis,
    );
    return () => {
      setState("chatAvatarSpeaking", false);
    };
  }, [setState, voice.isSpeaking, voice.usingAudioAnalysis]);

  useEffect(() => {
    const pending = pendingVoiceTurnRef.current;
    if (!pending || !chatFirstTokenReceived) return;
    if (nowMs() > pending.expiresAtMs) {
      pendingVoiceTurnRef.current = null;
      return;
    }
    if (pending.firstTokenAtMs != null) return;

    const firstTokenAtMs = nowMs();
    pending.firstTokenAtMs = firstTokenAtMs;
    const ttftMs = Math.max(
      0,
      Math.round(firstTokenAtMs - pending.speechEndedAtMs),
    );

    setVoiceLatency((prev) => ({
      speechEndToFirstTokenMs: ttftMs,
      speechEndToVoiceStartMs: prev?.speechEndToVoiceStartMs ?? null,
      firstSegmentCached: prev?.firstSegmentCached ?? null,
    }));
  }, [chatFirstTokenReceived]);

  useEffect(() => {
    const pending = pendingVoiceTurnRef.current;
    if (!pending) return;
    if (nowMs() > pending.expiresAtMs) {
      pendingVoiceTurnRef.current = null;
    }
  }, []);

  // Auto-scroll on new messages. Use instant scroll when already near the
  // bottom (or when the user is actively sending) to prevent the visible
  // "scroll from top" effect that occurs when many background messages
  // (e.g. coding-agent updates) arrive in rapid succession during smooth
  // scrolling. Only smooth-scroll when the user has scrolled up and a new
  // message nudges them back down.
  useEffect(() => {
    if (!chatSending && visibleMsgs.length === 0) {
      return;
    }
    const el = messagesRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const nearBottom = distanceFromBottom < 150;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: nearBottom ? "instant" : "smooth",
    });
  }, [chatSending, visibleMsgs]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    // Force a compact baseline when empty so the composer never boots oversized.
    if (!chatInput) {
      ta.style.height = `${CHAT_INPUT_MIN_HEIGHT_PX}px`;
      ta.style.overflowY = "hidden";
      return;
    }

    ta.style.height = "auto";
    ta.style.overflowY = "hidden";
    const h = Math.min(ta.scrollHeight, CHAT_INPUT_MAX_HEIGHT_PX);
    ta.style.height = `${h}px`;
    ta.style.overflowY =
      ta.scrollHeight > CHAT_INPUT_MAX_HEIGHT_PX ? "auto" : "hidden";
  }, [chatInput]);

  // Keep input focused for fast multi-turn chat.
  useEffect(() => {
    if (isComposerLocked || isMobileViewport()) return;
    textareaRef.current?.focus();
  }, [isComposerLocked]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (isComposerLocked) return;
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleChatSend();
    }
  };

  const addImageFiles = useCallback(
    (files: FileList | File[]) => {
      const imageFiles = Array.from(files).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (!imageFiles.length) return;

      const readers = imageFiles.map(
        (file) =>
          new Promise<ImageAttachment>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              const result = reader.result as string;
              // result is "data:<mime>;base64,<data>" — strip the prefix
              const commaIdx = result.indexOf(",");
              const data = commaIdx >= 0 ? result.slice(commaIdx + 1) : result;
              resolve({ data, mimeType: file.type, name: file.name });
            };
            reader.readAsDataURL(file);
          }),
      );

      void Promise.all(readers).then((attachments) => {
        setChatPendingImages((prev) => {
          const combined = [...prev, ...attachments];
          // Mirror the server-side MAX_CHAT_IMAGES=4 limit so the user gets
          // immediate feedback rather than a 400 after upload.
          return combined.slice(0, 4);
        });
      });
    },
    [setChatPendingImages],
  );

  const handleImageDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setImageDragOver(false);
      if (e.dataTransfer.files.length) {
        addImageFiles(e.dataTransfer.files);
      }
    },
    [addImageFiles],
  );

  const handleFileInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) {
        addImageFiles(e.target.files);
      }
      e.target.value = "";
    },
    [addImageFiles],
  );

  const removeImage = useCallback(
    (index: number) => {
      setChatPendingImages((prev) => prev.filter((_, i) => i !== index));
    },
    [setChatPendingImages],
  );

  return (
    <section
      aria-label="Chat workspace"
      className={`flex flex-col flex-1 min-h-0 px-2 sm:px-3 relative${imageDragOver ? " ring-2 ring-accent ring-inset" : ""}`}
      onDragOver={(e) => {
        e.preventDefault();
        setImageDragOver(true);
      }}
      onDragLeave={() => setImageDragOver(false)}
      onDrop={handleImageDrop}
    >
      {/* ── Messages ───────────────────────────────────────────────── */}
      <div
        ref={messagesRef}
        data-testid="chat-messages-scroll"
        className="flex-1 overflow-y-auto py-2 pr-3 sm:pr-4 relative flex flex-col"
        style={{ zIndex: 1, scrollbarGutter: "stable both-edges" }}
      >
        {visibleMsgs.length === 0 && !chatSending ? (
          <ChatEmptyState agentName={agentName} />
        ) : isGameModal ? (
          <div className="flex flex-col gap-4 py-4 w-full mt-auto">
            {visibleMsgs.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <GameModalMessage key={msg.id} msg={msg}>
                  <div
                    className={`max-w-[85%] rounded-2xl px-4 py-3 text-[15px] leading-relaxed ${
                      isUser
                        ? "bg-accent/80 text-white rounded-br-sm"
                        : "bg-black/30 text-white/90 rounded-bl-sm"
                    }`}
                  >
                    <div
                      className="break-words"
                      style={{ fontFamily: "var(--font-chat)" }}
                    >
                      <MessageContent message={msg} />
                    </div>
                  </div>
                </GameModalMessage>
              );
            })}
            {chatSending && !chatFirstTokenReceived && (
              <div className="flex w-full justify-start">
                <div className="max-w-[85%] rounded-2xl rounded-bl-sm px-4 py-3 bg-black/30 flex items-center gap-1">
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce"
                    style={{ animationDelay: "0ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce"
                    style={{ animationDelay: "150ms" }}
                  />
                  <span
                    className="w-1.5 h-1.5 rounded-full bg-white/50 animate-bounce"
                    style={{ animationDelay: "300ms" }}
                  />
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full pr-2 sm:pr-3 space-y-1">
            {visibleMsgs.map((msg, i) => {
              const prev = i > 0 ? visibleMsgs[i - 1] : null;
              const isGrouped = prev?.role === msg.role;

              return (
                <ChatMessage
                  key={msg.id}
                  message={msg}
                  isGrouped={isGrouped}
                  agentName={agentName}
                  agentAvatarSrc={agentAvatarSrc}
                  onRetry={handleChatRetry}
                />
              );
            })}

            {chatSending && !chatFirstTokenReceived && (
              <TypingIndicator
                agentName={agentName}
                agentAvatarSrc={agentAvatarSrc}
              />
            )}
          </div>
        )}
      </div>

      {/* Agent activity box — sticky status per active coding-agent task */}
      <AgentActivityBox sessions={ptySessions} />

      {/* Share ingest notice */}
      {shareIngestNotice && (
        <div className="text-xs text-ok py-1 relative" style={{ zIndex: 1 }}>
          {shareIngestNotice}
        </div>
      )}

      {/* Dropped files */}
      {droppedFiles.length > 0 && (
        <div
          className="text-xs text-muted py-0.5 flex gap-2 relative"
          style={{ zIndex: 1 }}
        >
          {droppedFiles.map((f) => (
            <span key={f}>{f}</span>
          ))}
        </div>
      )}

      {/* Pending image thumbnails */}
      {chatPendingImages.length > 0 && (
        <div
          className="flex gap-2 flex-wrap py-1 relative"
          style={{ zIndex: 1 }}
        >
          {chatPendingImages.map((img, i) => (
            <div
              key={`${img.name}-${i}`}
              className="relative group w-16 h-16 shrink-0"
            >
              <img
                src={`data:${img.mimeType};base64,${img.data}`}
                alt={img.name}
                className="w-16 h-16 object-cover border border-border rounded"
              />
              <button
                type="button"
                title={t("chatview.RemoveImage")}
                aria-label={`Remove image ${img.name}`}
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-danger text-white text-[10px] flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 focus-visible:opacity-100 transition-opacity cursor-pointer"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {voiceLatency && (
        <div
          className="pb-1 text-[10px] text-muted relative"
          style={{ zIndex: 1 }}
        >
          {t("chatview.SilenceEndFirstTo")}{" "}
          {voiceLatency.speechEndToFirstTokenMs ?? "—"}
          {t("chatview.msEndVoiceStart")}{" "}
          {voiceLatency.speechEndToVoiceStartMs ?? "—"}
          {t("chatview.msFirst")}{" "}
          {voiceLatency.firstSegmentCached == null
            ? "—"
            : voiceLatency.firstSegmentCached
              ? "cached"
              : "uncached"}
        </div>
      )}

      {/* ── Input row: mic + paperclip + textarea + send ───────────── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
      {isGameModal ? (
        /* ── Game-modal composer ──────────────────────────────────────── */
        <div className="mt-auto pt-4 relative" style={{ zIndex: 1 }}>
          <div className="relative flex items-end min-h-[52px] gap-1 transition-all">
            {/* Mic button */}
            <Button
              variant="ghost"
              size="icon"
              className={`flex shrink-0 items-center justify-center w-[46px] h-[46px] mb-1.5 rounded-full transition-all ${
                voice.isListening
                  ? "bg-accent/20 text-accent"
                  : "bg-transparent text-white/50 hover:bg-white/10 hover:text-white"
              } ${isComposerLocked ? "opacity-50" : ""}`}
              onClick={voice.toggleListening}
              aria-label={
                isAgentStarting
                  ? t("chat.agentStarting")
                  : voice.isListening
                    ? t("chat.stopListening")
                    : t("chat.voiceInput")
              }
              disabled={isComposerLocked}
            >
              <Mic
                className={`w-5 h-5 ${voice.isListening ? "animate-pulse" : ""}`}
              />
            </Button>

            {/* Emote picker toggle */}
            <Button
              variant="ghost"
              size="icon"
              className={`flex shrink-0 items-center justify-center w-[46px] h-[46px] mb-1.5 rounded-full bg-transparent text-white/50 hover:bg-white/10 hover:text-white transition-all ${isComposerLocked ? "opacity-50" : ""}`}
              onClick={openEmotePicker}
              disabled={isComposerLocked}
              aria-label={t("chat.openEmotePicker")}
              title={t("chatview.EmotesE")}
            >
              <Smile className="w-5 h-5" />
            </Button>

            {/* Input */}
            {voice.isListening && voice.interimTranscript ? (
              <div className="flex-1 min-w-0 px-4 py-3 text-[15px] leading-relaxed text-white/80 italic font-[var(--font-chat)] bg-black/40 rounded-2xl min-h-[52px] flex items-center">
                {voice.interimTranscript}
              </div>
            ) : (
              <div className="flex-1 relative flex items-center bg-black/40 rounded-2xl focus-within:ring-2 focus-within:ring-accent/10 transition-all min-h-[52px]">
                <Textarea
                  ref={textareaRef}
                  className="w-full min-w-0 px-4 py-3 bg-transparent border-none text-[15px] leading-relaxed text-white resize-none overflow-y-hidden max-h-[150px] focus-visible:ring-0 placeholder:text-white/30 font-[var(--font-chat)] disabled:opacity-50"
                  rows={1}
                  aria-label="Chat message"
                  placeholder={
                    isAgentStarting
                      ? t("chat.agentStarting")
                      : t("chat.inputPlaceholder")
                  }
                  value={chatInput}
                  onChange={(e) => setState("chatInput", e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={isComposerLocked}
                />
              </div>
            )}

            {/* Send / Stop */}
            {chatSending ? (
              <Button
                variant="destructive"
                size="icon"
                className="flex shrink-0 items-center justify-center w-[46px] h-[46px] mb-1.5 rounded-full bg-danger/20 text-danger hover:bg-danger/30 transition-all ml-1"
                onClick={handleChatStop}
              >
                <Square className="w-4 h-4 fill-current" />
              </Button>
            ) : (
              <Button
                variant="default"
                size="icon"
                className="flex shrink-0 items-center justify-center w-[46px] h-[46px] mb-1.5 rounded-full bg-accent text-accent-fg transition-all disabled:opacity-40 ml-1 hover:shadow-[0_0_15px_rgba(240,178,50,0.4)]"
                onClick={() => void handleChatSend()}
                disabled={isComposerLocked || !chatInput.trim()}
              >
                <Send className="w-5 h-5" />
              </Button>
            )}
          </div>
        </div>
      ) : (
        /* ── Default composer ─────────────────────────────────────────── */
        <div
          className="flex gap-1.5 sm:gap-2 items-end border-t border-border pt-3 pb-3 sm:pb-4 relative"
          style={{ zIndex: 1 }}
        >
          {/* Paperclip / image attach button */}
          <Button
            variant={chatPendingImages.length > 0 ? "secondary" : "ghost"}
            size="icon"
            className={`h-[38px] w-[38px] shrink-0 ${
              chatPendingImages.length > 0
                ? "bg-accent/10 sm:hover:bg-accent/20 border-accent/20 text-accent/80 hover:text-accent shadow-sm"
                : "text-muted hover:bg-black/5 hover:text-txt"
            }`}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach image"
            title={t("chatview.AttachImage")}
            disabled={isComposerLocked}
          >
            <Paperclip className="w-4 h-4" />
          </Button>

          {/* Mic button — user voice input */}
          {voice.supported && (
            <Button
              variant={voice.isListening ? "default" : "ghost"}
              size="icon"
              className={`h-[38px] w-[38px] shrink-0 ${
                voice.isListening
                  ? "bg-accent shadow-[0_0_10px_rgba(124,58,237,0.4)] animate-pulse"
                  : "text-muted hover:bg-black/5 hover:text-txt"
              }`}
              onClick={voice.toggleListening}
              aria-label={
                isAgentStarting
                  ? t("chat.agentStarting")
                  : voice.isListening
                    ? t("chat.stopListening")
                    : t("chat.voiceInput")
              }
              aria-pressed={voice.isListening}
              title={
                isAgentStarting
                  ? t("chat.agentStarting")
                  : voice.isListening
                    ? t("chat.stopListening")
                    : t("chat.voiceInput")
              }
              disabled={isComposerLocked}
            >
              {voice.isListening ? (
                <Mic className="w-4 h-4 fill-current" />
              ) : (
                <Mic className="w-4 h-4" />
              )}
            </Button>
          )}

          {/* Emote picker toggle */}
          <Button
            variant="ghost"
            size="icon"
            className="h-[38px] w-[38px] shrink-0 text-muted hover:bg-black/5 hover:text-txt transition-colors"
            onClick={openEmotePicker}
            disabled={isComposerLocked}
            aria-label={t("chat.openEmotePicker")}
            title={t("chatview.EmotesE")}
          >
            <Smile className="w-4 h-4" />
          </Button>

          {/* Textarea / live transcript */}
          {voice.isListening && voice.interimTranscript ? (
            <div
              className="flex-1 min-w-0 px-3 py-2 border border-accent bg-card text-txt text-[15px] leading-[1.7] min-h-[38px] flex items-center rounded-md"
              style={{ fontFamily: "var(--font-chat)" }}
            >
              <span className="text-muted italic">
                {voice.interimTranscript}
              </span>
            </div>
          ) : (
            <Textarea
              ref={textareaRef}
              className="flex-1 min-w-0 px-3 py-2 bg-card/60 backdrop-blur-md border border-border/40 focus-visible:ring-accent text-txt text-[15px] leading-[1.7] resize-none overflow-y-hidden min-h-[38px] max-h-[200px]"
              style={{ fontFamily: "var(--font-chat)" }}
              rows={1}
              aria-label="Chat message"
              placeholder={
                isAgentStarting
                  ? t("chat.agentStarting")
                  : voice.isListening
                    ? t("chat.listening")
                    : t("chat.inputPlaceholder")
              }
              value={chatInput}
              onChange={(e) => setState("chatInput", e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isComposerLocked}
            />
          )}

          {/* Send / Stop */}
          {chatSending ? (
            <Button
              variant="destructive"
              className="h-[38px] shrink-0 px-3 sm:px-4 py-2 text-sm shadow-sm gap-1.5"
              onClick={handleChatStop}
              title={t("chat.stopGeneration")}
            >
              <Square className="w-3 h-3 fill-current" />
              <span>{t("chat.stop")}</span>
            </Button>
          ) : voice.isSpeaking ? (
            <Button
              variant="destructive"
              className="h-[38px] shrink-0 px-3 sm:px-4 py-2 text-sm shadow-sm gap-1.5"
              onClick={stopSpeaking}
              title={t("chat.stopSpeaking")}
            >
              <Square className="w-3 h-3 fill-current" />
              <span>{t("chat.stopVoice")}</span>
            </Button>
          ) : (
            <Button
              variant="default"
              className="h-[38px] shrink-0 px-4 sm:px-5 py-2 text-sm shadow-sm gap-1.5 font-bold tracking-wide"
              onClick={() => void handleChatSend()}
              disabled={isComposerLocked || !chatInput.trim()}
              aria-label={t("chat.send")}
              title={isAgentStarting ? t("chat.agentStarting") : t("chat.send")}
            >
              <Send className="w-4 h-4" />
              <span className="hidden sm:inline">
                {isAgentStarting ? t("chat.agentStarting") : t("chat.send")}
              </span>
            </Button>
          )}
        </div>
      )}
    </section>
  );
}
