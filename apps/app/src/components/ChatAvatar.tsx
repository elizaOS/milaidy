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
import type { VrmEngine, VrmEngineState } from "./avatar/VrmEngine";
import { useApp, getVrmPreviewUrl, getVrmUrl } from "../AppContext";
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
  const fallbackPreviewUrl = selectedVrmIndex > 0
    ? getVrmPreviewUrl(selectedVrmIndex)
    : getVrmPreviewUrl(1);

  const vrmEngineRef = useRef<VrmEngine | null>(null);
  const [engineReady, setEngineReady] = useState(false);
  const [vrmLoaded, setVrmLoaded] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  const avatarVisible = engineReady && (vrmLoaded || showFallback);

  const handleEngineReady = useCallback((engine: VrmEngine) => {
    vrmEngineRef.current = engine;
    setEngineReady(true);
  }, []);

  const handleEngineState = useCallback((state: VrmEngineState) => {
    if (state.vrmLoaded) {
      setVrmLoaded(true);
      setShowFallback(false);
    }
  }, []);

  // If a VRM fails to load, show the selected static preview in the sidebar.
  useEffect(() => {
    setVrmLoaded(false);
    setShowFallback(false);
    const timer = window.setTimeout(() => {
      setShowFallback(true);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [vrmPath]);

  // Subscribe to WebSocket emote events and trigger avatar animations.
  useEffect(() => {
    if (!engineReady) return;
    return client.onWsEvent("emote", (data) => {
      const engine = vrmEngineRef.current;
      if (!engine) return;
      void engine.playEmote(
        data.glbPath as string,
        data.duration as number,
        data.loop as boolean,
      );
    });
  }, [engineReady]);

  // Listen for stop-emote events from the EmotePicker control panel.
  useEffect(() => {
    if (!engineReady) return;
    const handler = () => vrmEngineRef.current?.stopEmote();
    document.addEventListener("milaidy:stop-emote", handler);
    return () => document.removeEventListener("milaidy:stop-emote", handler);
  }, [engineReady]);

  return (
    <div
      className="absolute pointer-events-none"
      style={{
        inset: 0,
        zIndex: 2,
        opacity: avatarVisible ? 0.92 : 0,
        transition: "opacity 0.8s ease-in-out",
        background: "linear-gradient(to left, rgba(0, 0, 0, 0.08), transparent 55%)",
      }}
    >
      {/* Right sidebar avatar panel */}
      <div
        className="absolute bottom-0"
        style={{
          width: "min(42vw, 540px)",
          right: 0,
          top: "6%",
          opacity: avatarVisible ? 0.95 : 0,
          transition: "opacity 0.8s ease-in-out",
        }}
      >
        <div className="relative w-full h-full">
          <div
            className="w-full h-full"
            style={{
              opacity: vrmLoaded ? 1 : 0,
              transition: "opacity 0.45s ease",
            }}
          >
            <VrmViewer
              vrmPath={vrmPath}
              mouthOpen={mouthOpen}
              isSpeaking={isSpeaking}
              onEngineReady={handleEngineReady}
              onEngineState={handleEngineState}
            />
          </div>

          {showFallback && !vrmLoaded && (
            <img
              src={fallbackPreviewUrl}
              alt="avatar preview"
              className="absolute right-[14%] bottom-[8%] h-[70%] object-contain opacity-90"
            />
          )}
        </div>
      </div>
    </div>
  );
}
