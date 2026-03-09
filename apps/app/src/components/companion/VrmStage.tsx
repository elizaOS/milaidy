import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "../../api-client";
import { resolveAppAssetUrl } from "../../asset-url";
import { STOP_EMOTE_EVENT } from "../../events";
import type { VrmEngine, VrmEngineState } from "../avatar/VrmEngine";
import { VrmViewer } from "../avatar/VrmViewer";
import { BubbleEmote } from "../BubbleEmote";
import type { TranslatorFn } from "./walletUtils";

export function VrmStage({
  vrmPath,
  fallbackPreviewUrl,
  needsFlip,
  chatDockOpen,
  t,
}: {
  vrmPath: string;
  fallbackPreviewUrl: string;
  needsFlip: boolean;
  chatDockOpen: boolean;
  t: TranslatorFn;
}) {
  const [vrmLoaded, setVrmLoaded] = useState(false);
  const [showVrmFallback, setShowVrmFallback] = useState(false);
  const vrmEngineRef = useRef<VrmEngine | null>(null);

  const handleVrmEngineReady = useCallback((engine: VrmEngine) => {
    vrmEngineRef.current = engine;
  }, []);

  const handleVrmEngineState = useCallback((state: VrmEngineState) => {
    if (!state.vrmLoaded) return;
    setVrmLoaded(true);
    setShowVrmFallback(false);
  }, []);

  useEffect(() => {
    setVrmLoaded(false);
    setShowVrmFallback(false);
    const timer = window.setTimeout(() => {
      setShowVrmFallback(true);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, []);

  // Subscribe to WebSocket emote events so the companion avatar plays emotes
  // triggered from the EmotePicker or agent actions.
  useEffect(() => {
    if (!vrmLoaded) return;
    return client.onWsEvent("emote", (data) => {
      const engine = vrmEngineRef.current;
      if (!engine) return;
      const rawPath = (data.path ?? data.glbPath) as string;
      const resolvedPath = resolveAppAssetUrl(rawPath);
      const duration =
        typeof data.duration === "number" && Number.isFinite(data.duration)
          ? data.duration
          : 3;
      const isLoop = data.loop === true;
      void engine.playEmote(resolvedPath, duration, isLoop);
    });
  }, [vrmLoaded]);

  // Listen for stop-emote events from the EmotePicker "Stop" button.
  useEffect(() => {
    if (!vrmLoaded) return;
    const handler = () => {
      vrmEngineRef.current?.stopEmote();
    };
    document.addEventListener(STOP_EMOTE_EVENT, handler);
    return () => document.removeEventListener(STOP_EMOTE_EVENT, handler);
  }, [vrmLoaded]);

  return (
    <div
      className={`anime-comp-model-layer ${chatDockOpen ? "chat-shifted" : ""}`}
    >
      <div
        className="absolute inset-0"
        style={{
          opacity: vrmLoaded ? 1 : 0,
          transition: "opacity 400ms ease",
        }}
      >
        <VrmViewer
          vrmPath={vrmPath}
          mouthOpen={0}
          isSpeaking={false}
          interactive
          cameraProfile="companion"
          interactiveMode="orbitZoom"
          forceFaceCameraFlip={needsFlip}
          onEngineReady={handleVrmEngineReady}
          onEngineState={handleVrmEngineState}
        />
      </div>
      {showVrmFallback && !vrmLoaded && (
        <img
          src={fallbackPreviewUrl}
          alt={t("companion.avatarPreviewAlt")}
          className="anime-vrm-fallback"
        />
      )}
      <div className="anime-comp-bubble-wrap">
        <BubbleEmote
          moodTier="neutral"
          activeAction={null}
          visible={vrmLoaded}
        />
      </div>
    </div>
  );
}
