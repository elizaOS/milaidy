import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * Chat sub-components that have no app-level context dependency.
 *
 * These complement the full `ChatMessage` component (which stays in
 * `apps/app` because it uses `useApp()` for i18n and the `MessageContent`
 * renderer). Extracted here so they can be reused by any app.
 */
import { Button } from "./button";
/* ── TypingIndicator ─────────────────────────────────────────────────── */
export function TypingIndicator({ agentName, agentAvatarSrc }) {
  const agentInitial = agentName.trim().charAt(0).toUpperCase() || "A";
  return _jsxs("div", {
    className: "flex items-start gap-2 sm:gap-3 mt-4",
    children: [
      _jsx("div", {
        className:
          "w-8 h-8 shrink-0 rounded-full overflow-hidden border border-border bg-bg-hover shadow-sm",
        children: agentAvatarSrc
          ? _jsx("img", {
              src: agentAvatarSrc,
              alt: `${agentName} avatar`,
              className: "w-full h-full object-cover",
            })
          : _jsx("div", {
              className:
                "w-full h-full flex items-center justify-center text-[11px] font-bold text-accent bg-accent-subtle",
              children: agentInitial,
            }),
      }),
      _jsxs("div", {
        className: "max-w-[88%] sm:max-w-[80%] min-w-0",
        children: [
          _jsx("div", {
            className: "text-[12px] font-semibold text-accent mb-1",
            children: agentName,
          }),
          _jsx("div", {
            className:
              "px-4 py-3 bg-bg-accent border border-border rounded-2xl rounded-bl-md",
            children: _jsxs("div", {
              className: "flex gap-1",
              children: [
                _jsx("span", {
                  className:
                    "w-2 h-2 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]",
                  style: { animationDelay: "0ms" },
                }),
                _jsx("span", {
                  className:
                    "w-2 h-2 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]",
                  style: { animationDelay: "200ms" },
                }),
                _jsx("span", {
                  className:
                    "w-2 h-2 rounded-full bg-muted-strong animate-[typing-bounce_1.2s_ease-in-out_infinite]",
                  style: { animationDelay: "400ms" },
                }),
              ],
            }),
          }),
        ],
      }),
    ],
  });
}
export function ChatEmptyState({
  agentName,
  suggestions = ["Hello!", "How are you?", "Tell me a joke", "Help me with..."],
  onSuggestionClick,
  labels = {},
}) {
  return _jsxs("div", {
    className:
      "flex-1 flex flex-col items-center justify-center text-center p-6",
    children: [
      _jsx("div", {
        className:
          "w-16 h-16 rounded-2xl bg-accent-subtle flex items-center justify-center mb-4",
        children: _jsxs("svg", {
          width: "32",
          height: "32",
          viewBox: "0 0 24 24",
          fill: "none",
          stroke: "currentColor",
          strokeWidth: "2",
          strokeLinecap: "round",
          strokeLinejoin: "round",
          className: "text-accent",
          "aria-label": labels.chatIconLabel ?? "Chat icon",
          children: [
            _jsx("title", { children: labels.chatIconLabel ?? "Chat" }),
            _jsx("path", {
              d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z",
            }),
          ],
        }),
      }),
      _jsx("h3", {
        className: "text-lg font-semibold text-txt-strong mb-2",
        children: labels.startConversation ?? "Start a Conversation",
      }),
      _jsxs("p", {
        className: "text-sm text-muted max-w-sm mb-6",
        style: { fontFamily: "var(--font-chat)" },
        children: [
          labels.sendMessageTo ?? "Send a message to",
          " ",
          agentName,
          " ",
          labels.toBeginChatting ?? "to begin chatting.",
        ],
      }),
      _jsx("div", {
        className: "flex flex-wrap justify-center gap-2",
        children: suggestions.map((suggestion) =>
          _jsx(
            Button,
            {
              variant: "outline",
              size: "sm",
              className:
                "px-3 py-1.5 h-7 text-xs rounded-full text-muted border-border bg-bg hover:border-accent hover:text-accent transition-colors",
              onClick: () => onSuggestionClick?.(suggestion),
              children: suggestion,
            },
            suggestion,
          ),
        ),
      }),
    ],
  });
}
