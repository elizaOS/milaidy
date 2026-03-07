/**
 * FloatingChatInput — liquid-glass chat bar shown in full-page views when
 * the nav is collapsed. Shares AppContext's chatInput / handleChatSend state.
 */

import { Mic, Send } from "lucide-react";
import { useCallback, useRef } from "react";
import { useApp } from "../AppContext";
import { useVoiceChat } from "../hooks/useVoiceChat";

export function FloatingChatInput() {
  const { chatInput, chatSending, handleChatSend, setState, setTab } = useApp();
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const voice = useVoiceChat({
    onTranscript: useCallback(
      (text: string) => {
        setState("chatInput", text);
        setTimeout(() => void handleChatSend("DM"), 50);
      },
      [setState, handleChatSend],
    ),
  });

  const handleSend = useCallback(() => {
    if (!chatInput.trim()) return;
    // Switch to chat tab so the reply is visible, then send
    setTab("chat");
    setTimeout(() => void handleChatSend("DM"), 30);
  }, [chatInput, handleChatSend, setTab]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] w-[min(640px,90vw)]">
      {/* Liquid-glass container */}
      <div
        className="flex items-end gap-2 px-3 py-2.5 rounded-2xl border border-white/20 shadow-2xl"
        style={{
          background:
            "linear-gradient(135deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.06) 100%)",
          backdropFilter: "blur(24px) saturate(180%)",
          WebkitBackdropFilter: "blur(24px) saturate(180%)",
          boxShadow:
            "0 8px 32px rgba(0,0,0,0.28), inset 0 1px 0 rgba(255,255,255,0.18), 0 0 0 1px rgba(255,255,255,0.08)",
        }}
      >
        {/* Mic button */}
        {voice.supported && (
          <button
            type="button"
            onClick={voice.toggleListening}
            aria-label={voice.isListening ? "Stop listening" : "Voice input"}
            className={`h-9 w-9 shrink-0 flex items-center justify-center rounded-xl border transition-all duration-200 ${
              voice.isListening
                ? "border-accent/60 bg-accent/20 text-accent shadow-[0_0_10px_rgba(124,58,237,0.4)] animate-pulse"
                : "border-white/20 bg-white/10 text-white/70 hover:bg-white/20 hover:text-white"
            }`}
          >
            <Mic className="w-4 h-4" />
          </button>
        )}

        {/* Textarea */}
        {voice.isListening && voice.interimTranscript ? (
          <div className="flex-1 min-h-[36px] flex items-center px-2 text-sm text-white/60 italic">
            {voice.interimTranscript}
          </div>
        ) : (
          <textarea
            ref={textareaRef}
            rows={1}
            className="flex-1 resize-none bg-transparent border-0 outline-none text-white text-sm placeholder:text-white/40 leading-relaxed min-h-[36px] max-h-[120px] py-1.5 px-1 font-body"
            placeholder="Ask anything…"
            value={chatInput}
            onChange={(e) => setState("chatInput", e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={chatSending}
          />
        )}

        {/* Send button */}
        <button
          type="button"
          onClick={handleSend}
          disabled={chatSending || !chatInput.trim()}
          aria-label="Send"
          className="h-9 w-9 shrink-0 flex items-center justify-center rounded-xl border border-accent/60 bg-accent/20 text-accent hover:bg-accent/30 transition-all duration-200 disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
