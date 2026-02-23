/**
 * Chat avatar panel component.
 *
 * Renders a 3D VRM avatar within the parent container (used in the
 * Autonomous Loop sidebar). Voice controls are managed externally.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { VrmViewer } from "./avatar/VrmViewer";
import type { VrmEngine, VrmEngineState } from "./avatar/VrmEngine";
import { useApp, getVrmPreviewUrl, getVrmUrl, getVrmNeedsFlip } from "../AppContext";
import { client } from "../api-client";
import { resolveCompanionAnimationIntent } from "./avatar/companionAnimationIntent";

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
  const needsFlip = selectedVrmIndex > 0 && getVrmNeedsFlip(selectedVrmIndex);

  const vrmEngineRef = useRef<VrmEngine | null>(null);
  const currentAmbientIntentIdRef = useRef<string | null>(null);
  const ambientBlockedUntilMsRef = useRef(0);
  const ambientLoopOverrideActiveRef = useRef(false);
  const [engineReady, setEngineReady] = useState(false);
  const [vrmLoaded, setVrmLoaded] = useState(false);
  const [showFallback, setShowFallback] = useState(false);

  const ambientIntent = useMemo(
    () => resolveCompanionAnimationIntent({ moodTier: "neutral" }),
    [],
  );

  const applyAmbientIntent = useCallback(() => {
    const engine = vrmEngineRef.current;
    if (!engine || !ambientIntent) return;
    if (ambientLoopOverrideActiveRef.current) return;
    if (Date.now() < ambientBlockedUntilMsRef.current) return;
    if (currentAmbientIntentIdRef.current === ambientIntent.id) return;

    currentAmbientIntentIdRef.current = ambientIntent.id;
    void engine.playEmote(
      ambientIntent.url,
      ambientIntent.durationSec,
      ambientIntent.loop,
    );
  }, [ambientIntent]);

  const avatarVisible = engineReady || vrmLoaded || showFallback;

  const handleEngineReady = useCallback((engine: VrmEngine) => {
    vrmEngineRef.current = engine;
    setEngineReady(true);
  }, []);

  const handleEngineState = useCallback((state: VrmEngineState) => {
    if (state.vrmLoaded) {
      setVrmLoaded(true);
      setShowFallback(false);
      applyAmbientIntent();
    }
  }, [applyAmbientIntent]);

  // If a VRM fails to load, show the selected static preview in the sidebar.
  useEffect(() => {
    setVrmLoaded(false);
    setShowFallback(false);
    currentAmbientIntentIdRef.current = null;
    ambientBlockedUntilMsRef.current = 0;
    ambientLoopOverrideActiveRef.current = false;
    const timer = window.setTimeout(() => {
      setShowFallback(true);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [vrmPath]);

  useEffect(() => {
    if (!engineReady) return;
    applyAmbientIntent();
  }, [engineReady, applyAmbientIntent]);

  // Subscribe to WebSocket emote events and trigger avatar animations.
  useEffect(() => {
    if (!engineReady) return;
    return client.onWsEvent("emote", (data) => {
      const engine = vrmEngineRef.current;
      if (!engine) return;
      const duration =
        typeof data.duration === "number" && Number.isFinite(data.duration)
          ? data.duration
          : 3;
      const isLoop = data.loop === true;

      currentAmbientIntentIdRef.current = null;
      if (isLoop) {
        ambientLoopOverrideActiveRef.current = true;
      } else {
        ambientBlockedUntilMsRef.current =
          Date.now() + Math.max(1800, Math.round(duration * 1000) + 700);
      }

      void engine.playEmote(
        data.glbPath as string,
        duration,
        isLoop,
      );
    });
  }, [engineReady]);

  // Listen for stop-emote events from the EmotePicker control panel.
  useEffect(() => {
    if (!engineReady) return;
    const handler = () => {
      const engine = vrmEngineRef.current;
      if (!engine) return;
      ambientLoopOverrideActiveRef.current = false;
      ambientBlockedUntilMsRef.current = 0;
      currentAmbientIntentIdRef.current = null;
      engine.stopEmote();
      window.setTimeout(() => {
        applyAmbientIntent();
      }, 80);
    };
    document.addEventListener("milady:stop-emote", handler);
    return () => document.removeEventListener("milady:stop-emote", handler);
  }, [engineReady, applyAmbientIntent]);

  return (
    <div className="relative h-full w-full">
      <div
        className="absolute inset-0"
        style={{
          opacity: avatarVisible ? 0.95 : 0,
          transition: "opacity 0.45s ease-in-out",
          background: "radial-gradient(circle at 50% 100%, rgba(255,255,255,0.08), transparent 60%)",
        }}
      >
        <div className="absolute inset-0 overflow-hidden">
          <div
            className="absolute inset-0"
            style={{
              opacity: vrmLoaded ? 1 : 0,
              transition: "opacity 0.45s ease",
              // Keep a stable full-body framing in the narrow chat sidebar.
              transform: "scale(1.02) translateY(1%)",
              transformOrigin: "50% 42%",
            }}
          >
            <VrmViewer
              vrmPath={vrmPath}
              mouthOpen={mouthOpen}
              isSpeaking={isSpeaking}
              interactive
              interactiveMode="orbitZoom"
              forceFaceCameraFlip={needsFlip}
              onEngineReady={handleEngineReady}
              onEngineState={handleEngineState}
            />
          </div>

          {showFallback && !vrmLoaded && (
            <img
              src={fallbackPreviewUrl}
              alt="avatar preview"
              className="absolute left-1/2 -translate-x-1/2 bottom-[-2%] h-[122%] object-contain opacity-90"
            />
          )}
        </div>
      </div>
    </div>
  );
}
