/**
 * Chat view — matches the original Lit renderChat() design exactly.
 *
 * Layout: flex column filling parent. Header row (title + clear).
 * Scrollable messages area. Share/file notices below messages.
 * Input row at bottom with textarea + send button.
 */

import { useRef, useEffect } from "react";
import { useApp } from "../AppContext.js";

export function ChatView() {
  const {
    agentStatus,
    chatInput,
    chatSending,
    conversations,
    activeConversationId,
    conversationMessages,
    handleChatSend,
    handleChatClear,
    setState,
    droppedFiles,
    shareIngestNotice,
    handleStart,
  } = useApp();

  const messagesRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
        {/* Header row */}
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-lg font-normal text-txt-strong m-0">Chat</h2>
        </div>
        {/* Start agent box */}
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
    <div className="flex flex-col flex-1 min-h-0 px-5">
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-normal text-txt-strong m-0">{convTitle}</h2>
        {msgs.length > 0 && (
          <button
            className="px-3.5 py-1 border border-border bg-bg text-muted text-xs font-mono cursor-pointer hover:border-danger hover:text-danger transition-colors"
            onClick={handleChatClear}
          >
            Clear
          </button>
        )}
      </div>

      {/* Messages */}
      <div ref={messagesRef} className="flex-1 overflow-y-auto py-2">
        {msgs.length === 0 ? (
          <div className="text-center py-10 text-muted italic">
            Send a message to start chatting.
          </div>
        ) : (
          msgs.map((msg) => (
            <div key={msg.id} className="mb-4 leading-relaxed">
              <div
                className={`font-bold text-[13px] mb-0.5 ${
                  msg.role === "user"
                    ? "text-txt-strong"
                    : "text-accent"
                }`}
              >
                {msg.role === "user" ? "You" : agentName}
              </div>
              <div className="text-txt">{msg.text}</div>
            </div>
          ))
        )}

        {/* Typing indicator */}
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

      {/* Share ingest notice (below messages, before input) */}
      {shareIngestNotice && (
        <div className="text-xs text-ok py-1">{shareIngestNotice}</div>
      )}

      {/* Dropped files (below messages, before input) */}
      {droppedFiles.length > 0 && (
        <div className="text-xs text-muted py-0.5 flex gap-2">
          {droppedFiles.map((f, i) => (
            <span key={i}>{f}</span>
          ))}
        </div>
      )}

      {/* Input row */}
      <div className="flex gap-2 items-end border-t border-border pt-3 pb-4">
        <textarea
          ref={textareaRef}
          className="flex-1 px-3 py-2 border border-border bg-card text-txt text-sm font-body leading-relaxed resize-none overflow-y-hidden min-h-[38px] max-h-[200px] focus:border-accent focus:outline-none"
          rows={1}
          placeholder="Type a message..."
          value={chatInput}
          onChange={(e) => setState("chatInput", e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={chatSending}
        />
        <button
          className="h-[38px] px-6 py-2 border border-accent bg-accent text-accent-fg text-sm cursor-pointer hover:bg-accent-hover disabled:opacity-40 disabled:cursor-not-allowed self-end"
          onClick={handleChatSend}
          disabled={chatSending}
        >
          {chatSending ? "..." : "Send"}
        </button>
      </div>
    </div>
  );
}
