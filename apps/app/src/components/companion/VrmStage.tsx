import { useCallback, useEffect, useRef, useState } from "react";
import { client } from "../../api-client";
import { resolveAppAssetUrl } from "../../asset-url";
import { STOP_EMOTE_EVENT } from "../../events";
import { AvatarLoader } from "../avatar/AvatarLoader";
import type { CameraProfile, VrmEngine, VrmEngineState } from "../avatar/VrmEngine";
import { VrmViewer } from "../avatar/VrmViewer";
import { BubbleEmote } from "../BubbleEmote";
import type { TranslatorFn } from "./walletUtils";

export function VrmStage({
  vrmPath,
  fallbackPreviewUrl,
  needsFlip,
  cameraProfile = "companion",
  t,
}: {
  vrmPath: string;
  fallbackPreviewUrl: string;
  needsFlip: boolean;
  cameraProfile?: CameraProfile;
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
    <div className="absolute inset-0">
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
          cameraProfile={cameraProfile}
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
          className="absolute left-1/2 top-[52%] -translate-x-1/2 -translate-y-1/2 h-[90%] object-contain opacity-70"
        />
      )}
      {!vrmLoaded && !showVrmFallback && <AvatarLoader />}
      <div className="absolute top-[15%] left-1/2 -translate-x-1/2 z-[5] pointer-events-none">
        <BubbleEmote
          moodTier="neutral"
          activeAction={null}
          visible={vrmLoaded}
        />
      </div>
    </div>
  );
}
