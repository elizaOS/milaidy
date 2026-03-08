/**
 * Chat view component.
 *
 * Layout: flex column filling parent. Header row (title + clear + toggles).
 * Scrollable messages area. Share/file notices below messages.
 * Input row at bottom with mic + textarea + send button.
 */

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
import type { ImageAttachment, VoiceConfig } from "../api-client";
import { useTabNavigation } from "../hooks/useTabNavigation";
import {
  useVoiceChat,
  type VoicePlaybackStartEvent,
} from "../hooks/useVoiceChat";
import { createTranslator } from "../i18n";
import { loadVoiceConfig as fetchVoiceConfig } from "../voice-config";
import { AgentActivityBox } from "./AgentActivityBox";
import { ChatEmptyState, ChatMessage, TypingIndicator } from "./ChatMessage";
import { MessageContent } from "./MessageContent";
import { ShortcutHintRail } from "./shared/ShortcutHintRail";

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

const CHAT_INPUT_MIN_HEIGHT_PX = 38;
const CHAT_INPUT_MAX_HEIGHT_PX = 200;
const CHAT_VIRTUALIZATION_THRESHOLD = 120;
const CHAT_VIRTUAL_ROW_ESTIMATE_PX = 112;
const CHAT_VIRTUAL_OVERSCAN = 8;

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

export type ChatViewVariant = "default" | "game-modal";

interface ChatViewProps {
  variant?: ChatViewVariant;
}

export function ChatView({ variant = "default" }: ChatViewProps) {
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
    chatMode,
    selectedVrmIndex,
    chatPendingImages,
    setChatPendingImages,
    uiLanguage,
    openEmotePicker,
    ptySessions,
  } = useApp();
  const { quickActions, runQuickAction } = useTabNavigation();
  const t = useMemo(() => createTranslator(uiLanguage), [uiLanguage]);

  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [imageDragOver, setImageDragOver] = useState(false);
  const [scrollSnapshot, setScrollSnapshot] = useState({
    clientHeight: 0,
    scrollTop: 0,
  });

  // ── Voice config (ElevenLabs / browser TTS) ────────────────────────
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig | null>(null);

  const loadVoiceConfig = useCallback(async () => {
    const config = await fetchVoiceConfig();
    setVoiceConfig(config);
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

    window.addEventListener("milady:voice-config-updated", handler);
    return () =>
      window.removeEventListener("milady:voice-config-updated", handler);
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
    [isComposerLocked, setState, handleChatSend],
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
  const showSlashHelp = chatInput.trim().startsWith("/");
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
  const activeGameQuickAction = quickActions.find(
    (action) => action.id === "open-active-game" && action.available,
  );
  const shouldVirtualize =
    !isGameModal && visibleMsgs.length >= CHAT_VIRTUALIZATION_THRESHOLD;
  const virtualWindowCount = shouldVirtualize
    ? Math.max(
        18,
        Math.ceil(scrollSnapshot.clientHeight / CHAT_VIRTUAL_ROW_ESTIMATE_PX) +
          CHAT_VIRTUAL_OVERSCAN * 2,
      )
    : visibleMsgs.length;
  const virtualStartIndex = shouldVirtualize
    ? Math.max(
        0,
        Math.floor(scrollSnapshot.scrollTop / CHAT_VIRTUAL_ROW_ESTIMATE_PX) -
          CHAT_VIRTUAL_OVERSCAN,
      )
    : 0;
  const virtualEndIndex = shouldVirtualize
    ? Math.min(visibleMsgs.length, virtualStartIndex + virtualWindowCount)
    : visibleMsgs.length;
  const renderedMsgs = shouldVirtualize
    ? visibleMsgs.slice(virtualStartIndex, virtualEndIndex)
    : visibleMsgs;
  const topSpacerHeight = shouldVirtualize
    ? virtualStartIndex * CHAT_VIRTUAL_ROW_ESTIMATE_PX
    : 0;
  const bottomSpacerHeight = shouldVirtualize
    ? (visibleMsgs.length - virtualEndIndex) * CHAT_VIRTUAL_ROW_ESTIMATE_PX
    : 0;
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

  useEffect(() => {
    const scroller = messagesRef.current;
    if (!scroller) return;
    const syncScrollSnapshot = () => {
      setScrollSnapshot({
        clientHeight: scroller.clientHeight,
        scrollTop: scroller.scrollTop,
      });
    };

    syncScrollSnapshot();
    window.addEventListener("resize", syncScrollSnapshot);
    return () => window.removeEventListener("resize", syncScrollSnapshot);
  }, [visibleMsgs.length]);

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
        className="flex-1 overflow-y-auto py-2 pr-3 sm:pr-4 relative"
        style={{ zIndex: 1, scrollbarGutter: "stable both-edges" }}
        onScroll={(event) => {
          const target = event.currentTarget;
          setScrollSnapshot({
            clientHeight: target.clientHeight,
            scrollTop: target.scrollTop,
          });
        }}
      >
        {visibleMsgs.length === 0 && !chatSending ? (
          <div className="flex h-full flex-col">
            <ChatEmptyState agentName={agentName} />
            <div className="flex flex-wrap items-center justify-center gap-2 pb-6">
              <button
                type="button"
                className="btn-ghost focus-ring rounded-md px-3 py-2 text-xs font-medium"
                onClick={() => setState("chatInput", "/voice")}
                data-testid="chat-empty-voice"
              >
                Open voice controls
              </button>
              {activeGameQuickAction ? (
                <button
                  type="button"
                  className="btn-ghost focus-ring rounded-md px-3 py-2 text-xs font-medium"
                  onClick={() => void runQuickAction("open-active-game")}
                  data-testid="chat-empty-open-active-game"
                >
                  Open active game
                </button>
              ) : null}
              <button
                type="button"
                className="btn-ghost focus-ring rounded-md px-3 py-2 text-xs font-medium"
                onClick={() => void runQuickAction("restart-open-logs")}
                data-testid="chat-empty-restart-open-logs"
              >
                Restart + open logs
              </button>
            </div>
          </div>
        ) : isGameModal ? (
          <div className="chat-game-message-list">
            {visibleMsgs.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div key={msg.id} className="chat-game-message-row">
                  <div
                    className={`chat-game-bubble ${isUser ? "chat-game-bubble-user" : ""}`}
                  >
                    <div className="chat-game-message-body">
                      <MessageContent message={msg} />
                    </div>
                  </div>
                </div>
              );
            })}
            {chatSending && !chatFirstTokenReceived && (
              <div className="chat-game-message-row">
                <div className="chat-game-bubble chat-game-bubble-typing">
                  <span className="chat-game-typing-dots">...</span>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="w-full pr-2 sm:pr-3 space-y-1">
            {topSpacerHeight > 0 ? (
              <div
                aria-hidden
                style={{ height: topSpacerHeight }}
                data-testid="chat-virtual-spacer-top"
              />
            ) : null}
            {renderedMsgs.map((msg, i) => {
              const absoluteIndex = shouldVirtualize ? virtualStartIndex + i : i;
              const prev = absoluteIndex > 0 ? visibleMsgs[absoluteIndex - 1] : null;
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
            {bottomSpacerHeight > 0 ? (
              <div
                aria-hidden
                style={{ height: bottomSpacerHeight }}
                data-testid="chat-virtual-spacer-bottom"
              />
            ) : null}

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
                title="Remove image"
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
          Silence end→first token: {voiceLatency.speechEndToFirstTokenMs ?? "—"}
          ms · end→voice start: {voiceLatency.speechEndToVoiceStartMs ?? "—"}ms
          · first sentence:{" "}
          {voiceLatency.firstSegmentCached == null
            ? "—"
            : voiceLatency.firstSegmentCached
              ? "cached"
              : "uncached"}
        </div>
      )}

      {showSlashHelp && (
        <div
          className="pb-2 text-[11px] text-muted relative"
          style={{ zIndex: 1 }}
          data-testid="chat-slash-help"
        >
          Slash commands: <code>/clear</code>, <code>/retry</code>,{" "}
          <code>/voice</code>
        </div>
      )}

      {!isGameModal && (
        <ShortcutHintRail
          hints={[
            { keys: "Enter", label: "Send" },
            { keys: "Shift Enter", label: "New line" },
            { keys: "Cmd/Ctrl K", label: "Palette" },
          ]}
          className="pb-2 relative"
          dataTestId="chat-shortcut-rail"
        />
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
        <div className="chat-game-composer" style={{ zIndex: 1 }}>
          {/* Mic button */}
          <button
            type="button"
            className={`chat-game-mic-btn${voice.isListening ? " is-listening" : ""}`}
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
            <Mic className="w-4 h-4" />
          </button>

          {/* Emote picker toggle */}
          <button
            type="button"
            className="chat-game-emote-btn"
            onClick={openEmotePicker}
            disabled={isComposerLocked}
            aria-label={t("chat.openEmotePicker")}
            title="Emotes (⌘E)"
          >
            <Smile className="w-4 h-4" />
          </button>

          {/* Input */}
          {voice.isListening && voice.interimTranscript ? (
            <div className="chat-game-live-transcript">
              {voice.interimTranscript}
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              className="chat-game-input"
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
              data-testid="chat-composer-input"
            />
          )}

          {/* Send / Stop */}
          {chatSending ? (
            <button
              type="button"
              className="chat-game-send-btn chat-game-send-btn-danger"
              onClick={handleChatStop}
              data-testid="chat-stop-button"
            >
              {t("chat.stop")}
            </button>
          ) : (
            <button
              type="button"
              className="chat-game-send-btn chat-game-send-btn-primary"
              onClick={() => void handleChatSend(chatMode)}
              disabled={isComposerLocked || !chatInput.trim()}
              data-testid="chat-send-button"
            >
              {isAgentStarting ? t("chat.agentStarting") : t("chat.send")}
            </button>
          )}
        </div>
      ) : (
        /* ── Default composer ─────────────────────────────────────────── */
        <div
          className="flex gap-1.5 sm:gap-2 items-end border-t border-border pt-3 pb-3 sm:pb-4 relative"
          style={{ zIndex: 1 }}
        >
          {/* Paperclip / image attach button */}
          <button
            type="button"
            className={`h-[38px] w-[38px] shrink-0 flex items-center justify-center border rounded cursor-pointer transition-all duration-200 hover:shadow-sm self-end ${
              chatPendingImages.length > 0
                ? "border-accent bg-accent/10 text-accent"
                : "border-border bg-card text-muted hover:border-accent hover:text-accent"
            }`}
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach image"
            title="Attach image"
            disabled={isComposerLocked}
          >
            <Paperclip className="w-4 h-4" />
          </button>

          {/* Mic button — user voice input */}
          {voice.supported && (
            <button
              type="button"
              className={`h-[38px] w-[38px] flex-shrink-0 flex items-center justify-center border rounded cursor-pointer transition-all self-end ${
                voice.isListening
                  ? "bg-accent border-accent text-accent-fg shadow-[0_0_10px_rgba(124,58,237,0.4)] animate-pulse"
                  : "border-border bg-card text-muted hover:border-accent hover:text-accent"
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
            </button>
          )}

          {/* Emote picker toggle */}
          <button
            type="button"
            className="h-[38px] w-[38px] shrink-0 flex items-center justify-center border border-border bg-card text-muted rounded cursor-pointer transition-all duration-200 hover:border-accent hover:text-accent hover:shadow-sm self-end"
            onClick={openEmotePicker}
            disabled={isComposerLocked}
            aria-label={t("chat.openEmotePicker")}
            title="Emotes (⌘E)"
          >
            <Smile className="w-4 h-4" />
          </button>

          {/* Textarea / live transcript */}
          {voice.isListening && voice.interimTranscript ? (
            <div className="flex-1 min-w-0 px-3 py-2 border border-accent bg-card text-txt text-sm font-body leading-relaxed min-h-[38px] flex items-center">
              <span className="text-muted italic">
                {voice.interimTranscript}
              </span>
            </div>
          ) : (
            <textarea
              ref={textareaRef}
              className="flex-1 min-w-0 px-3 py-2 border border-border bg-card text-txt text-sm font-body leading-relaxed resize-none overflow-y-hidden min-h-[38px] max-h-[200px] focus:border-accent focus:outline-none"
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
              data-testid="chat-composer-input"
            />
          )}

          {/* Send / Stop */}
          {chatSending ? (
            <button
              type="button"
              className="h-[38px] shrink-0 px-3 sm:px-4 py-2 border border-danger bg-danger/10 text-danger text-sm cursor-pointer hover:bg-danger/20 transition-all duration-200 hover:shadow-sm self-end flex items-center gap-1.5"
              onClick={handleChatStop}
              title={t("chat.stopGeneration")}
              data-testid="chat-stop-button"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>{t("chat.stop")}</span>
            </button>
          ) : voice.isSpeaking ? (
            <button
              type="button"
              className="h-[38px] shrink-0 px-3 sm:px-4 py-2 border border-danger bg-danger/10 text-danger text-sm cursor-pointer hover:bg-danger/20 transition-all duration-200 hover:shadow-sm self-end flex items-center gap-1.5"
              onClick={stopSpeaking}
              title={t("chat.stopSpeaking")}
              data-testid="chat-stop-button"
            >
              <Square className="w-3 h-3 fill-current" />
              <span>{t("chat.stopVoice")}</span>
            </button>
          ) : (
            <button
              type="button"
              className="h-[38px] shrink-0 px-4 sm:px-5 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-200 hover:shadow-sm self-end flex items-center gap-1.5"
              onClick={() => void handleChatSend()}
              disabled={isComposerLocked || !chatInput.trim()}
              aria-label={t("chat.send")}
              title={isAgentStarting ? t("chat.agentStarting") : t("chat.send")}
              data-testid="chat-send-button"
            >
              <Send className="w-4 h-4" />
              <span>
                {isAgentStarting ? t("chat.agentStarting") : t("chat.send")}
              </span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}
