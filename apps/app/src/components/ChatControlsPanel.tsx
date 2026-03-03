import { useState } from "react";
import type { AppState } from "../AppContext";
import { ChatAvatar } from "./ChatAvatar";

interface ChatControlsPanelProps {
  mobile: boolean;
  chatAvatarVisible: boolean;
  chatAvatarSpeaking: boolean;
  chatAgentVoiceMuted: boolean;
  setState: <K extends keyof AppState>(key: K, value: AppState[K]) => void;
}

export function ChatControlsPanel({
  mobile,
  chatAvatarVisible,
  chatAvatarSpeaking,
  chatAgentVoiceMuted,
  setState,
}: ChatControlsPanelProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="border-t border-border">
      <button
        type="button"
        className="flex justify-between items-center px-3 py-2 cursor-pointer hover:bg-bg-hover text-xs font-semibold uppercase tracking-wide text-muted w-full"
        onClick={() => setCollapsed(!collapsed)}
      >
        <span>Chat Controls</span>
        <span>{collapsed ? "\u25B6" : "\u25BC"}</span>
      </button>
      {!collapsed && (
        <div className="px-3 pb-2">
          <div
            className={`${mobile ? "h-[300px]" : "h-[260px] xl:h-[320px] 2xl:h-[420px]"} border border-border bg-bg-hover/20 rounded overflow-hidden relative`}
          >
            {chatAvatarVisible ? (
              <ChatAvatar isSpeaking={chatAvatarSpeaking} />
            ) : (
              <div className="h-full w-full flex items-end justify-center pb-5 text-xs text-muted">
                Avatar hidden
              </div>
            )}
          </div>

          <div className="pt-2 flex flex-col gap-2">
            <div className="text-[10px] leading-relaxed text-muted">
              Channel profile is selected automatically from message channel
              type. Voice messages always use fast compact mode for lower
              latency.
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                className={`h-8 flex items-center justify-center border rounded cursor-pointer transition-all bg-card ${
                  chatAvatarVisible
                    ? "border-accent text-accent"
                    : "border-border text-muted hover:border-accent hover:text-accent"
                }`}
                onClick={() =>
                  setState("chatAvatarVisible", !chatAvatarVisible)
                }
                title={chatAvatarVisible ? "Hide avatar" : "Show avatar"}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <title>Avatar visibility</title>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                  {!chatAvatarVisible && <line x1="3" y1="3" x2="21" y2="21" />}
                </svg>
              </button>

              <button
                type="button"
                className={`h-8 flex items-center justify-center border rounded cursor-pointer transition-all bg-card ${
                  chatAgentVoiceMuted
                    ? "border-border text-muted hover:border-accent hover:text-accent"
                    : "border-accent text-accent"
                }`}
                onClick={() =>
                  setState("chatAgentVoiceMuted", !chatAgentVoiceMuted)
                }
                title={
                  chatAgentVoiceMuted
                    ? "Unmute agent voice"
                    : "Mute agent voice"
                }
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <title>Agent voice</title>
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                  {chatAgentVoiceMuted ? (
                    <line x1="23" y1="9" x2="17" y2="15" />
                  ) : (
                    <>
                      <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    </>
                  )}
                  {chatAgentVoiceMuted && (
                    <line x1="17" y1="9" x2="23" y2="15" />
                  )}
                </svg>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
