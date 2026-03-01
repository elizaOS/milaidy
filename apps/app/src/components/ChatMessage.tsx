/**
 * Enhanced chat message component with actions and better UX.
 */

import { Check, Copy, RefreshCw, Trash2 } from "lucide-react";
import { useCallback, useState } from "react";
import type { ConversationMessage } from "../api-client";
import { MessageContent } from "./MessageContent";

interface ChatMessageProps {
  message: ConversationMessage;
  isGrouped?: boolean;
  agentName?: string;
  agentAvatarSrc?: string | null;
  onCopy?: (text: string) => void;
  onRetry?: (messageId: string) => void;
  onDelete?: (messageId: string) => void;
}

function formatTime(timestamp?: number): string {
  if (!timestamp) return "";
  try {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function ChatMessage({
  message,
  isGrouped = false,
  agentName = "Agent",
  agentAvatarSrc,
  onCopy,
  onRetry,
  onDelete,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);
  const [showActions, setShowActions] = useState(false);
  const isUser = message.role === "user";
  const agentInitial = agentName.trim().charAt(0).toUpperCase() || "A";
  const timestamp = formatTime(message.timestamp);

  const handleCopy = useCallback(() => {
    if (onCopy) {
      onCopy(message.text);
    } else {
      navigator.clipboard.writeText(message.text);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [message.text, onCopy]);

  return (
    <article
      className={`flex items-start gap-2 sm:gap-3 ${isUser ? "justify-end" : "justify-start"} ${isGrouped ? "mt-1" : "mt-4"}`}
      data-testid="chat-message"
      data-role={message.role}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
      aria-label={`${isUser ? "Your" : agentName} message`}
    >
      {/* Avatar (AI only) */}
      {!isUser &&
        (isGrouped ? (
          <div className="w-8 h-8 shrink-0" aria-hidden />
        ) : (
          <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden border border-border bg-bg-hover shadow-sm">
            {agentAvatarSrc ? (
              <img
                src={agentAvatarSrc}
                alt={`${agentName} avatar`}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-accent bg-accent-subtle">
                {agentInitial}
              </div>
            )}
          </div>
        ))}

      {/* Message Bubble */}
      <div
        className={`max-w-[88%] sm:max-w-[80%] min-w-0 ${isUser ? "mr-1" : ""}`}
      >
        {/* Sender Name */}
        {!isGrouped && (
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[12px] font-semibold ${isUser ? "text-muted-strong" : "text-accent"}`}
            >
              {isUser ? "You" : agentName}
            </span>
            {timestamp && (
              <span className="text-[10px] text-muted">{timestamp}</span>
            )}
            {!isUser &&
              typeof message.source === "string" &&
              message.source &&
              message.source !== "client_chat" && (
                <span className="text-[10px] text-muted opacity-60">
                  via {message.source}
                </span>
              )}
          </div>
        )}

        {/* Message Content */}
        <div
          className={`relative group px-4 py-2.5 text-sm leading-relaxed whitespace-pre-wrap break-words rounded-2xl ${
            isUser
              ? "bg-accent text-accent-fg rounded-br-md"
              : "bg-bg-accent border border-border text-txt rounded-bl-md"
          }`}
        >
          <MessageContent message={message} />

          {/* Message Actions (on hover) */}
          <div
            className={`absolute ${isUser ? "left-0 -translate-x-full" : "right-0 translate-x-full"} top-0 flex items-center gap-1 p-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200 ${showActions ? "opacity-100" : ""}`}
          >
            <button
              type="button"
              onClick={handleCopy}
              className="p-1.5 rounded-md text-muted hover:text-txt hover:bg-bg-hover transition-colors"
              title={copied ? "Copied!" : "Copy message"}
              aria-label={copied ? "Copied to clipboard" : "Copy message"}
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-ok" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>

            {!isUser && onRetry && (
              <button
                type="button"
                onClick={() => onRetry(message.id)}
                className="p-1.5 rounded-md text-muted hover:text-accent hover:bg-bg-hover transition-colors"
                title="Retry message"
                aria-label="Retry message"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            )}

            {onDelete && (
              <button
                type="button"
                onClick={() => onDelete(message.id)}
                className="p-1.5 rounded-md text-muted hover:text-danger hover:bg-danger/10 transition-colors"
                title="Delete message"
                aria-label="Delete message"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

/* ── Typing Indicator ────────────────────────────────────────────────── */

export function TypingIndicator({
  agentName,
  agentAvatarSrc,
}: {
  agentName: string;
  agentAvatarSrc?: string | null;
}) {
  const agentInitial = agentName.trim().charAt(0).toUpperCase() || "A";

  return (
    <div className="flex items-start gap-2 sm:gap-3 mt-4">
      <div className="w-8 h-8 shrink-0 rounded-full overflow-hidden border border-border bg-bg-hover shadow-sm">
        {agentAvatarSrc ? (
          <img
            src={agentAvatarSrc}
            alt={`${agentName} avatar`}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-[11px] font-bold text-accent bg-accent-subtle">
            {agentInitial}
          </div>
        )}
      </div>

      <div className="max-w-[88%] sm:max-w-[80%] min-w-0">
        <div className="text-[12px] font-semibold text-accent mb-1">
          {agentName}
        </div>
        <div className="px-4 py-3 bg-bg-accent border border-border rounded-2xl rounded-bl-md">
          <div className="flex gap-1">
            <span
              className="w-2 h-2 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]"
              style={{ animationDelay: "0ms" }}
            />
            <span
              className="w-2 h-2 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]"
              style={{ animationDelay: "200ms" }}
            />
            <span
              className="w-2 h-2 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]"
              style={{ animationDelay: "400ms" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Empty State ─────────────────────────────────────────────────────── */

export function ChatEmptyState({ agentName }: { agentName: string }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center text-center p-6">
      <div className="w-16 h-16 rounded-2xl bg-accent-subtle flex items-center justify-center mb-4">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-accent"
          aria-label="Chat icon"
        >
          <title>Chat</title>
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-txt-strong mb-2">
        Start a conversation
      </h3>
      <p className="text-sm text-muted max-w-sm mb-6">
        Send a message to {agentName} to begin chatting. You can also drag and
        drop images or use voice input.
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        {["Hello!", "How are you?", "Tell me a joke", "Help me with..."].map(
          (suggestion) => (
            <button
              key={suggestion}
              type="button"
              className="px-3 py-1.5 text-sm border border-border bg-bg rounded-full text-muted hover:border-accent hover:text-accent transition-colors"
            >
              {suggestion}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
