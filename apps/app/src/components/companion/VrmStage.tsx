import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { client } from "../../api-client";
import { resolveAppAssetUrl } from "../../asset-url";
import {
  MOOD_ANIMATION_POOLS,
  pickRandomAnimationDef,
  resolveCompanionAnimationIntent,
} from "../avatar/companionAnimationIntent";
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
  const avatarMoodTier = "neutral";
  const [vrmLoaded, setVrmLoaded] = useState(false);
  const [showVrmFallback, setShowVrmFallback] = useState(false);
  const vrmEngineRef = useRef<VrmEngine | null>(null);
  const currentAmbientIntentIdRef = useRef<string | null>(null);
  const idleCycleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const actionAnimatingRef = useRef(false);
  const ambientBlockedUntilMsRef = useRef(0);
  const emoteLoopOverrideRef = useRef(false);
  const scheduleNextAccentRef = useRef<() => void>(() => {});

  const ambientIntent = useMemo(
    () => resolveCompanionAnimationIntent({ moodTier: avatarMoodTier }),
    [],
  );

  const applyAmbientIntent = useCallback(() => {
    const engine = vrmEngineRef.current;
    if (!engine || !ambientIntent) return;
    // Don't override a user/agent-triggered emote.
    if (emoteLoopOverrideRef.current) return;
    if (Date.now() < ambientBlockedUntilMsRef.current) return;
    if (currentAmbientIntentIdRef.current === ambientIntent.id) return;

    currentAmbientIntentIdRef.current = ambientIntent.id;
    void engine.playEmote(
      ambientIntent.url,
      ambientIntent.durationSec,
      ambientIntent.loop,
    );
  }, [ambientIntent]);

  // --- Feature A: Idle accent cycling ---
  const scheduleNextAccent = useCallback(() => {
    if (idleCycleTimerRef.current) {
      clearTimeout(idleCycleTimerRef.current);
      idleCycleTimerRef.current = null;
    }
    if (actionAnimatingRef.current) return;
    if (emoteLoopOverrideRef.current) return;
    if (Date.now() < ambientBlockedUntilMsRef.current) return;

    const engine = vrmEngineRef.current;
    if (!engine) return;

    const moodTier = avatarMoodTier;
    const pool = MOOD_ANIMATION_POOLS[moodTier];
    if (!pool || pool.accents.length === 0) return;

    const delayMs = (10 + Math.random() * 8) * 1000;

    idleCycleTimerRef.current = setTimeout(() => {
      if (actionAnimatingRef.current) return;
      if (emoteLoopOverrideRef.current) return;
      if (Date.now() < ambientBlockedUntilMsRef.current) return;
      const anim = pickRandomAnimationDef(pool.accents);
      if (anim) {
        void engine.playEmote(anim.url, anim.durationSec, false);
        idleCycleTimerRef.current = setTimeout(
          () => {
            scheduleNextAccentRef.current();
          },
          (anim.durationSec + 0.5) * 1000,
        );
      } else {
        scheduleNextAccentRef.current();
      }
    }, delayMs);
  }, []);

  scheduleNextAccentRef.current = scheduleNextAccent;

  const handleVrmEngineReady = useCallback(
    (engine: VrmEngine) => {
      vrmEngineRef.current = engine;
      currentAmbientIntentIdRef.current = null;
      applyAmbientIntent();
    },
    [applyAmbientIntent],
  );

  const handleVrmEngineState = useCallback(
    (state: VrmEngineState) => {
      if (!state.vrmLoaded) return;
      setVrmLoaded(true);
      setShowVrmFallback(false);
      applyAmbientIntent();
    },
    [applyAmbientIntent],
  );

  useEffect(() => {
    setVrmLoaded(false);
    setShowVrmFallback(false);
    currentAmbientIntentIdRef.current = null;
    ambientBlockedUntilMsRef.current = 0;
    emoteLoopOverrideRef.current = false;
    actionAnimatingRef.current = false;
    if (idleCycleTimerRef.current) {
      clearTimeout(idleCycleTimerRef.current);
      idleCycleTimerRef.current = null;
    }
    applyAmbientIntent();
    const timer = window.setTimeout(() => {
      setShowVrmFallback(true);
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [applyAmbientIntent]);

  useEffect(() => {
    applyAmbientIntent();
  }, [applyAmbientIntent]);

  // --- Feature A lifecycle: start idle accent cycling when VRM is loaded ---
  useEffect(() => {
    if (!vrmLoaded) return;
    scheduleNextAccent();
    return () => {
      if (idleCycleTimerRef.current) {
        clearTimeout(idleCycleTimerRef.current);
        idleCycleTimerRef.current = null;
      }
    };
  }, [vrmLoaded, scheduleNextAccent]);

  // Subscribe to WebSocket emote events so the companion avatar plays emotes
  // triggered from the EmotePicker or agent actions.
  useEffect(() => {
    if (!vrmLoaded) return;
    return client.onWsEvent("emote", (data) => {
      const engine = vrmEngineRef.current;
      if (!engine) return;
      const rawPath = data.glbPath as string;
      const resolvedPath = resolveAppAssetUrl(rawPath);
      const duration =
        typeof data.duration === "number" && Number.isFinite(data.duration)
          ? data.duration
          : 3;
      const isLoop = data.loop === true;

      // Block both ambient systems from overriding this emote.
      currentAmbientIntentIdRef.current = null;
      actionAnimatingRef.current = true;
      if (isLoop) {
        emoteLoopOverrideRef.current = true;
      } else {
        ambientBlockedUntilMsRef.current =
          Date.now() + Math.max(1800, Math.round(duration * 1000) + 700);
      }
      if (idleCycleTimerRef.current) {
        clearTimeout(idleCycleTimerRef.current);
        idleCycleTimerRef.current = null;
      }

      void engine.playEmote(resolvedPath, duration, isLoop);

      if (!isLoop) {
        setTimeout(
          () => {
            actionAnimatingRef.current = false;
            scheduleNextAccent();
          },
          Math.max(1800, Math.round(duration * 1000) + 700),
        );
      }
    });
  }, [vrmLoaded, scheduleNextAccent]);

  // Listen for stop-emote events from the EmotePicker "Stop" button.
  useEffect(() => {
    if (!vrmLoaded) return;
    const handler = () => {
      const engine = vrmEngineRef.current;
      if (!engine) return;
      actionAnimatingRef.current = false;
      emoteLoopOverrideRef.current = false;
      ambientBlockedUntilMsRef.current = 0;
      currentAmbientIntentIdRef.current = null;
      engine.stopEmote();
      setTimeout(() => {
        applyAmbientIntent();
        scheduleNextAccent();
      }, 80);
    };
    document.addEventListener("milady:stop-emote", handler);
    return () => document.removeEventListener("milady:stop-emote", handler);
  }, [vrmLoaded, applyAmbientIntent, scheduleNextAccent]);

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
          moodTier={avatarMoodTier}
          activeAction={null}
          visible={vrmLoaded}
        />
      </div>
    </div>
  );
}
