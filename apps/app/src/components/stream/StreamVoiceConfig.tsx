/**
 * StreamVoiceConfig — compact voice config panel for StreamView.
 *
 * Shows a toggle to enable/disable TTS on the RTMP stream, detected
 * provider + API key status, and a test button to speak sample text.
 */

import { useCallback, useEffect, useState } from "react";
import { client } from "../../api-client";

interface VoiceStatus {
  enabled: boolean;
  autoSpeak: boolean;
  provider: string | null;
  configuredProvider: string | null;
  hasApiKey: boolean;
  isSpeaking: boolean;
  isAttached: boolean;
}

export function StreamVoiceConfig({ streamLive }: { streamLive: boolean }) {
  const [status, setStatus] = useState<VoiceStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  // Poll voice status
  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      try {
        const res = await client.getStreamVoice();
        if (mounted && res.ok) {
          setStatus(res);
          setSpeaking(res.isSpeaking);
        }
      } catch {
        // API may not be available yet
      }
    };
    poll();
    const id = setInterval(poll, 5_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, []);

  const toggleEnabled = useCallback(async () => {
    if (!status || loading) return;
    setLoading(true);
    try {
      const next = !status.enabled;
      const res = await client.saveStreamVoice({ enabled: next });
      if (res.ok) {
        setStatus((prev) =>
          prev ? { ...prev, enabled: res.voice.enabled } : prev,
        );
      }
    } catch {
      // Ignore
    } finally {
      setLoading(false);
    }
  }, [status, loading]);

  const testSpeak = useCallback(async () => {
    if (speaking) return;
    setSpeaking(true);
    try {
      await client.streamVoiceSpeak("Hello, I am now speaking on the stream.");
    } catch {
      // Ignore
    } finally {
      // Poll will update speaking state
      setTimeout(() => setSpeaking(false), 3000);
    }
  }, [speaking]);

  if (!status) return null;

  const providerLabel = status.provider
    ? status.provider.charAt(0).toUpperCase() + status.provider.slice(1)
    : "None";

  return (
    <div className="flex items-center gap-2 text-xs">
      {/* Toggle */}
      <button
        type="button"
        onClick={toggleEnabled}
        disabled={loading}
        className={`flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium transition-colors ${
          status.enabled
            ? "bg-accent/20 text-accent hover:bg-accent/30"
            : "bg-surface text-muted hover:bg-surface-hover"
        }`}
        title={
          status.enabled
            ? "Voice on stream: ON (click to disable)"
            : "Voice on stream: OFF (click to enable)"
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
          aria-label={status.enabled ? "Voice enabled" : "Voice disabled"}
          role="img"
        >
          <title>{status.enabled ? "Voice enabled" : "Voice disabled"}</title>
          {status.enabled ? (
            <>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
              <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
            </>
          ) : (
            <>
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
              <line x1="23" y1="9" x2="17" y2="15" />
              <line x1="17" y1="9" x2="23" y2="15" />
            </>
          )}
        </svg>
        <span>Voice</span>
      </button>

      {/* Status indicators (when enabled) */}
      {status.enabled && (
        <>
          <span className="text-muted">
            {providerLabel}
            {!status.hasApiKey && status.provider !== "edge" && (
              <span className="text-warning ml-1" title="No API key configured">
                (no key)
              </span>
            )}
          </span>

          {speaking && (
            <span className="text-accent animate-pulse">Speaking...</span>
          )}

          {/* Test button — only when stream is live and bridge attached */}
          {streamLive && status.isAttached && (
            <button
              type="button"
              onClick={testSpeak}
              disabled={speaking}
              className="px-1.5 py-0.5 rounded bg-surface text-muted hover:bg-surface-hover hover:text-txt text-xs transition-colors"
              title="Test TTS on stream"
            >
              Test
            </button>
          )}
        </>
      )}
    </div>
  );
}
