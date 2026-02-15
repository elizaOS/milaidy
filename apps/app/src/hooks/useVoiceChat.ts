/**
 * Bidirectional voice hook for chat + avatar lip sync.
 *
 * TTS providers (in priority order):
 *  1. ElevenLabs  — when configured with API key + voice ID.
 *                   Uses real audio volume analysis for mouth sync.
 *  2. Browser SpeechSynthesis — fallback when ElevenLabs isn't configured.
 *                   Uses simulated sine-wave mouth animation.
 *
 * STT: Web Speech API (SpeechRecognition) for user voice input.
 */

import { useState, useRef, useCallback, useEffect } from "react";
import type { VoiceConfig } from "../api-client";

// ── Speech Recognition types ──────────────────────────────────────────

interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: SpeechRecognitionResultEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

interface SpeechRecognitionResultEvent {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  [index: number]: { isFinal: boolean; 0: { transcript: string; confidence: number } };
}

type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  }
}

// ── Public types ──────────────────────────────────────────────────────

export interface VoiceChatOptions {
  /** Called when a final transcript is ready to send */
  onTranscript: (text: string) => void;
  /** Language for speech recognition (default: "en-US") */
  lang?: string;
  /** Saved voice configuration — switches TTS provider when set */
  voiceConfig?: VoiceConfig | null;
}

export interface VoiceChatState {
  /** Whether voice input is currently active */
  isListening: boolean;
  /** Whether the agent is currently speaking */
  isSpeaking: boolean;
  /** Current mouth openness (0-1) for lip sync */
  mouthOpen: number;
  /** Current interim transcript being recognized */
  interimTranscript: string;
  /** Whether Web Speech API is supported */
  supported: boolean;
  /** True when using real audio analysis (ElevenLabs) for mouth — ChatAvatar
   *  should NOT pass `isSpeaking` to the engine in this case so the engine
   *  uses the external `mouthOpen` values instead of internal sine waves. */
  usingAudioAnalysis: boolean;
  /** Toggle voice listening on/off */
  toggleListening: () => void;
  /** Speak text aloud with mouth animation */
  speak: (text: string) => void;
  /** Stop any current speech */
  stopSpeaking: () => void;
}

// ── Hook ──────────────────────────────────────────────────────────────

export function useVoiceChat(options: VoiceChatOptions): VoiceChatState {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [mouthOpen, setMouthOpen] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState("");
  const [supported, setSupported] = useState(false);
  const [usingAudioAnalysis, setUsingAudioAnalysis] = useState(false);

  // Refs — stable across renders, read from animation loop & callbacks
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const synthRef = useRef<SpeechSynthesis | null>(null);
  const utteranceRef = useRef<SpeechSynthesisUtterance | null>(null);
  const animFrameRef = useRef<number>(0);
  const speakingStartRef = useRef<number>(0);
  const speechTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(false);
  const onTranscriptRef = useRef(options.onTranscript);
  onTranscriptRef.current = options.onTranscript;

  // Voice config ref (latest value always available to callbacks)
  const voiceConfigRef = useRef(options.voiceConfig);
  voiceConfigRef.current = options.voiceConfig;

  // ── ElevenLabs Web Audio refs ──────────────────────────────────────
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const timeDomainDataRef = useRef<Float32Array<ArrayBuffer> | null>(null);
  const usingAudioAnalysisRef = useRef(false);

  // ── Init ──────────────────────────────────────────────────────────

  useEffect(() => {
    const SpeechRecognitionAPI: SpeechRecognitionCtor | undefined =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSupported(!!SpeechRecognitionAPI && !!window.speechSynthesis);
    synthRef.current = window.speechSynthesis ?? null;
  }, []);

  // ── Mouth animation loop ──────────────────────────────────────────

  useEffect(() => {
    const animate = () => {
      animFrameRef.current = requestAnimationFrame(animate);

      if (!isSpeaking) {
        setMouthOpen((prev) => prev * 0.85); // smooth close
        return;
      }

      // ── ElevenLabs: real audio volume analysis ────────────────────
      if (usingAudioAnalysisRef.current) {
        const analyser = analyserRef.current;
        const data = timeDomainDataRef.current;
        if (analyser && data) {
          analyser.getFloatTimeDomainData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i++) {
            const v = data[i] ?? 0;
            sum += v * v;
          }
          const rms = Math.sqrt(sum / data.length);
          // Sigmoid curve mapping RMS amplitude to 0–1 mouth openness
          const volume = Math.max(0, Math.min(1, 1 / (1 + Math.exp(-(rms * 30 - 2)))));
          setMouthOpen(volume);
        }
        return;
      }

      // ── Browser TTS: sine-wave mouth + safety check ──────────────
      const sinceStart = Date.now() - speakingStartRef.current;
      if (sinceStart > 500 && synthRef.current && !synthRef.current.speaking && !synthRef.current.pending) {
        utteranceRef.current = null;
        setIsSpeaking(false);
        return;
      }

      const elapsed = sinceStart / 1000;
      const base = Math.sin(elapsed * 12) * 0.3 + 0.4;
      const detail = Math.sin(elapsed * 18.7) * 0.15;
      const slow = Math.sin(elapsed * 4.2) * 0.1;
      setMouthOpen(Math.max(0, Math.min(1, base + detail + slow)));
    };

    animFrameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isSpeaking]);

  // ── STT (Speech Recognition) ──────────────────────────────────────

  const startRecognition = useCallback(() => {
    const SpeechRecognitionAPI: SpeechRecognitionCtor | undefined =
      window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) return;

    const recognition = new SpeechRecognitionAPI();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = options.lang ?? "en-US";

    recognition.onresult = (event: SpeechRecognitionResultEvent) => {
      const result = event.results[event.results.length - 1];
      if (!result) return;
      const transcript = result[0].transcript;
      if (result.isFinal && transcript.trim()) {
        setInterimTranscript("");
        onTranscriptRef.current(transcript.trim());
      } else {
        setInterimTranscript(transcript);
      }
    };

    recognition.onerror = (event: { error: string }) => {
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        enabledRef.current = false;
        setIsListening(false);
      }
    };

    recognition.onend = () => {
      if (enabledRef.current) {
        try { recognition.start(); } catch { /* already started */ }
      }
    };

    recognitionRef.current = recognition;
    try {
      recognition.start();
      enabledRef.current = true;
      setIsListening(true);
    } catch { /* failed to start */ }
  }, [options.lang]);

  const stopRecognition = useCallback(() => {
    enabledRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    setIsListening(false);
    setInterimTranscript("");
  }, []);

  const toggleListening = useCallback(() => {
    if (enabledRef.current) stopRecognition();
    else startRecognition();
  }, [startRecognition, stopRecognition]);

  // ── Cancel helpers ────────────────────────────────────────────────

  /** Stop all in-progress speech (both providers). */
  const cancelAllSpeech = useCallback(() => {
    // Browser TTS
    synthRef.current?.cancel();
    utteranceRef.current = null;

    // ElevenLabs audio
    if (audioSourceRef.current) {
      try { audioSourceRef.current.stop(); } catch { /* ok */ }
      try { audioSourceRef.current.disconnect(); } catch { /* ok */ }
      audioSourceRef.current = null;
    }

    // Timers & flags
    if (speechTimeoutRef.current) {
      clearTimeout(speechTimeoutRef.current);
      speechTimeoutRef.current = null;
    }
    usingAudioAnalysisRef.current = false;
  }, []);

  const stopSpeaking = useCallback(() => {
    cancelAllSpeech();
    setIsSpeaking(false);
    setUsingAudioAnalysis(false);
  }, [cancelAllSpeech]);

  // ── ElevenLabs TTS ────────────────────────────────────────────────

  const speakElevenLabs = useCallback(async (text: string, elConfig: NonNullable<VoiceConfig["elevenlabs"]>) => {
    // Lazy-init AudioContext
    let ctx = audioCtxRef.current;
    if (!ctx) {
      ctx = new AudioContext();
      audioCtxRef.current = ctx;
    }
    if (ctx.state === "suspended") {
      await ctx.resume();
    }

    const voiceId = elConfig.voiceId ?? "EXAVITQu4vr4xnSDxMaL";
    const modelId = elConfig.modelId ?? "eleven_multilingual_v2";

    const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: "POST",
      headers: {
        "xi-api-key": elConfig.apiKey ?? "",
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: text.trim(),
        model_id: modelId,
        voice_settings: {
          stability: elConfig.stability ?? 0.5,
          similarity_boost: elConfig.similarityBoost ?? 0.75,
          speed: elConfig.speed ?? 1.0,
        },
      }),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ElevenLabs ${res.status}: ${body.slice(0, 200)}`);
    }

    const audioData = await res.arrayBuffer();
    const audioBuffer = await ctx.decodeAudioData(audioData);

    // Set up analyser for real-time volume → mouth sync
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 2048;
    analyser.smoothingTimeConstant = 0.8;
    analyserRef.current = analyser;
    timeDomainDataRef.current = new Float32Array(
      new ArrayBuffer(analyser.fftSize * Float32Array.BYTES_PER_ELEMENT),
    );

    // Source → analyser → speakers
    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(analyser);
    analyser.connect(ctx.destination);
    audioSourceRef.current = source;

    source.onended = () => {
      audioSourceRef.current = null;
      usingAudioAnalysisRef.current = false;
      setUsingAudioAnalysis(false);
      setIsSpeaking(false);
      if (speechTimeoutRef.current) {
        clearTimeout(speechTimeoutRef.current);
        speechTimeoutRef.current = null;
      }
    };

    source.start();
  }, []);

  // ── Browser SpeechSynthesis TTS ───────────────────────────────────

  const speakBrowser = useCallback((text: string) => {
    const synth = synthRef.current;
    const words = text.trim().split(/\s+/).length;
    const estimatedMs = Math.max(1500, (words / 2.5) * 1000);

    const cleanup = () => {
      utteranceRef.current = null;
      setIsSpeaking(false);
      if (speechTimeoutRef.current) {
        clearTimeout(speechTimeoutRef.current);
        speechTimeoutRef.current = null;
      }
    };

    if (!synth) {
      // No SpeechSynthesis — animate mouth for estimated duration
      speechTimeoutRef.current = setTimeout(cleanup, estimatedMs);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text.trim());
    utteranceRef.current = utterance;
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = cleanup;
    utterance.onerror = cleanup;
    synth.speak(utterance);

    // Safety timeout in case browser events never fire
    speechTimeoutRef.current = setTimeout(() => {
      if (utteranceRef.current === utterance) cleanup();
    }, estimatedMs + 5000);
  }, []);

  // ── Main speak entry point ────────────────────────────────────────

  const speak = useCallback(
    (text: string) => {
      if (!text.trim()) return;

      // Cancel anything in-progress
      cancelAllSpeech();

      // Start mouth animation immediately
      speakingStartRef.current = Date.now();
      setIsSpeaking(true);

      const config = voiceConfigRef.current;
      const elConfig = config?.elevenlabs;

      // Use direct ElevenLabs only in own-key mode when key + voice are set.
      if (
        config?.provider === "elevenlabs" &&
        config?.mode !== "cloud" &&
        elConfig?.apiKey &&
        elConfig?.voiceId
      ) {
        usingAudioAnalysisRef.current = true;
        setUsingAudioAnalysis(true);

        void speakElevenLabs(text, elConfig).catch((err) => {
          console.warn("[useVoiceChat] ElevenLabs TTS failed, falling back to browser:", err);
          usingAudioAnalysisRef.current = false;
          setUsingAudioAnalysis(false);
          speakBrowser(text);
        });
        return;
      }

      // Fallback: browser SpeechSynthesis
      usingAudioAnalysisRef.current = false;
      setUsingAudioAnalysis(false);
      speakBrowser(text);
    },
    [cancelAllSpeech, speakElevenLabs, speakBrowser],
  );

  // ── Cleanup on unmount ────────────────────────────────────────────

  useEffect(() => {
    return () => {
      stopRecognition();
      stopSpeaking();
    };
  }, [stopRecognition, stopSpeaking]);

  return {
    isListening,
    isSpeaking,
    mouthOpen,
    interimTranscript,
    supported,
    usingAudioAnalysis,
    toggleListening,
    speak,
    stopSpeaking,
  };
}
