/**
 * Chat view component.
 *
 * Layout: flex column filling parent. Header row (title + clear + toggles).
 * Scrollable messages area. Share/file notices below messages.
 * Input row at bottom with mic + textarea + send button.
 */

import { useRef, useEffect, useCallback, useState } from "react";
import { useApp } from "../AppContext.js";
import { ChatAvatar } from "./ChatAvatar.js";
import { useVoiceChat } from "../hooks/useVoiceChat.js";

export function ChatView() {
  const {
    agentStatus,
    chatInput,
    chatSending,
    conversations,
    activeConversationId,
    conversationMessages,
    handleChatSend,
    setState,
    droppedFiles,
    shareIngestNotice,
    handleStart,
  } = useApp();

  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Toggles ───────────────────────────────────────────────────────
  const [avatarVisible, setAvatarVisible] = useState(true);
  const [agentVoiceMuted, setAgentVoiceMuted] = useState(false);

  // ── Voice chat ────────────────────────────────────────────────────
  const handleVoiceTranscript = useCallback(
    (text: string) => {
      if (chatSending) return;
      setState("chatInput", text);
      setTimeout(() => void handleChatSend(), 50);
    },
    [chatSending, setState, handleChatSend],
  );

  const voice = useVoiceChat({ onTranscript: handleVoiceTranscript });

  // Auto-speak agent responses when voice is listening AND not muted
  const lastSpokenIdRef = useRef<string | null>(null);
  const lastMsg = conversationMessages.length > 0
    ? conversationMessages[conversationMessages.length - 1]
    : null;

  if (
    lastMsg &&
    lastMsg.role === "assistant" &&
    lastMsg.id !== lastSpokenIdRef.current &&
    voice.isListening &&
    !agentVoiceMuted &&
    !chatSending
  ) {
    lastSpokenIdRef.current = lastMsg.id;
    voice.speak(lastMsg.text);
  }

  const agentName = agentStatus?.agentName ?? "Agent";
  const agentState = agentStatus?.state ?? "not_started";
  const convTitle = conversations.find((c) => c.id === activeConversationId)?.title ?? "Chat";
  const msgs = conversationMessages;

  // Scroll to bottom when messages change
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
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

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleChatSend();
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
      {avatarVisible && <ChatAvatar mouthOpen={voice.mouthOpen} />}

      {/* ── Messages ───────────────────────────────────────────────── */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto py-2 relative" style={{ zIndex: 1 }}>
        {msgs.length === 0 && !chatSending ? (
          <div className="text-center py-10 text-muted italic">
            Send a message to start chatting.
          </div>
        ) : (
          msgs.map((msg) => (
            <div
              key={msg.id}
              className="mb-4 leading-relaxed max-w-[65%]"
              data-testid="chat-message"
              data-role={msg.role}
            >
              <div
                className={`font-bold text-[13px] mb-0.5 ${
                  msg.role === "user" ? "text-txt-strong" : "text-accent"
                }`}
              >
                {msg.role === "user" ? "You" : agentName}
              </div>
              <div className="text-txt">{msg.text}</div>
            </div>
          ))
        )}

        {chatSending && (
          <div className="mb-4 leading-relaxed">
            <div className="font-bold text-[13px] mb-0.5 text-accent">{agentName}</div>
            <div className="flex gap-1 py-1">
              <span className="w-1.5 h-1.5 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite_0.2s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite_0.4s]" />
            </div>
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
      <div className="flex justify-end gap-1.5 pb-1.5 relative" style={{ zIndex: 1 }}>
        {/* Show / hide avatar */}
        <button
          className={`w-7 h-7 flex items-center justify-center border rounded cursor-pointer transition-all ${
            avatarVisible
              ? "border-accent text-accent bg-accent/10"
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
          className={`w-7 h-7 flex items-center justify-center border rounded cursor-pointer transition-all ${
            agentVoiceMuted
              ? "border-border text-muted hover:border-accent hover:text-accent"
              : "border-accent text-accent bg-accent/10"
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

        {/* Send (or Stop if agent is speaking) */}
        {voice.isSpeaking ? (
          <button
            className="h-[38px] px-4 py-2 border border-danger bg-danger/10 text-danger text-sm cursor-pointer hover:bg-danger/20 self-end"
            onClick={voice.stopSpeaking}
            title="Stop speaking"
          >
            Stop
          </button>
        ) : (
          <button
            className="h-[38px] px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed self-end"
            onClick={handleChatSend}
            disabled={chatSending}
          >
            {chatSending ? "..." : "Send"}
          </button>
        )}
      </div>
    </div>
  );
}
