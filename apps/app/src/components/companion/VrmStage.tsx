import { client } from "@milady/app-core/api";
import {
  CHAT_AVATAR_VOICE_EVENT,
  STOP_EMOTE_EVENT,
} from "@milady/app-core/events";
import { useRenderGuard } from "@milady/app-core/hooks";
import { resolveAppAssetUrl } from "@milady/app-core/utils";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { AvatarLoader } from "../avatar/AvatarLoader";
import type {
  CameraProfile,
  VrmEngine,
  VrmEngineState,
} from "../avatar/VrmEngine";
import { VrmViewer } from "../avatar/VrmViewer";
import type { TranslatorFn } from "./walletUtils";

export const VrmStage = memo(function VrmStage({
  active = true,
  vrmPath,
  worldUrl,
  fallbackPreviewUrl,
  cameraProfile = "companion",
  onEngineReady,
  t,
}: {
  active?: boolean;
  vrmPath: string;
  worldUrl?: string;
  fallbackPreviewUrl: string;
  cameraProfile?: CameraProfile;
  onEngineReady?: (engine: VrmEngine) => void;
  t: TranslatorFn;
}) {
  useRenderGuard("VrmStage");
  const [vrmLoaded, setVrmLoaded] = useState(false);
  const [showVrmFallback, setShowVrmFallback] = useState(false);
  const [chatAvatarVoice, setChatAvatarVoice] = useState({
    mouthOpen: 0,
    isSpeaking: false,
  });
  const vrmEngineRef = useRef<VrmEngine | null>(null);
  const fallbackVrmPathRef = useRef(vrmPath);

  const handleVrmEngineReady = useCallback(
    (engine: VrmEngine) => {
      vrmEngineRef.current = engine;
      engine.setPaused(!active);
      engine.setCameraAnimation({
        enabled: true,
        swayAmplitude: cameraProfile === "companion_close" ? 0.028 : 0.04,
        bobAmplitude: cameraProfile === "companion_close" ? 0.016 : 0.022,
        rotationAmplitude: cameraProfile === "companion_close" ? 0.008 : 0.012,
        speed: cameraProfile === "companion_close" ? 0.48 : 0.42,
      });
      engine.setPointerParallaxEnabled(false);
      onEngineReady?.(engine);
    },
    [active, cameraProfile, onEngineReady],
  );

  const handleVrmEngineState = useCallback((state: VrmEngineState) => {
    if (state.vrmLoaded) {
      setVrmLoaded(true);
      setShowVrmFallback(false);
      return;
    }
    if (state.loadError) {
      setVrmLoaded(false);
      setShowVrmFallback(true);
    }
  }, []);

  useEffect(() => {
    fallbackVrmPathRef.current = vrmPath;
    setVrmLoaded(false);
    setShowVrmFallback(false);
    const timer = window.setTimeout(() => {
      if (fallbackVrmPathRef.current === vrmPath) {
        setShowVrmFallback(true);
      }
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [vrmPath]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          mouthOpen?: number;
          isSpeaking?: boolean;
        }>
      ).detail;
      setChatAvatarVoice({
        mouthOpen: typeof detail?.mouthOpen === "number" ? detail.mouthOpen : 0,
        isSpeaking: detail?.isSpeaking === true,
      });
    };
    window.addEventListener(CHAT_AVATAR_VOICE_EVENT, handler);
    return () => window.removeEventListener(CHAT_AVATAR_VOICE_EVENT, handler);
  }, []);

  // Subscribe to WebSocket emote events so the companion avatar plays emotes
  // triggered from the EmotePicker or agent actions.
  useEffect(() => {
    vrmEngineRef.current?.setPaused(!active);
  }, [active]);

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
    <div className="fixed inset-0 z-0">
      <div
        className="absolute inset-0"
        style={{
          opacity: 1,
          transition: "opacity 400ms ease",
        }}
      >
        <VrmViewer
          active={active}
          vrmPath={vrmPath}
          worldUrl={worldUrl}
          mouthOpen={chatAvatarVoice.mouthOpen}
          isSpeaking={chatAvatarVoice.isSpeaking}
          cameraProfile={cameraProfile}
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
    </div>
  );
});
