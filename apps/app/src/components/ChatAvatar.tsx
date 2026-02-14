/**
 * Chat avatar overlay component.
 *
 * Renders a 3D VRM avatar on the right side of the chat area.
 * The avatar sits behind the chat text (lower z-index) and does not scroll.
 *
 * Voice controls are managed externally — this component accepts mouthOpen
 * and renders the VRM viewer.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { VrmViewer } from "./avatar/VrmViewer";
import type { VrmEngine } from "./avatar/VrmEngine";
import { useApp, getVrmUrl } from "../AppContext";
import { client } from "../api-client";

export interface ChatAvatarProps {
  /** Mouth openness value (0-1) for lip sync animation */
  mouthOpen?: number;
  /** Whether the agent is currently speaking (drives engine-side mouth anim) */
  isSpeaking?: boolean;
}

export function ChatAvatar({ mouthOpen = 0, isSpeaking = false }: ChatAvatarProps) {
  const { selectedVrmIndex, customVrmUrl } = useApp();

  // Resolve VRM path from selected index or custom upload
  const vrmPath = selectedVrmIndex === 0 && customVrmUrl
    ? customVrmUrl
    : getVrmUrl(selectedVrmIndex || 1);

  const vrmEngineRef = useRef<VrmEngine | null>(null);
  const [avatarReady, setAvatarReady] = useState(false);

  const handleEngineReady = useCallback((engine: VrmEngine) => {
    vrmEngineRef.current = engine;
    setAvatarReady(true);
  }, []);

  // Subscribe to WebSocket emote events and trigger avatar animations.
  useEffect(() => {
    if (!avatarReady) return;
    return client.onWsEvent("emote", (data) => {
      const engine = vrmEngineRef.current;
      if (!engine) return;
      void engine.playEmote(
        data.glbPath as string,
        data.duration as number,
        data.loop as boolean,
      );
    });
  }, [avatarReady]);

  // Listen for stop-emote events from the EmotePicker control panel.
  useEffect(() => {
    if (!avatarReady) return;
    const handler = () => vrmEngineRef.current?.stopEmote();
    document.addEventListener("milaidy:stop-emote", handler);
    return () => document.removeEventListener("milaidy:stop-emote", handler);
  }, [avatarReady]);

  return (
    <div
      className="absolute inset-0 pointer-events-none"
      style={{
        zIndex: 2,
        opacity: avatarReady ? 0.85 : 0,
        transition: "opacity 0.8s ease-in-out",
      }}
    >
      <div
        className="absolute inset-0"
        style={{
          top: "5%",
        }}
      >
        <VrmViewer
          vrmPath={vrmPath}
          mouthOpen={mouthOpen}
          isSpeaking={isSpeaking}
          onEngineReady={handleEngineReady}
        />
      </div>
    </div>
  );
}
