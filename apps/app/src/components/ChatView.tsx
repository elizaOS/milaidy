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
  type ReactNode,
} from "react";
import { useApp } from "../AppContext.js";
import { ChatAvatar } from "./ChatAvatar.js";
import { useVoiceChat } from "../hooks/useVoiceChat.js";
import { client, type ConversationMode, type VoiceConfig } from "../api-client.js";
import { MessageContent } from "./MessageContent.js";

function renderInlineMarkdown(line: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const tokenRe = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRe.exec(line)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(line.slice(lastIndex, match.index));
    }

    const token = match[0];
    const key = `${match.index}-${token}`;
    if (token.startsWith("**") && token.endsWith("**")) {
      nodes.push(<strong key={key}>{token.slice(2, -2)}</strong>);
    } else if (token.startsWith("*") && token.endsWith("*")) {
      nodes.push(<em key={key}>{token.slice(1, -1)}</em>);
    } else if (token.startsWith("`") && token.endsWith("`")) {
      nodes.push(
        <code key={key} className="px-1 py-0.5 rounded bg-bg text-[0.95em] font-mono">
          {token.slice(1, -1)}
        </code>,
      );
    } else {
      nodes.push(token);
    }

    lastIndex = tokenRe.lastIndex;
  }

  if (lastIndex < line.length) {
    nodes.push(line.slice(lastIndex));
  }

  return nodes;
}

function renderMessageText(text: string): ReactNode {
  const lines = text.split(/\r?\n/);
  return lines.map((line, i) => (
    <span key={i}>
      {renderInlineMarkdown(line)}
      {i < lines.length - 1 ? <br /> : null}
    </span>
  ));
}

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
    handleStart,
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
  const agentState = agentStatus?.state ?? "not_started";
  const msgs = conversationMessages;

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

  // Agent not running: show start box
  if (agentState === "not_started" || agentState === "stopped") {
    return (
      <div className="flex flex-col flex-1 min-h-0 px-5">
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-normal text-txt-strong m-0">Chat</h2>
        </div>
        <div className="text-center py-10 px-10 border border-border mt-5">
          <p className="text-muted mb-4">Agent is not running. Start it to begin chatting.</p>
          <button
            className="px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover"
            onClick={handleStart}
          >
            Start Agent
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 px-5 relative">
      {/* 3D Avatar — behind chat on the right side */}
      {/* When using ElevenLabs audio analysis, mouthOpen carries real volume
          data — don't pass isSpeaking so the engine uses the external values
          instead of its own sine waves. */}
      {avatarVisible && (
        <ChatAvatar
          mouthOpen={voice.mouthOpen}
          isSpeaking={voice.isSpeaking && !voice.usingAudioAnalysis}
        />
      )}

      {/* ── Messages ───────────────────────────────────────────────── */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto py-2 relative" style={{ zIndex: 1 }}>
        {msgs.length === 0 && !chatSending ? (
          <div className="text-center py-10 text-muted italic">
            Send a message to start chatting.
          </div>
        ) : (
          <div className="mx-auto w-full max-w-[720px] px-1">
            {msgs.map((msg, i) => {
              const prev = i > 0 ? msgs[i - 1] : null;
              const grouped = prev?.role === msg.role;
              const isUser = msg.role === "user";
              const hoverTs = new Date(msg.timestamp).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              });

              return (
                <div
                  key={msg.id}
                  className={`group flex ${isUser ? "justify-end" : "justify-start"} ${grouped ? "mt-1" : "mt-3"}`}
                  data-testid="chat-message"
                  data-role={msg.role}
                >
                  <div
                    title={new Date(msg.timestamp).toLocaleString()}
                    className={`max-w-[85%] rounded-2xl px-3 py-2 border text-sm leading-relaxed whitespace-pre-wrap break-words ${
                      isUser
                        ? "bg-accent text-accent-fg border-accent"
                        : "bg-card text-txt border-border"
                    }`}
                  >
                    {!grouped && (
                      <div
                        className={`font-bold text-[12px] mb-1 ${isUser ? "text-accent-fg/80" : "text-accent"}`}
                      >
                        {isUser ? "You" : agentName}
                        {!isUser &&
                          typeof msg.source === "string" &&
                          msg.source &&
                          msg.source !== "client_chat" && (
                            <span className="ml-1.5 text-[10px] font-normal text-muted px-1.5 py-0.5 bg-bg-hover rounded">
                              via {msg.source}
                            </span>
                          )}
                      </div>
                    )}
                    <div><MessageContent message={msg} /></div>
                    <div className="mt-1 text-[10px] opacity-0 group-hover:opacity-70 transition-opacity">
                      {hoverTs}
                    </div>
                  </div>
                </div>
              );
            })}

            {chatSending && !chatFirstTokenReceived && (
              <div className="mt-3 flex justify-start">
                <div className="rounded-2xl px-3 py-2 border border-border bg-card">
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
          <span className="text-[11px] text-muted uppercase tracking-wide">
            Mode
          </span>
          <button
            className={`px-2 py-1 text-xs border rounded cursor-pointer transition-all ${
              chatMode === "simple"
                ? "border-accent text-accent bg-card"
                : "border-border text-muted bg-card hover:border-accent hover:text-accent"
            }`}
            onClick={() => setChatMode("simple")}
            title="Simple mode: reply only, no tools"
            disabled={chatSending}
          >
            Simple
          </button>
          <button
            className={`px-2 py-1 text-xs border rounded cursor-pointer transition-all ${
              chatMode === "power"
                ? "border-accent text-accent bg-card"
                : "border-border text-muted bg-card hover:border-accent hover:text-accent"
            }`}
            onClick={() => setChatMode("power")}
            title="Power mode: tools/actions allowed"
            disabled={chatSending}
          >
            Power
          </button>
        </div>
        <div className="flex gap-1.5">
          {/* Show / hide avatar */}
          <button
            className={`w-7 h-7 flex items-center justify-center border rounded cursor-pointer transition-all bg-card ${
              avatarVisible
                ? "border-accent text-accent"
                : "border-border text-muted hover:border-accent hover:text-accent"
            }`}
            onClick={() => setAvatarVisible((v) => !v)}
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
