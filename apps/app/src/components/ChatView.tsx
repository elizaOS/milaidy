/**
 * Chat view component.
 *
 * Layout: flex column filling parent. Header row (title + clear + toggles).
 * Scrollable messages area. Share/file notices below messages.
 * Input row at bottom with mic + textarea + send button.
 */

import {
  useRef,
  useEffect,
  useCallback,
  useState,
  type KeyboardEvent,
} from "react";
import { getVrmPreviewUrl, useApp } from "../AppContext.js";
import { ChatAvatar } from "./ChatAvatar.js";
import { useVoiceChat } from "../hooks/useVoiceChat.js";
import { client, type ConversationMode, type VoiceConfig } from "../api-client.js";
import { MessageContent } from "./MessageContent.js";

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
    selectedVrmIndex,
  } = useApp();

  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Toggles (persisted in localStorage) ──────────────────────────
  const [avatarVisible, setAvatarVisible] = useState(() => {
    try {
      const v = localStorage.getItem("milaidy:chat:avatarVisible");
      return v === null ? true : v === "true";
    } catch {
      return true;
    }
  });
  const [agentVoiceMuted, setAgentVoiceMuted] = useState(() => {
    try {
      const v = localStorage.getItem("milaidy:chat:voiceMuted");
      return v === null ? true : v === "true"; // muted by default
    } catch {
      return true;
    }
  });
  const [chatMode, setChatMode] = useState<ConversationMode>(() => {
    try {
      const v = localStorage.getItem("milaidy:chat:mode");
      return v === "power" ? "power" : "simple";
    } catch {
      return "simple";
    }
  });

  // Persist toggle changes
  useEffect(() => {
    try {
      localStorage.setItem("milaidy:chat:avatarVisible", String(avatarVisible));
    } catch {
      /* ignore */
    }
  }, [avatarVisible]);
  useEffect(() => {
    try {
      localStorage.setItem("milaidy:chat:voiceMuted", String(agentVoiceMuted));
    } catch {
      /* ignore */
    }
  }, [agentVoiceMuted]);
  useEffect(() => {
    try {
      localStorage.setItem("milaidy:chat:mode", chatMode);
    } catch {
      /* ignore */
    }
  }, [chatMode]);

  // ── Voice config (ElevenLabs / browser TTS) ────────────────────────
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig | null>(null);

  // Load saved voice config on mount so the correct TTS provider is used
  useEffect(() => {
    void (async () => {
      try {
        const cfg = await client.getConfig();
        const messages = cfg.messages as
          | Record<string, Record<string, string>>
          | undefined;
        const tts = messages?.tts as VoiceConfig | undefined;
        if (tts) setVoiceConfig(tts);
      } catch {
        /* ignore — will use browser TTS fallback */
      }
    })();
  }, []);

  // ── Voice chat ────────────────────────────────────────────────────
  const handleVoiceTranscript = useCallback(
    (text: string) => {
      if (chatSending) return;
      setState("chatInput", text);
      setTimeout(() => void handleChatSend(chatMode), 50);
    },
    [chatMode, chatSending, setState, handleChatSend],
  );

  const voice = useVoiceChat({ onTranscript: handleVoiceTranscript, voiceConfig });

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
  const agentAvatarSrc = selectedVrmIndex > 0 ? getVrmPreviewUrl(selectedVrmIndex) : null;
  const agentInitial = agentName.trim().charAt(0).toUpperCase() || "A";

  const lastSpokenIdRef = useRef<string | null>(null);

  useEffect(() => {
    const lastAssistant = [...msgs]
      .reverse()
      .find((message) => message.role === "assistant" && message.text.trim());
    if (!lastAssistant || chatSending || agentVoiceMuted) return;
    if (lastAssistant.id === lastSpokenIdRef.current) return;
    lastSpokenIdRef.current = lastAssistant.id;
    voice.speak(lastAssistant.text);
  }, [msgs, chatSending, agentVoiceMuted, voice]);

  // Smooth auto-scroll while streaming and on new messages.
  useEffect(() => {
    const el = messagesRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [conversationMessages, chatSending]);

  // Auto-resize textarea
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.overflowY = "hidden";
    const h = Math.min(ta.scrollHeight, 200);
    ta.style.height = `${h}px`;
    ta.style.overflowY = ta.scrollHeight > 200 ? "auto" : "hidden";
  }, [chatInput]);

  // Keep input focused for fast multi-turn chat.
  useEffect(() => {
    if (chatSending) return;
    textareaRef.current?.focus();
  }, [chatSending]);

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleChatSend(chatMode);
    }
  };

  return (
    <div className="flex flex-col flex-1 min-h-0 px-3 relative">
      {/* 3D Avatar moved to AutonomousPanel */}

      {/* ── Messages ───────────────────────────────────────────────── */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto py-2 relative" style={{ zIndex: 1 }}>
        {visibleMsgs.length === 0 && !chatSending ? (
          <div className="text-center py-10 text-muted italic">
            Send a message to start chatting.
          </div>
        ) : (
          <div className="w-full px-0">
            {visibleMsgs.map((msg, i) => {
              const prev = i > 0 ? visibleMsgs[i - 1] : null;
              const grouped = prev?.role === msg.role;
              const isUser = msg.role === "user";

              return (
                <div
                  key={msg.id}
                  className={`flex items-start gap-2 ${isUser ? "justify-end" : "justify-start"} ${grouped ? "mt-1" : "mt-3"}`}
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
                  <div
                    className="max-w-[85%] px-0 py-1 text-sm leading-relaxed whitespace-pre-wrap break-words"
                  >
                    {!grouped && (
                      <div className="font-bold text-[12px] mb-1 text-accent">
                        {isUser ? "You" : agentName}
                        {!isUser &&
                          typeof msg.source === "string" &&
                          msg.source &&
                          msg.source !== "client_chat" && (
                            <span className="ml-1.5 text-[10px] font-normal text-muted">
                              via {msg.source}
                            </span>
                          )}
                      </div>
                    )}
                    <div><MessageContent message={msg} /></div>
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
                <div className="max-w-[85%] px-0 py-1 text-sm leading-relaxed">
                  <div className="font-bold text-[12px] mb-1 text-accent">{agentName}</div>
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
        <div className="text-xs text-ok py-1 relative" style={{ zIndex: 1 }}>{shareIngestNotice}</div>
      )}

      {/* Dropped files */}
      {droppedFiles.length > 0 && (
        <div className="text-xs text-muted py-0.5 flex gap-2 relative" style={{ zIndex: 1 }}>
          {droppedFiles.map((f, i) => (
            <span key={i}>{f}</span>
          ))}
        </div>
      )}

      {/* ── Avatar / voice toggles ────────────────────────────────── */}
      <div
        className="flex items-center justify-between gap-2 pb-1.5 relative"
        style={{ zIndex: 1 }}
      >
        <div className="flex items-center gap-1">
          <button
            className={`px-2 py-1 text-xs border rounded cursor-pointer transition-all ${
              chatMode === "simple"
                ? "border-accent bg-accent text-accent-fg"
                : "border-border text-muted bg-card hover:border-accent hover:text-accent text-accent-fg"
            }`}
            onClick={() => setChatMode("simple")}
            title="Simple mode: reply only, no tools"
            disabled={chatSending}
          >
            Conversational (Fast)
          </button>
          <button
            className={`px-2 py-1 text-xs border rounded cursor-pointer transition-all ${
              chatMode === "power"
                ? "border-accent bg-accent text-accent-fg"
                : "border-border text-muted bg-card hover:border-accent hover:text-accent text-accent-fg"
            }`}
            onClick={() => setChatMode("power")}
            title="Power mode: tools/actions allowed"
            disabled={chatSending}
          >
            Powerful (Slow)
          </button>
        </div>
        <div className="flex gap-1.5">
          {/* Custom Actions panel toggle */}
          <button
            className="w-7 h-7 flex items-center justify-center border rounded cursor-pointer transition-all bg-card border-border text-muted hover:border-accent hover:text-accent"
            onClick={() => window.dispatchEvent(new Event("toggle-custom-actions-panel"))}
            title="Custom Actions"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </button>

          {/* Show / hide avatar */}
          <button
            className={`w-7 h-7 flex items-center justify-center border rounded cursor-pointer transition-all bg-card ${
              avatarVisible
                ? "border-accent text-accent"
                : "border-border text-muted hover:border-accent hover:text-accent"
            }`}
            onClick={() => { setAvatarVisible((v) => !v); setTimeout(() => window.dispatchEvent(new Event("milaidy:avatar-toggle")), 0); }}
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
              setAgentVoiceMuted(muting);
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
      </div>

      {/* ── Input row: mic + textarea + send ───────────────────────── */}
      <div className="flex gap-2 items-end border-t border-border pt-3 pb-4 relative" style={{ zIndex: 1 }}>
        {/* Mic button — user voice input */}
        {voice.supported && (
          <button
            className={`h-[38px] w-[38px] flex-shrink-0 flex items-center justify-center border rounded cursor-pointer transition-all self-end ${
              voice.isListening
                ? "bg-accent border-accent text-accent-fg shadow-[0_0_10px_rgba(124,58,237,0.4)] animate-pulse"
                : "border-border bg-card text-muted hover:border-accent hover:text-accent"
            }`}
            onClick={voice.toggleListening}
            title={voice.isListening ? "Stop listening" : "Voice input"}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill={voice.isListening ? "currentColor" : "none"} stroke="currentColor" strokeWidth={voice.isListening ? "0" : "2"}>
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
          <div className="flex-1 px-3 py-2 border border-accent bg-card text-txt text-sm font-body leading-relaxed min-h-[38px] flex items-center">
            <span className="text-muted italic">{voice.interimTranscript}</span>
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            className="flex-1 px-3 py-2 border border-border bg-card text-txt text-sm font-body leading-relaxed resize-none overflow-y-hidden min-h-[38px] max-h-[200px] focus:border-accent focus:outline-none"
            rows={1}
            placeholder={voice.isListening ? "Listening..." : "Type a message..."}
            value={chatInput}
            onChange={(e) => setState("chatInput", e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={chatSending}
          />
        )}

        {/* Send / Stop */}
        {chatSending ? (
          <button
            className="h-[38px] px-4 py-2 border border-danger bg-danger/10 text-danger text-sm cursor-pointer hover:bg-danger/20 self-end"
            onClick={handleChatStop}
            title="Stop generation"
          >
            Stop
          </button>
        ) : voice.isSpeaking ? (
          <button
            className="h-[38px] px-4 py-2 border border-danger bg-danger/10 text-danger text-sm cursor-pointer hover:bg-danger/20 self-end"
            onClick={voice.stopSpeaking}
            title="Stop speaking"
          >
            Stop Voice
          </button>
        ) : (
          <button
            className="h-[38px] px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed self-end"
            onClick={() => void handleChatSend(chatMode)}
            disabled={chatSending}
          >
            Send
          </button>
        )}
      </div>
    </div>
  );
}
