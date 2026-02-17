/**
 * Chat view component.
 *
 * Layout: flex column filling parent. Header row (title + clear + toggles).
 * Scrollable messages area. Share/file notices below messages.
 * Input row at bottom with mic + textarea + send button.
 */

import {
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { getVrmPreviewUrl, useApp } from "../AppContext";
import { client, type ImageAttachment, type VoiceConfig } from "../api-client";
import {
  useVoiceChat,
  type VoicePlaybackStartEvent,
} from "../hooks/useVoiceChat";
import { MessageContent } from "./MessageContent";

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function isMobileViewport(): boolean {
  return typeof window !== "undefined" && window.innerWidth < 768;
}

const CHAT_INPUT_MIN_HEIGHT_PX = 38;
const CHAT_INPUT_MAX_HEIGHT_PX = 200;

export function ChatView() {
  const {
    agentStatus,
    chatInput,
    chatSending,
    chatFirstTokenReceived,
    conversationMessages,
    handleChatSend,
    handleChatStop,
    setState,
    droppedFiles,
    shareIngestNotice,
    chatMode,
    chatAvatarVisible: avatarVisible,
    chatAgentVoiceMuted: agentVoiceMuted,
    selectedVrmIndex,
    chatPendingImages,
    setChatPendingImages,
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

    window.addEventListener("milady:voice-config-updated", handler);
    return () =>
      window.removeEventListener("milady:voice-config-updated", handler);
  }, [loadVoiceConfig]);

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
      if (chatSending) return;
      const speechEndedAtMs = nowMs();
      pendingVoiceTurnRef.current = {
        speechEndedAtMs,
        expiresAtMs: speechEndedAtMs + 15000,
      };
      setVoiceLatency(null);
      setState("chatInput", text);
      setTimeout(() => void handleChatSend("VOICE_DM"), 50);
    },
    [chatSending, setState, handleChatSend],
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
    voiceConfig,
  });
  const { queueAssistantSpeech, stopSpeaking } = voice;

  const agentName = agentStatus?.agentName ?? "Agent";
  const msgs = conversationMessages;
  const visibleMsgs = msgs.filter(
    (msg) =>
      !(
        chatSending &&
        !chatFirstTokenReceived &&
        msg.role === "assistant" &&
        !msg.text.trim()
      ),
  );
  const agentAvatarSrc =
    selectedVrmIndex > 0 ? getVrmPreviewUrl(selectedVrmIndex) : null;
  const agentInitial = agentName.trim().charAt(0).toUpperCase() || "A";

  useEffect(() => {
    if (agentVoiceMuted) return;

    const latestAssistant = [...msgs]
      .reverse()
      .find((message) => message.role === "assistant");
    if (!latestAssistant || !latestAssistant.text.trim()) return;

    queueAssistantSpeech(latestAssistant.id, latestAssistant.text, !chatSending);
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

  // Smooth auto-scroll while streaming and on new messages.
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, []);

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
    if (chatSending || isMobileViewport()) return;
    textareaRef.current?.focus();
  }, [chatSending]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
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
        setChatPendingImages((prev) => [...prev, ...attachments]);
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
      setChatPendingImages(chatPendingImages.filter((_, i) => i !== index));
    },
    [chatPendingImages, setChatPendingImages],
  );

  return (
    <div
      className={`flex flex-col flex-1 min-h-0 px-2 sm:px-3 relative${imageDragOver ? " ring-2 ring-accent ring-inset" : ""}`}
      onDragOver={(e) => { e.preventDefault(); setImageDragOver(true); }}
      onDragLeave={() => setImageDragOver(false)}
      onDrop={handleImageDrop}
    >
      {/* ── Messages ───────────────────────────────────────────────── */}
      <div
        ref={messagesRef}
        className="flex-1 overflow-y-auto py-2 pr-2 sm:pr-3 relative"
        style={{ zIndex: 1, scrollbarGutter: "stable" }}
      >
        {visibleMsgs.length === 0 && !chatSending ? (
          <div className="text-center py-10 text-muted italic">
            Send a message to start chatting.
          </div>
        ) : (
          <div className="w-full pr-1">
            {visibleMsgs.map((msg, i) => {
              const prev = i > 0 ? visibleMsgs[i - 1] : null;
              const grouped = prev?.role === msg.role;
              const isUser = msg.role === "user";

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-1.5 sm:gap-2 ${isUser ? "justify-end" : "justify-start"} ${grouped ? "mt-1" : "mt-3"}`}
                  data-testid="chat-message"
                  data-role={msg.role}
                >
                  {!isUser &&
                    (grouped ? (
                      <div className="w-7 h-7 shrink-0" aria-hidden />
                    ) : (
                      <div className="w-7 h-7 shrink-0 rounded-full overflow-hidden border border-border bg-bg-hover">
                        {agentAvatarSrc ? (
                          <img
                            src={agentAvatarSrc}
                            alt={`${agentName} avatar`}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-muted">
                            {agentInitial}
                          </div>
                        )}
                      </div>
                    ))}
                  <div className="max-w-[92%] sm:max-w-[85%] min-w-0 px-0 py-1 text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {!grouped && (
                      <div className="font-bold text-[12px] mb-1 text-accent">
                        {isUser ? "You" : agentName}
                        {!isUser &&
                          typeof msg.source === "string" &&
                          msg.source &&
                          msg.source !== "client_chat" && (
                            <span className="ml-1.5 text-[10px] font-normal text-muted opacity-40">
                              via {msg.source}
                            </span>
                          )}
                      </div>
                    )}
                    <div>
                      <MessageContent message={msg} />
                    </div>
                  </div>
                </div>
              );
            })}

            {chatSending && !chatFirstTokenReceived && (
              <div className="mt-3 flex items-start gap-2 justify-start">
                <div className="w-7 h-7 shrink-0 rounded-full overflow-hidden border border-border bg-bg-hover">
                  {agentAvatarSrc ? (
                    <img
                      src={agentAvatarSrc}
                      alt={`${agentName} avatar`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-muted">
                      {agentInitial}
                    </div>
                  )}
                </div>
                <div className="max-w-[92%] sm:max-w-[85%] min-w-0 px-0 py-1 text-sm leading-relaxed">
                  <div className="font-bold text-[12px] mb-1 text-accent">
                    {agentName}
                  </div>
                  <div className="flex gap-1 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite_0.2s]" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite_0.4s]" />
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

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
            <div key={`${img.name}-${i}`} className="relative group w-16 h-16 shrink-0">
              <img
                src={`data:${img.mimeType};base64,${img.data}`}
                alt={img.name}
                className="w-16 h-16 object-cover border border-border rounded"
              />
              <button
                type="button"
                title="Remove image"
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-danger text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
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

      {/* Custom Actions / Avatar / Voice controls */}
      <div className="flex gap-1.5 relative" style={{ zIndex: 1 }}>
          {/* Custom Actions panel toggle */}
          <button
            className="h-7 px-2 flex items-center gap-1 border rounded cursor-pointer transition-all bg-card border-border text-muted hover:border-accent hover:text-accent"
            onClick={() => window.dispatchEvent(new Event("toggle-custom-actions-panel"))}
            title="Custom Actions"
            aria-label="Open custom actions panel"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span className="text-[10px] font-medium">Actions</span>
          </button>

          {/* Show / hide avatar */}
          <button
            className={`w-7 h-7 flex items-center justify-center border rounded cursor-pointer transition-all bg-card ${
              avatarVisible
                ? "border-accent text-accent"
                : "border-border text-muted hover:border-accent hover:text-accent"
            }`}
            onClick={() => setState("chatAvatarVisible", !avatarVisible)}
            title={avatarVisible ? "Hide avatar" : "Show avatar"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
              {!avatarVisible && <line x1="3" y1="3" x2="21" y2="21" />}
            </svg>
          </button>

          {/* Mute / unmute agent voice */}
          <button
            className={`w-7 h-7 flex items-center justify-center border rounded cursor-pointer transition-all bg-card ${
              agentVoiceMuted
                ? "border-border text-muted hover:border-accent hover:text-accent"
                : "border-accent text-accent"
            }`}
            onClick={() => {
              const muting = !agentVoiceMuted;
              setState("chatAgentVoiceMuted", muting);
              if (muting) voice.stopSpeaking();
            }}
            title={agentVoiceMuted ? "Unmute agent voice" : "Mute agent voice"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              {agentVoiceMuted ? (
                <line x1="23" y1="9" x2="17" y2="15" />
              ) : (
                <>
                  <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                </>
              )}
              {agentVoiceMuted && <line x1="17" y1="9" x2="23" y2="15" />}
            </svg>
          </button>
        </div>

      {/* ── Input row: mic + paperclip + textarea + send ───────────── */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />
      <div
        className="flex gap-1.5 sm:gap-2 items-end border-t border-border pt-3 pb-3 sm:pb-4 relative"
        style={{ zIndex: 1 }}
      >
        {/* Paperclip / image attach button */}
        <button
          type="button"
          className={`h-[38px] w-[38px] shrink-0 flex items-center justify-center border rounded cursor-pointer transition-all self-end ${
            chatPendingImages.length > 0
              ? "border-accent bg-accent/10 text-accent"
              : "border-border bg-card text-muted hover:border-accent hover:text-accent"
          }`}
          onClick={() => fileInputRef.current?.click()}
          title="Attach image"
          disabled={chatSending}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <title>Attach image</title>
            <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
          </svg>
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
            title={voice.isListening ? "Stop listening" : "Voice input"}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill={voice.isListening ? "currentColor" : "none"}
              stroke="currentColor"
              strokeWidth={voice.isListening ? "0" : "2"}
            >
              <title>
                {voice.isListening ? "Stop listening" : "Voice input"}
              </title>
              {voice.isListening ? (
                <>
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                  <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </>
              ) : (
                <>
                  <path d="M12 1a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v1a7 7 0 0 1-14 0v-1" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </>
              )}
            </svg>
          </button>
        )}

        {/* Textarea / live transcript */}
        {voice.isListening && voice.interimTranscript ? (
          <div className="flex-1 min-w-0 px-3 py-2 border border-accent bg-card text-txt text-sm font-body leading-relaxed min-h-[38px] flex items-center">
            <span className="text-muted italic">{voice.interimTranscript}</span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            className="flex-1 min-w-0 px-3 py-2 border border-border bg-card text-txt text-sm font-body leading-relaxed resize-none overflow-y-hidden min-h-[38px] max-h-[200px] focus:border-accent focus:outline-none"
            rows={1}
            placeholder={
              voice.isListening ? "Listening..." : "Type a message..."
            }
            value={chatInput}
            onChange={(e) => setState("chatInput", e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={chatSending}
          />
        )}

        {/* Send / Stop */}
        {chatSending ? (
          <button
            type="button"
            className="h-[38px] shrink-0 px-3 sm:px-4 py-2 border border-danger bg-danger/10 text-danger text-sm cursor-pointer hover:bg-danger/20 self-end"
            onClick={handleChatStop}
            title="Stop generation"
          >
            Stop
          </button>
        ) : voice.isSpeaking ? (
          <button
            type="button"
            className="h-[38px] shrink-0 px-3 sm:px-4 py-2 border border-danger bg-danger/10 text-danger text-sm cursor-pointer hover:bg-danger/20 self-end"
            onClick={stopSpeaking}
            title="Stop speaking"
          >
            Stop Voice
          </button>
        ) : (
          <button
            type="button"
            className="h-[38px] shrink-0 px-4 sm:px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed self-end"
            onClick={() => void handleChatSend()}
            disabled={chatSending}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
