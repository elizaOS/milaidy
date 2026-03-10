/**
 * StreamView — Studio Live style layout for agent streaming.
 *
 * Layout:
 *   Top bar:    status / branding / quality + GO LIVE
 *   Left:       scene editor (agent mode config)
 *   Center:     stream preview canvas with glow border
 *   Right:      vertical icon toolbar → expandable panels
 *   Bottom:     control buttons (mic, volume, source, settings)
 */

import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Activity,
  Bookmark,
  Clapperboard,
  Clock,
  Coffee,
  Gamepad2,
  Globe,
  Image,
  Layers,
  MessageSquare,
  Mic,
  MicOff,
  Monitor,
  MonitorPlay,
  Palette,
  PictureInPicture2,
  Pin,
  PinOff,
  Plug,
  Plus,
  Radio,
  RotateCcw,
  Settings,
  Sunset,
  Terminal,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  THEMES,
  type ThemeName,
  VRM_COUNT,
  getVrmPreviewUrl,
  getVrmTitle,
  useApp,
} from "../AppContext";
import {
  type AllPermissionsState,
  client,
  isApiError,
  type PluginInfo,
  type PluginParamDef,
  type PermissionStatus as PermStatus,
  type SystemPermissionId,
} from "../api-client";
import { ActivityFeed } from "./stream/ActivityFeed";
import { AvatarPip } from "./stream/AvatarPip";
import { ChatContent } from "./stream/ChatContent";
import { ChatTicker } from "./stream/ChatTicker";
import {
  type AgentMode,
  CHAT_ACTIVE_WINDOW_MS,
  FULL_SIZE,
  IS_POPOUT,
  PIP_SIZE,
  STREAM_SOURCE_LABELS,
  type StreamSourceType,
  TERMINAL_ACTIVE_WINDOW_MS,
  isSupportedStreamUrl,
  toggleAlwaysOnTop,
} from "./stream/helpers";
import { IdleContent } from "./stream/IdleContent";
import { OverlayLayer } from "./stream/overlays/OverlayLayer";
import { getAllWidgets } from "./stream/overlays/registry";
import type { SceneId, BackgroundConfig, WidgetConfigField, WidgetInstance } from "./stream/overlays/types";
import { isBroadcastScene } from "./stream/overlays/types";
import { useSceneLayouts } from "./stream/overlays/useOverlayLayout";
import { StreamTerminal } from "./stream/StreamTerminal";
import { StreamVoiceConfig } from "./stream/StreamVoiceConfig";

// ---------------------------------------------------------------------------
// Scene definitions — maps agent modes to visual thumbnails
// ---------------------------------------------------------------------------

const CONTENT_SCENES: Array<{
  id: SceneId;
  label: string;
  icon: typeof Monitor;
  description: string;
}> = [
  { id: "idle", label: "Idle", icon: Monitor, description: "Dashboard when agent is idle" },
  { id: "terminal", label: "Terminal", icon: Terminal, description: "Live terminal output" },
  { id: "chatting", label: "Chat", icon: MessageSquare, description: "Chat conversations" },
  { id: "gaming", label: "Gaming", icon: Gamepad2, description: "Game viewer iframe" },
];

const BROADCAST_SCENES: Array<{
  id: SceneId;
  label: string;
  icon: typeof Monitor;
  description: string;
  defaultSlate: string;
}> = [
  { id: "starting-soon", label: "Starting", icon: Clock, description: "Starting Soon slate", defaultSlate: "Starting Soon" },
  { id: "be-right-back", label: "BRB", icon: Coffee, description: "Be Right Back slate", defaultSlate: "Be Right Back" },
  { id: "ending", label: "Ending", icon: Sunset, description: "Stream ending slate", defaultSlate: "Thanks for Watching!" },
];

const ALL_SCENES = [...CONTENT_SCENES, ...BROADCAST_SCENES];

// Right sidebar tool entries
type ToolPanel =
  | "activity"
  | "widgets"
  | "channel"
  | "source"
  | "voice"
  | "theme"
  | "scene"
  | "presets"
  | "background"
  | null;

const TOOL_ITEMS: Array<{
  id: ToolPanel;
  label: string;
  icon: typeof Monitor;
}> = [
  { id: "scene", label: "Scene", icon: Clapperboard },
  { id: "presets", label: "Presets", icon: Bookmark },
  { id: "widgets", label: "Widgets", icon: Layers },
  { id: "channel", label: "Channel", icon: Globe },
  { id: "source", label: "Source", icon: MonitorPlay },
  { id: "voice", label: "Voice", icon: Mic },
  { id: "background", label: "BG", icon: Image },
  { id: "theme", label: "Theme", icon: Palette },
  { id: "activity", label: "Activity", icon: Activity },
];

// ---------------------------------------------------------------------------
// Widget config field renderer (extracted from StreamSettings)
// ---------------------------------------------------------------------------

function ConfigField({
  fieldKey,
  field,
  value,
  onChange,
}: {
  fieldKey: string;
  field: WidgetConfigField;
  value: unknown;
  onChange: (key: string, value: unknown) => void;
}) {
  switch (field.type) {
    case "boolean":
      return (
        <label className="flex items-center gap-2 text-[12px] text-txt">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => onChange(fieldKey, e.target.checked)}
            className="accent-accent"
          />
          {field.label}
        </label>
      );
    case "number":
      return (
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted">{field.label}</span>
          <input
            type="number"
            min={field.min}
            max={field.max}
            value={typeof value === "number" ? value : (field.default as number)}
            onChange={(e) => onChange(fieldKey, Number(e.target.value))}
            className="bg-bg-elevated border border-border-strong text-txt text-[12px] rounded-md px-2 py-1 outline-none focus:border-accent w-full"
          />
        </label>
      );
    case "select":
      return (
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted">{field.label}</span>
          <select
            value={typeof value === "string" ? value : String(field.default)}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            className="bg-bg-elevated border border-border-strong text-txt text-[12px] rounded-md px-2 py-1 cursor-pointer"
          >
            {field.options?.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </label>
      );
    case "color":
      return (
        <label className="flex items-center gap-2">
          <span className="text-[11px] text-muted">{field.label}</span>
          <input
            type="color"
            value={typeof value === "string" ? value : String(field.default)}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            className="w-8 h-6 rounded border border-border-strong cursor-pointer bg-transparent"
          />
        </label>
      );
    default:
      return (
        <label className="flex flex-col gap-0.5">
          <span className="text-[11px] text-muted">{field.label}</span>
          <input
            type="text"
            value={typeof value === "string" ? value : String(field.default ?? "")}
            onChange={(e) => onChange(fieldKey, e.target.value)}
            className="bg-bg-elevated border border-border-strong text-txt text-[12px] rounded-md px-2 py-1 outline-none focus:border-accent w-full"
          />
        </label>
      );
  }
}

// ---------------------------------------------------------------------------
// Widget row for the widgets panel
// ---------------------------------------------------------------------------

function WidgetRow({
  instance,
  onToggle,
  onUpdate,
}: {
  instance: WidgetInstance;
  onToggle: () => void;
  onUpdate: (patch: Partial<Pick<WidgetInstance, "config">>) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const def = getAllWidgets().find((d) => d.type === instance.type);
  const hasConfig = def && Object.keys(def.configSchema).length > 0;

  return (
    <div className="rounded-lg overflow-hidden bg-bg-elevated/60">
      <div className="flex items-center gap-2 px-3 py-2">
        <button
          type="button"
          onClick={onToggle}
          className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 cursor-pointer ${
            instance.enabled ? "bg-accent" : "bg-border-strong"
          }`}
          title={instance.enabled ? "Disable widget" : "Enable widget"}
        >
          <span
            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
              instance.enabled ? "translate-x-4" : "translate-x-0.5"
            }`}
          />
        </button>
        <div className="flex-1 min-w-0">
          <div className="text-[12px] font-medium text-txt truncate">
            {def?.name ?? instance.type}
          </div>
        </div>
        {hasConfig && (
          <button
            type="button"
            onClick={() => setExpanded((x) => !x)}
            className="text-muted hover:text-txt text-[10px] px-1.5 py-0.5 rounded bg-bg-accent cursor-pointer"
          >
            {expanded ? "Hide" : "Config"}
          </button>
        )}
      </div>
      {expanded && hasConfig && def && (
        <div className="px-3 py-2 border-t border-border-strong flex flex-col gap-2">
          {Object.entries(def.configSchema).map(([key, field]) => (
            <ConfigField
              key={key}
              fieldKey={key}
              field={field}
              value={instance.config[key] ?? field.default}
              onChange={(k, v) =>
                onUpdate({ config: { ...instance.config, [k]: v } })
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Broadcast slate — full-screen scene for Starting Soon / BRB / Ending
// ---------------------------------------------------------------------------

function BroadcastSlate({
  scene,
  agentName,
}: {
  scene?: { slate?: { text: string; subtext?: string; backgroundColor?: string; textColor?: string } };
  agentName: string;
}) {
  const slate = scene?.slate;
  const bg = slate?.backgroundColor || "#0e1118";
  const textColor = slate?.textColor || "#ffffff";
  const text = slate?.text || "Starting Soon";
  const subtext = slate?.subtext;

  return (
    <div
      className="h-full w-full flex flex-col items-center justify-center"
      style={{ background: bg }}
    >
      <div
        className="text-4xl font-bold tracking-wider uppercase"
        style={{ color: textColor, textShadow: "0 2px 20px rgba(0,0,0,0.5)" }}
      >
        {text}
      </div>
      {subtext && (
        <div
          className="text-lg mt-3 opacity-70"
          style={{ color: textColor }}
        >
          {subtext}
        </div>
      )}
      <div className="mt-8 text-sm text-muted opacity-60">
        {agentName}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sidebar panel wrapper
// ---------------------------------------------------------------------------

function SidePanel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col h-full bg-bg-accent">
      <div className="px-3 py-2.5 border-b border-border shrink-0">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted">
          {title}
        </span>
      </div>
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3">
        {children}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// StreamView
// ---------------------------------------------------------------------------

export function StreamView({ inModal }: { inModal?: boolean } = {}) {
  const {
    agentStatus,
    autonomousEvents,
    conversationMessages,
    activeGameViewerUrl,
    activeGameSandbox,
    chatAvatarSpeaking,
    setTheme,
    setState,
    selectedVrmIndex,
    currentTheme,
  } = useApp();

  const agentName = agentStatus?.agentName ?? "Milady";

  // ── Stream status polling ─────────────────────────────────────────────
  const [streamLive, setStreamLive] = useState(false);
  const [streamLoading, setStreamLoading] = useState(false);
  const loadingRef = useRef(false);
  const presetNameRef = useRef<HTMLInputElement>(null);

  const [streamAvailable, setStreamAvailable] = useState(true);

  // ── Volume / mute ───────────────────────────────────────────────────
  const [volume, setVolume] = useState(100);
  const [muted, setMuted] = useState(false);

  // ── Destinations ────────────────────────────────────────────────────
  const [destinations, setDestinations] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [activeDestination, setActiveDestination] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // ── Streaming plugins (shown in channel panel) ─────────────────
  const [streamingPlugins, setStreamingPlugins] = useState<PluginInfo[]>([]);
  const [togglingPlugin, setTogglingPlugin] = useState<string | null>(null);
  const [expandedPlugin, setExpandedPlugin] = useState<string | null>(null);

  // Fetch streaming plugins on mount
  useEffect(() => {
    client
      .getPlugins()
      .then((res) => {
        setStreamingPlugins(
          res.plugins.filter((p: PluginInfo) => p.category === "streaming"),
        );
      })
      .catch(() => {});
  }, []);

  const handleTogglePlugin = useCallback(
    async (plugin: PluginInfo) => {
      if (togglingPlugin) return;
      setTogglingPlugin(plugin.id);
      try {
        const npmName = plugin.npmName || plugin.id;
        const result = await client.toggleCorePlugin(npmName, !plugin.enabled);
        if (result.ok) {
          setStreamingPlugins((prev) =>
            prev.map((p) =>
              p.id === plugin.id ? { ...p, enabled: !p.enabled } : p,
            ),
          );
          // Refresh destinations after toggling
          try {
            const destRes = await client.getStreamingDestinations();
            if (destRes.ok) setDestinations(destRes.destinations);
          } catch {}
        }
      } catch {} finally {
        setTogglingPlugin(null);
      }
    },
    [togglingPlugin],
  );

  const handleSavePluginParam = useCallback(
    async (pluginId: string, key: string, value: string) => {
      try {
        await client.updatePlugin(pluginId, { [key]: value });
        setStreamingPlugins((prev) =>
          prev.map((p) => {
            if (p.id !== pluginId) return p;
            return {
              ...p,
              parameters: p.parameters.map((param) =>
                param.key === key
                  ? { ...param, currentValue: value, isSet: !!value }
                  : param,
              ),
            };
          }),
        );
      } catch {}
    },
    [],
  );

  // ── Health stats ────────────────────────────────────────────────────
  const [uptime, setUptime] = useState(0);
  const [frameCount, setFrameCount] = useState(0);
  const [audioSource, setAudioSource] = useState("");

  // ── Stream source ─────────────────────────────────────────────────
  const [streamSource, setStreamSource] = useState<{
    type: StreamSourceType;
    url?: string;
  }>({ type: "stream-tab" });

  useEffect(() => {
    let mounted = true;
    const poll = async () => {
      if (loadingRef.current || !streamAvailable) return;
      try {
        const status = await client.streamStatus();
        if (mounted && !loadingRef.current) {
          setStreamLive(status.running && status.ffmpegAlive);
          setVolume(status.volume);
          setMuted(status.muted);
          setUptime(status.uptime);
          setFrameCount(status.frameCount);
          setAudioSource(status.audioSource);
          if (status.destination) setActiveDestination(status.destination);
        }
      } catch (err: unknown) {
        if (isApiError(err) && err.status === 404) {
          setStreamAvailable(false);
          return;
        }
      }
    };
    if (!streamAvailable) return;
    poll();
    const id = setInterval(poll, 5_000);
    return () => {
      mounted = false;
      clearInterval(id);
    };
  }, [streamAvailable]);

  // ── Auto-detect game source ─────────────────────────────────────────
  useEffect(() => {
    if (!streamLive) return;
    let cancelled = false;
    if (activeGameViewerUrl.trim() && streamSource.type !== "game") {
      client
        .setStreamSource("game", activeGameViewerUrl)
        .then((result) => {
          if (!cancelled && result.ok) {
            setStreamSource({ type: "game", url: activeGameViewerUrl });
          }
        })
        .catch(() => {});
    } else if (!activeGameViewerUrl.trim() && streamSource.type === "game") {
      client
        .setStreamSource("stream-tab")
        .then((result) => {
          if (!cancelled && result.ok) {
            setStreamSource({ type: "stream-tab" });
          }
        })
        .catch(() => {});
    }
    return () => {
      cancelled = true;
    };
  }, [activeGameViewerUrl, streamLive, streamSource.type]);

  const toggleStream = useCallback(async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setStreamLoading(true);
    try {
      if (streamLive) {
        await client.streamGoOffline();
        setStreamLive(false);
      } else {
        const result = await client.streamGoLive();
        setStreamLive(result.live);

        if (result.live && !IS_POPOUT) {
          const apiBase = (window as unknown as Record<string, unknown>)
            .__MILADY_API_BASE__ as string | undefined;
          const base = window.location.origin || "";
          const sep =
            window.location.protocol === "file:" ||
            window.location.protocol === "capacitor-electron:"
              ? "#"
              : "";
          const qs = apiBase
            ? `popout&apiBase=${encodeURIComponent(apiBase)}`
            : "popout";
          window.open(
            `${base}${sep}/?${qs}`,
            "milady-stream",
            "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no",
          );
        }
      }
    } catch {
      try {
        const status = await client.streamStatus();
        setStreamLive(status.running && status.ffmpegAlive);
      } catch {
        /* poll will recover */
      }
    } finally {
      loadingRef.current = false;
      setStreamLoading(false);
    }
  }, [streamLive]);

  // ── Fetch destinations on mount ──────────────────────────────────────
  useEffect(() => {
    if (!streamAvailable) return;
    client
      .getStreamingDestinations()
      .then((res) => {
        if (res.ok) setDestinations(res.destinations);
      })
      .catch(() => {});
  }, [streamAvailable]);

  // ── Volume / mute / destination handlers ────────────────────────────
  const handleVolumeChange = useCallback((vol: number) => {
    setVolume(vol);
    client.setStreamVolume(vol).catch(() => {});
  }, []);

  const handleToggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    (next ? client.muteStream() : client.unmuteStream()).catch(() => {});
  }, [muted]);

  const handleDestinationChange = useCallback((id: string) => {
    client
      .setActiveDestination(id)
      .then((res) => {
        if (res.ok && res.destination) setActiveDestination(res.destination);
      })
      .catch(() => {});
  }, []);

  const handleSourceChange = useCallback(
    async (sourceType: StreamSourceType, customUrl?: string) => {
      try {
        const result = await client.setStreamSource(sourceType, customUrl);
        if (result.ok) {
          setStreamSource(
            result.source as { type: StreamSourceType; url?: string },
          );
        }
      } catch {
        // Non-fatal
      }
    },
    [],
  );

  // ── Custom URL for source ────────────────────────────────────────────
  const [customUrlInput, setCustomUrlInput] = useState("");
  const trimmedCustomUrl = customUrlInput.trim();
  const customUrlValid = isSupportedStreamUrl(trimmedCustomUrl);

  // ── Theme / stream settings ──────────────────────────────────────────
  // Use global state directly — selecting a theme/avatar here applies it app-wide
  // and syncs to the headless capture server automatically.
  const streamTheme = currentTheme;
  const avatarIndex = selectedVrmIndex;

  // Avatar display mode: "pip" (small corner overlay) or "full" (full canvas)
  const [avatarDisplayMode, setAvatarDisplayMode] = useState<"pip" | "full">(() => {
    try {
      const stored = localStorage.getItem("milady.stream.avatar-display-mode");
      return stored === "full" ? "full" : "pip";
    } catch { return "pip"; }
  });

  const saveThemeSettings = useCallback(
    (theme: string, avatar: number) => {
      // Apply globally — this updates CSS, persists to localStorage, and syncs to server
      setTheme(theme as ThemeName);
      setState("selectedVrmIndex", avatar);
    },
    [setTheme, setState],
  );

  const toggleAvatarDisplay = useCallback((mode: "pip" | "full") => {
    setAvatarDisplayMode(mode);
    try { localStorage.setItem("milady.stream.avatar-display-mode", mode); } catch {}
  }, []);

  // ── Permissions ────────────────────────────────────────────────────
  const [permissions, setPermissions] = useState<AllPermissionsState | null>(null);

  useEffect(() => {
    client
      .getPermissions()
      .then((perms) => setPermissions(perms))
      .catch(() => {});
  }, []);

  const handleRequestPermission = useCallback(
    async (id: SystemPermissionId) => {
      try {
        const state = await client.requestPermission(id);
        setPermissions((prev) => (prev ? { ...prev, [id]: state } : prev));
      } catch {}
    },
    [],
  );

  const handleOpenPermissionSettings = useCallback(
    async (id: SystemPermissionId) => {
      try {
        const electron = (
          window as { electron?: { ipcRenderer: { invoke: (ch: string, p?: unknown) => Promise<unknown> } } }
        ).electron;
        if (electron?.ipcRenderer) {
          await electron.ipcRenderer.invoke("permissions:openSettings", { id });
        } else {
          await client.openPermissionSettings(id);
        }
      } catch {}
    },
    [],
  );

  // ── UI state ────────────────────────────────────────────────────────
  const [isPip, setIsPip] = useState(false);
  const [activePanel, setActivePanel] = useState<ToolPanel>(null);

  const togglePip = useCallback(() => {
    if (!IS_POPOUT) return;
    const next = !isPip;
    if (next) {
      window.resizeTo(PIP_SIZE.width, PIP_SIZE.height);
      const sw = window.screen.availWidth;
      const sh = window.screen.availHeight;
      window.moveTo(sw - PIP_SIZE.width - 20, sh - PIP_SIZE.height - 20);
    } else {
      window.resizeTo(FULL_SIZE.width, FULL_SIZE.height);
      const sw = window.screen.availWidth;
      const sh = window.screen.availHeight;
      window.moveTo(
        Math.round((sw - FULL_SIZE.width) / 2),
        Math.round((sh - FULL_SIZE.height) / 2),
      );
    }
    setIsPip(next);
  }, [isPip]);

  // Track terminal activity
  const [terminalActive, setTerminalActive] = useState(false);
  const terminalTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const unbind = client.onWsEvent(
      "terminal-output",
      (data: Record<string, unknown>) => {
        const event = data.event as string;
        if (event === "start" || event === "stdout" || event === "stderr") {
          setTerminalActive(true);
          if (terminalTimeoutRef.current) {
            clearTimeout(terminalTimeoutRef.current);
          }
          terminalTimeoutRef.current = setTimeout(() => {
            setTerminalActive(false);
          }, TERMINAL_ACTIVE_WINDOW_MS);
        }
      },
    );
    return () => {
      unbind();
      if (terminalTimeoutRef.current) clearTimeout(terminalTimeoutRef.current);
    };
  }, []);

  // Detect current mode
  const mode: AgentMode = useMemo(() => {
    if (activeGameViewerUrl.trim()) return "gaming";
    if (terminalActive) return "terminal";

    const now = Date.now();
    const recentChat = autonomousEvents.find(
      (e) => e.stream === "assistant" && now - e.ts < CHAT_ACTIVE_WINDOW_MS,
    );
    if (recentChat) return "chatting";

    return "idle";
  }, [activeGameViewerUrl, terminalActive, autonomousEvents]);

  const sceneLayouts = useSceneLayouts(activeDestination?.id, mode);
  const {
    layout,
    activeSceneId,
    isManualOverride,
    setActiveScene,
    toggleWidget,
    updateWidget,
    moveWidget,
    resetLayout,
    updateSlate,
    copyLayoutToScene,
    scenes,
    updateBackground,
    savePreset,
    loadPreset,
    deletePreset,
    presetNames,
  } = sceneLayouts;

  // Edit mode — when active, widgets can be dragged on canvas
  const [editMode, setEditMode] = useState(false);

  // ── Background (per-scene) ──────────────────────────────────────────
  const [bgUploading, setBgUploading] = useState(false);

  // Resolve the API base for direct fetch calls (background upload)
  const apiBase = useMemo(() => {
    const w = window as unknown as Record<string, unknown>;
    return (typeof w.__MILADY_API_BASE__ === "string" ? w.__MILADY_API_BASE__ : "") || "";
  }, []);

  // Read background from current scene
  const currentSceneBg: BackgroundConfig | undefined = scenes.scenes[activeSceneId]?.background;

  const bgGradient = currentSceneBg?.type === "gradient" ? currentSceneBg.value : null;
  const bgImageUrl = currentSceneBg?.type === "image" ? currentSceneBg.value : null;
  const bgColor = currentSceneBg?.type === "color" ? currentSceneBg.value : "#12151f";
  const bgOpacity = currentSceneBg?.opacity ?? 0.7;

  const uploadBackground = useCallback(
    async (file: File) => {
      if (bgUploading) return;
      setBgUploading(true);
      try {
        const arrayBuf = await file.arrayBuffer();
        const sceneId = activeSceneId;
        const res = await fetch(`${apiBase}/api/avatar/background?scene=${sceneId}`, {
          method: "POST",
          headers: { "Content-Type": file.type },
          body: arrayBuf,
        });
        if (res.ok) {
          const imageUrl = `${apiBase}/api/avatar/background?scene=${sceneId}&t=${Date.now()}`;
          updateBackground(sceneId, { type: "image", value: imageUrl, opacity: 0.7 });
        }
      } catch {
        // Non-fatal
      } finally {
        setBgUploading(false);
      }
    },
    [bgUploading, apiBase, activeSceneId, updateBackground],
  );

  const setPresetGradient = useCallback((gradient: string | null) => {
    if (!gradient || gradient === "#12151f") {
      updateBackground(activeSceneId, { type: "color", value: "#12151f" });
    } else {
      updateBackground(activeSceneId, { type: "gradient", value: gradient });
    }
  }, [activeSceneId, updateBackground]);

  const removeBackground = useCallback(() => {
    updateBackground(activeSceneId, { type: "color", value: "#12151f" });
  }, [activeSceneId, updateBackground]);

  const feedEvents = useMemo(
    () =>
      autonomousEvents
        .filter((e) => e.stream !== "viewer_stats")
        .slice(-80)
        .reverse(),
    [autonomousEvents],
  );

  const viewerCount = useMemo(() => {
    for (let i = autonomousEvents.length - 1; i >= 0; i--) {
      const evt = autonomousEvents[i];
      if (evt.stream === "viewer_stats") {
        const p = evt.payload as Record<string, unknown>;
        if (typeof p.apiViewerCount === "number") return p.apiViewerCount;
        if (typeof p.uniqueChatters === "number") return p.uniqueChatters;
      }
    }
    return null;
  }, [autonomousEvents]);

  const formatUptime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  // PIP scaling
  const pipScale = isPip ? PIP_SIZE.width / FULL_SIZE.width : 1;
  const pipStyle: CSSProperties | undefined = isPip
    ? {
        width: FULL_SIZE.width,
        height: FULL_SIZE.height,
        transform: `scale(${pipScale})`,
        transformOrigin: "top left",
      }
    : undefined;

  // Popout ref
  const popoutPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    return () => {
      if (popoutPollRef.current) {
        clearInterval(popoutPollRef.current);
        popoutPollRef.current = null;
      }
    };
  }, []);

  const [pinned, setPinned] = useState(IS_POPOUT);

  const toggleToolPanel = (panel: ToolPanel) => {
    setActivePanel((prev) => (prev === panel ? null : panel));
  };

  const modeLabel = (() => {
    const scene = ALL_SCENES.find((s) => s.id === activeSceneId);
    return scene?.label ?? "Idle";
  })();

  // ── Render ──────────────────────────────────────────────────────────

  return (
    <div
      data-stream-view
      data-theme={streamTheme}
      className={`flex flex-col text-txt font-body ${
        inModal ? "bg-transparent" : "bg-bg"
      } ${isPip ? "" : "h-full w-full"}`}
      style={pipStyle}
    >
      {/* ═══════════════ TOP BAR ═══════════════ */}
      <div
        className="flex items-center justify-between px-4 py-2 bg-bg-accent border-b border-border shrink-0"
        style={
          IS_POPOUT ? ({ WebkitAppRegion: "drag" } as CSSProperties) : undefined
        }
      >
        {/* Left: status */}
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`w-2.5 h-2.5 rounded-full shrink-0 ${
              streamLive
                ? "bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)] animate-pulse"
                : "bg-gray-500"
            }`}
          />
          <span className="text-[13px] text-txt truncate">
            {modeLabel}
            {streamLive && uptime > 0 && (
              <span className="text-muted ml-2 text-[11px] font-mono">
                {formatUptime(uptime)}
              </span>
            )}
          </span>
          {viewerCount !== null && viewerCount > 0 && (
            <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-bg-elevated text-[11px]">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.5)]" />
              <span className="text-txt">{viewerCount}</span>
            </span>
          )}
        </div>

        {/* Center: branding */}
        {!isPip && (
          <div className="flex items-center gap-2">
            <Radio className="w-4 h-4 text-accent" />
            <span className="text-[13px] font-bold tracking-wider text-txt-strong uppercase">
              {agentName}{" "}
              <span className="text-accent font-black">Studio</span>
            </span>
          </div>
        )}

        {/* Right: GO LIVE + popout */}
        <div
          className="flex items-center gap-2"
          style={
            IS_POPOUT
              ? ({ WebkitAppRegion: "no-drag" } as CSSProperties)
              : undefined
          }
        >
          {!isPip && streamLive && (
            <span className="text-[10px] font-mono text-muted px-2 py-0.5 rounded bg-bg-elevated">
              {frameCount.toLocaleString()}f
              {audioSource && ` | ${audioSource}`}
            </span>
          )}

          {IS_POPOUT && (
            <>
              <button
                type="button"
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  isPip
                    ? "bg-accent-subtle text-accent"
                    : "bg-bg-elevated text-muted-strong hover:text-accent hover:bg-accent-subtle"
                }`}
                title={isPip ? "Exit PIP" : "Picture-in-picture"}
                onClick={togglePip}
              >
                <PictureInPicture2 className="w-4 h-4" />
              </button>
              <button
                type="button"
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  pinned
                    ? "bg-accent-subtle text-accent"
                    : "bg-bg-elevated text-muted-strong hover:text-accent hover:bg-accent-subtle"
                }`}
                title={pinned ? "Unpin" : "Pin to top"}
                onClick={() => {
                  const next = !pinned;
                  toggleAlwaysOnTop(next).then((result) => {
                    if (result !== undefined) setPinned(next);
                  });
                }}
              >
                {pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
              </button>
            </>
          )}

          {!IS_POPOUT && (
            <button
              type="button"
              className="p-1.5 rounded-md bg-bg-elevated text-muted-strong hover:text-accent hover:bg-accent-subtle transition-colors cursor-pointer"
              title="Pop out stream view"
              onClick={() => {
                const apiBase = (window as unknown as Record<string, unknown>)
                  .__MILADY_API_BASE__ as string | undefined;
                const base = window.location.origin || "";
                const sep =
                  window.location.protocol === "file:" ||
                  window.location.protocol === "capacitor-electron:"
                    ? "#"
                    : "";
                const qs = apiBase
                  ? `popout&apiBase=${encodeURIComponent(apiBase)}`
                  : "popout";
                const popoutWin = window.open(
                  `${base}${sep}/?${qs}`,
                  "milady-stream",
                  "width=1280,height=720,menubar=no,toolbar=no,location=no,status=no",
                );
                if (popoutWin) {
                  window.dispatchEvent(
                    new CustomEvent("stream-popout", { detail: "opened" }),
                  );
                  if (popoutPollRef.current) clearInterval(popoutPollRef.current);
                  popoutPollRef.current = setInterval(() => {
                    if (popoutWin.closed) {
                      if (popoutPollRef.current) {
                        clearInterval(popoutPollRef.current);
                        popoutPollRef.current = null;
                      }
                      window.dispatchEvent(
                        new CustomEvent("stream-popout", { detail: "closed" }),
                      );
                    }
                  }, 500);
                }
              }}
            >
              <MonitorPlay className="w-4 h-4" />
            </button>
          )}

          {!isPip && (
            <button
              type="button"
              disabled={!streamAvailable || streamLoading}
              className={`px-4 py-1.5 rounded-md font-bold text-[12px] uppercase tracking-wider transition-all cursor-pointer disabled:opacity-50 disabled:cursor-wait ${
                streamLive
                  ? "bg-red-500 text-white hover:bg-red-600 shadow-[0_0_12px_rgba(239,68,68,0.3)]"
                  : "bg-accent text-white hover:bg-accent/80 shadow-[0_0_12px_rgba(99,102,241,0.3)]"
              }`}
              onClick={toggleStream}
            >
              {streamLoading ? "..." : streamLive ? "End Stream" : "Go Live"}
            </button>
          )}
        </div>
      </div>

      {/* ═══════════════ MAIN AREA ═══════════════ */}
      <div className="flex flex-1 min-h-0">
        {/* ── Left: Scene Sidebar ── */}
        {!isPip && (
          <div className="w-[110px] min-w-[110px] bg-bg-accent border-r border-border flex flex-col py-3 px-2 gap-1.5 shrink-0 overflow-y-auto">
            {/* Auto-detect badge */}
            {isManualOverride && (
              <button
                type="button"
                onClick={() => setActiveScene(null)}
                className="flex items-center gap-1 px-2 py-1 mb-1 rounded-md bg-accent-subtle text-accent text-[9px] font-bold uppercase tracking-wider cursor-pointer hover:bg-accent-subtle transition-colors"
              >
                <RotateCcw className="w-3 h-3" />
                Auto
              </button>
            )}

            <div className="text-[9px] uppercase tracking-widest text-muted font-semibold px-1">
              Content
            </div>
            {CONTENT_SCENES.map((scene) => {
              const isSelected = activeSceneId === scene.id;
              const isAutoActive = mode === scene.id && !isManualOverride;
              const isAvailable =
                scene.id !== "gaming" || activeGameViewerUrl.trim();
              const Icon = scene.icon;
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => setActiveScene(scene.id)}
                  className={`relative rounded-lg overflow-hidden transition-all text-left cursor-pointer ${
                    isSelected
                      ? "ring-2 ring-accent shadow-[0_0_8px_rgba(99,102,241,0.3)]"
                      : isAutoActive
                        ? "ring-1 ring-accent/40"
                        : isAvailable
                          ? "ring-1 ring-border-strong hover:ring-accent/50"
                          : "ring-1 ring-border opacity-40"
                  }`}
                >
                  <div
                    className={`aspect-video flex items-center justify-center ${
                      isSelected
                        ? "bg-accent-subtle"
                        : "bg-bg-elevated"
                    }`}
                  >
                    <Icon
                      className={`w-5 h-5 ${isSelected ? "text-accent" : "text-muted"}`}
                    />
                  </div>
                  <div className="px-1.5 py-1 bg-bg-accent">
                    <span
                      className={`text-[10px] font-medium ${isSelected ? "text-accent" : "text-muted-strong"}`}
                    >
                      {scene.label}
                    </span>
                  </div>
                  {isAutoActive && !isSelected && (
                    <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-emerald-400 shadow-[0_0_4px_rgba(52,211,153,0.8)]" title="Auto-detected" />
                  )}
                  {isSelected && (
                    <div className="absolute top-1 left-1 w-1.5 h-1.5 rounded-full bg-accent shadow-[0_0_4px_rgba(99,102,241,0.8)]" />
                  )}
                </button>
              );
            })}

            <div className="text-[9px] uppercase tracking-widest text-muted font-semibold px-1 mt-2">
              Broadcast
            </div>
            {BROADCAST_SCENES.map((scene) => {
              const isSelected = activeSceneId === scene.id;
              const Icon = scene.icon;
              return (
                <button
                  key={scene.id}
                  type="button"
                  onClick={() => setActiveScene(scene.id)}
                  className={`relative rounded-lg overflow-hidden transition-all text-left cursor-pointer ${
                    isSelected
                      ? "ring-2 ring-amber-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]"
                      : "ring-1 ring-border-strong hover:ring-amber-500/50"
                  }`}
                >
                  <div
                    className={`aspect-video flex items-center justify-center ${
                      isSelected
                        ? "bg-gradient-to-br from-amber-600/20 to-orange-600/20"
                        : "bg-bg-elevated"
                    }`}
                  >
                    <Icon
                      className={`w-4 h-4 ${isSelected ? "text-amber-400" : "text-muted"}`}
                    />
                  </div>
                  <div className="px-1.5 py-1 bg-bg-accent">
                    <span
                      className={`text-[9px] font-medium ${isSelected ? "text-amber-400" : "text-muted"}`}
                    >
                      {scene.label}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {/* ── Center: Stream Preview Canvas ── */}
        <div className="flex-1 min-w-0 flex flex-col bg-bg">
          <div className="flex-1 min-h-0 p-3 lg:p-4">
            <div
              className="relative w-full h-full rounded-xl overflow-hidden"
              style={{
                boxShadow: streamLive
                  ? "0 0 30px rgba(99, 102, 241, 0.3), inset 0 0 30px rgba(99, 102, 241, 0.05)"
                  : "0 0 20px rgba(99, 102, 241, 0.15), inset 0 0 20px rgba(99, 102, 241, 0.03)",
                border: streamLive
                  ? "2px solid rgba(99, 102, 241, 0.5)"
                  : "2px solid rgba(99, 102, 241, 0.2)",
              }}
            >
              <div className="absolute inset-0" style={{ background: bgColor }} />
              {/* Background: gradient preset or uploaded image */}
              {bgGradient && (
                <div
                  className="absolute inset-0"
                  style={{ background: bgGradient }}
                />
              )}
              {bgImageUrl && !bgGradient && (
                <div
                  className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                  style={{ backgroundImage: `url(${bgImageUrl})`, opacity: bgOpacity }}
                />
              )}
              <div className="relative w-full h-full">
                {!streamAvailable ? (
                  <div className="h-full flex items-center justify-center p-6">
                    <div className="max-w-sm text-center">
                      <div className="w-16 h-16 rounded-full bg-bg-elevated flex items-center justify-center mx-auto mb-4">
                        <Radio className="w-7 h-7 text-muted" />
                      </div>
                      <p className="text-[10px] uppercase tracking-[0.24em] text-muted mb-2">
                        Streaming unavailable
                      </p>
                      <h2 className="text-lg font-semibold text-txt-strong mb-2">
                        Enable the streaming plugin
                      </h2>
                      <p className="text-[13px] leading-6 text-muted">
                        Install and enable the{" "}
                        <code className="text-accent bg-accent-subtle px-1.5 py-0.5 rounded text-[12px]">
                          streaming-base
                        </code>{" "}
                        plugin, then reload.
                      </p>
                    </div>
                  </div>
                ) : isBroadcastScene(activeSceneId) ? (
                  <BroadcastSlate
                    scene={scenes.scenes[activeSceneId]}
                    agentName={agentName}
                  />
                ) : activeSceneId === "gaming" ? (
                  <iframe
                    src={activeGameViewerUrl}
                    title="Game"
                    className="w-full h-full border-0"
                    sandbox={
                      activeGameSandbox ||
                      "allow-scripts allow-same-origin allow-popups"
                    }
                  />
                ) : activeSceneId === "terminal" ? (
                  <StreamTerminal />
                ) : activeSceneId === "chatting" ? (
                  <ChatContent
                    events={autonomousEvents.slice(-20)}
                    messages={conversationMessages}
                  />
                ) : (
                  <IdleContent events={autonomousEvents.slice(-20)} />
                )}

                <OverlayLayer
                  layout={layout}
                  events={autonomousEvents}
                  agentMode={mode}
                  agentName={agentName}
                  editable={editMode}
                  onMoveWidget={moveWidget}
                />

                <AvatarPip isSpeaking={chatAvatarSpeaking} displayMode={avatarDisplayMode} />

                {/* Agent name overlay */}
                {!isPip && (
                  <div className="absolute bottom-4 left-4 z-10 pointer-events-none">
                    <div className="text-lg font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.8)]">
                      {agentName}
                    </div>
                    <div className="text-[12px] text-txt/80 drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)]">
                      {modeLabel.toLowerCase()}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          <ChatTicker events={autonomousEvents} />
        </div>

        {/* ── Right: Tool Sidebar ── */}
        {!isPip && (
          <div className="flex shrink-0">
            {/* Expandable panel */}
            {activePanel && activePanel !== "activity" && (
              <div className="w-[280px] xl:w-[300px] border-l border-border">
                {/* ── Scene panel ── */}
                {activePanel === "scene" && (
                  <SidePanel title="Scene Setup">
                    <p className="text-[11px] text-muted leading-relaxed">
                      Click scenes in the sidebar to switch. Content scenes
                      auto-detect by default. Broadcast scenes are for transitions.
                    </p>

                    {/* Current scene info */}
                    {(() => {
                      const current = ALL_SCENES.find((s) => s.id === activeSceneId);
                      if (!current) return null;
                      const Icon = current.icon;
                      return (
                        <div className="rounded-lg p-3 bg-accent-subtle border border-accent/30">
                          <div className="flex items-center gap-2 mb-1">
                            <Icon className="w-4 h-4 text-accent" />
                            <span className="text-[13px] font-medium text-accent">
                              {current.label}
                            </span>
                            <span className="ml-auto text-[9px] uppercase tracking-wider font-bold text-accent bg-accent-subtle px-1.5 py-0.5 rounded-full">
                              {isManualOverride ? "Manual" : "Auto"}
                            </span>
                          </div>
                          <p className="text-[11px] text-muted leading-relaxed">
                            {current.description}
                          </p>
                        </div>
                      );
                    })()}

                    {/* Broadcast slate config */}
                    {isBroadcastScene(activeSceneId) && (() => {
                      const scene = scenes.scenes[activeSceneId];
                      const slate = scene?.slate;
                      return (
                        <div className="space-y-2 border-t border-border-strong pt-3">
                          <div className="text-[11px] text-muted font-medium">Slate Text</div>
                          <input
                            type="text"
                            value={slate?.text ?? ""}
                            onChange={(e) => updateSlate(activeSceneId, { text: e.target.value })}
                            className="w-full bg-bg-elevated border border-border-strong text-txt text-[12px] rounded-md px-2 py-1.5 outline-none focus:border-accent"
                            placeholder="Main text"
                          />
                          <input
                            type="text"
                            value={slate?.subtext ?? ""}
                            onChange={(e) => updateSlate(activeSceneId, { subtext: e.target.value })}
                            className="w-full bg-bg-elevated border border-border-strong text-txt text-[12px] rounded-md px-2 py-1.5 outline-none focus:border-accent"
                            placeholder="Subtext (optional)"
                          />
                          <div className="flex gap-2">
                            <label className="flex items-center gap-1.5 text-[11px] text-muted">
                              BG
                              <input
                                type="color"
                                value={slate?.backgroundColor ?? "#0e1118"}
                                onChange={(e) => updateSlate(activeSceneId, { backgroundColor: e.target.value })}
                                className="w-6 h-5 rounded border border-border-strong cursor-pointer bg-transparent"
                              />
                            </label>
                            <label className="flex items-center gap-1.5 text-[11px] text-muted">
                              Text
                              <input
                                type="color"
                                value={slate?.textColor ?? "#ffffff"}
                                onChange={(e) => updateSlate(activeSceneId, { textColor: e.target.value })}
                                className="w-6 h-5 rounded border border-border-strong cursor-pointer bg-transparent"
                              />
                            </label>
                          </div>
                        </div>
                      );
                    })()}

                    {/* Edit mode toggle */}
                    <div className="border-t border-border-strong pt-3">
                      <label className="flex items-center gap-2 text-[12px] text-txt cursor-pointer">
                        <button
                          type="button"
                          onClick={() => setEditMode((v) => !v)}
                          className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 cursor-pointer ${
                            editMode ? "bg-accent" : "bg-border-strong"
                          }`}
                        >
                          <span
                            className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                              editMode ? "translate-x-4" : "translate-x-0.5"
                            }`}
                          />
                        </button>
                        Edit Layout (drag widgets)
                      </label>
                    </div>

                    {/* Copy layout between scenes */}
                    <div className="border-t border-border-strong pt-3">
                      <div className="text-[11px] text-muted font-medium mb-1.5">
                        Copy Layout From
                      </div>
                      <div className="flex flex-wrap gap-1">
                        {ALL_SCENES.filter((s) => s.id !== activeSceneId).map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => copyLayoutToScene(s.id, activeSceneId)}
                            className="px-2 py-1 rounded text-[10px] text-muted-strong bg-bg-elevated hover:bg-bg-hover hover:text-txt-strong cursor-pointer transition-colors"
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <p className="text-[10px] text-muted mt-2">
                        Each scene auto-saves its widget layout. The agent can switch scenes with SET_SCENE.
                      </p>
                  </SidePanel>
                )}

                {/* ── Presets panel ── */}
                {activePanel === "presets" && (
                  <SidePanel title="Scene Presets">
                    <p className="text-[11px] text-muted leading-relaxed">
                      Save all scene layouts, widgets, and backgrounds as a named preset. Load a preset to instantly restore a full configuration.
                    </p>

                    {/* Save new preset */}
                    <div className="rounded-lg border border-border-strong bg-bg-elevated/50 p-3 space-y-2">
                      <div className="text-[11px] text-txt font-medium">Save Current Setup</div>
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          placeholder="My streaming setup..."
                          className="flex-1 bg-bg border border-border-strong text-txt text-[12px] rounded-md px-2.5 py-1.5 outline-none focus:border-accent"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              const input = e.currentTarget;
                              if (input.value.trim()) {
                                savePreset(input.value.trim());
                                input.value = "";
                              }
                            }
                          }}
                          ref={presetNameRef}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const input = presetNameRef.current;
                            if (input?.value.trim()) {
                              savePreset(input.value.trim());
                              input.value = "";
                            }
                          }}
                          className="px-3 py-1.5 rounded-md bg-accent text-white text-[11px] font-semibold hover:bg-accent/80 cursor-pointer transition-colors"
                        >
                          Save
                        </button>
                      </div>
                    </div>

                    {/* Saved presets list */}
                    {presetNames.length === 0 ? (
                      <div className="text-center py-6 border border-dashed border-border-strong rounded-lg">
                        <Bookmark className="w-6 h-6 text-muted mx-auto mb-2" />
                        <p className="text-[12px] text-muted">No saved presets yet</p>
                        <p className="text-[10px] text-muted mt-1">
                          Save your current scene configuration above
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        <div className="text-[11px] text-muted font-medium">
                          Saved Presets ({presetNames.length})
                        </div>
                        {presetNames.map((name) => (
                          <div
                            key={name}
                            className="flex items-center gap-2 px-3 py-2.5 rounded-lg bg-bg-elevated border border-border-strong"
                          >
                            <Bookmark className="w-3.5 h-3.5 text-accent shrink-0" />
                            <span className="flex-1 text-[12px] text-txt font-medium truncate">{name}</span>
                            <button
                              type="button"
                              onClick={() => loadPreset(name)}
                              className="px-2.5 py-1 rounded-md text-[10px] font-semibold text-accent bg-accent-subtle hover:bg-accent/20 cursor-pointer transition-colors"
                            >
                              Load
                            </button>
                            <button
                              type="button"
                              onClick={() => deletePreset(name)}
                              className="px-2 py-1 rounded-md text-[10px] font-semibold text-red-400 bg-red-500/10 hover:bg-red-500/20 cursor-pointer transition-colors"
                            >
                              Delete
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="border-t border-border-strong pt-3">
                      <p className="text-[10px] text-muted leading-relaxed">
                        Presets include all scene layouts, widget positions, backgrounds, and slate text. They are saved locally and can be shared by exporting.
                      </p>
                    </div>
                  </SidePanel>
                )}

                {/* ── Widgets panel ── */}
                {activePanel === "widgets" && (
                  <SidePanel title="Overlay Widgets">
                    <div className="flex items-center justify-between">
                      <p className="text-[11px] text-muted">
                        Toggle widgets shown on your stream.
                      </p>
                      <button
                        type="button"
                        onClick={resetLayout}
                        className="text-[10px] text-muted hover:text-red-400 transition-colors cursor-pointer"
                      >
                        Reset
                      </button>
                    </div>
                    {layout.widgets.length === 0 ? (
                      <div className="text-[12px] text-muted border border-border-strong rounded-lg p-4 text-center">
                        No widgets available.
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {layout.widgets.map((instance) => (
                          <WidgetRow
                            key={instance.id}
                            instance={instance}
                            onToggle={() => toggleWidget(instance.id)}
                            onUpdate={(patch) => updateWidget(instance.id, patch)}
                          />
                        ))}
                      </div>
                    )}
                  </SidePanel>
                )}

                {/* ── Channel / Destinations panel ── */}
                {activePanel === "channel" && (
                  <SidePanel title="Channel">
                    <p className="text-[11px] text-muted">
                      Select where to broadcast. Stop the stream to switch.
                    </p>
                    {destinations.length === 0 && streamingPlugins.every((p) => !p.enabled) ? (
                      <div className="text-[12px] text-muted border border-border-strong rounded-lg p-4 text-center">
                        No destinations configured.
                        <br />
                        <span className="text-[11px]">
                          Enable a streaming plugin below to add destinations.
                        </span>
                      </div>
                    ) : destinations.length === 0 ? (
                      <div className="text-[12px] text-muted border border-border-strong rounded-lg p-4 text-center">
                        No destinations available.
                        <br />
                        <span className="text-[11px]">
                          Configure the required settings for your enabled plugins below.
                        </span>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        {destinations.map((d) => {
                          const active = d.id === activeDestination?.id;
                          return (
                            <button
                              key={d.id}
                              type="button"
                              disabled={streamLive}
                              onClick={() => handleDestinationChange(d.id)}
                              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed text-left ${
                                active
                                  ? "border-accent/50 bg-accent-subtle"
                                  : "border-border-strong bg-bg-elevated/50 hover:border-accent/30"
                              }`}
                            >
                              <span
                                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                  active
                                    ? "bg-accent shadow-[0_0_6px_rgba(99,102,241,0.6)]"
                                    : "bg-border-strong"
                                }`}
                              />
                              <span
                                className={`text-[13px] font-medium ${active ? "text-accent" : "text-txt"}`}
                              >
                                {d.name}
                              </span>
                              {active && (
                                <span className="ml-auto text-[9px] uppercase tracking-wider font-bold text-accent">
                                  Active
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                    {streamLive && (
                      <p className="text-[11px] text-amber-400 border border-amber-500/30 rounded-lg px-3 py-1.5 bg-amber-500/5">
                        Stream is live. Stop to switch channels.
                      </p>
                    )}

                    {/* ── Streaming Plugins ── */}
                    <div className="border-t border-border-strong pt-3">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Plug className="w-3.5 h-3.5 text-muted" />
                        <span className="text-[11px] text-muted font-medium">
                          Streaming Plugins
                        </span>
                      </div>

                      {streamingPlugins.length === 0 ? (
                        <p className="text-[11px] text-muted">
                          No streaming plugins installed.
                        </p>
                      ) : (
                        <div className="flex flex-col gap-2">
                          {streamingPlugins.map((plugin) => {
                            const isToggling = togglingPlugin === plugin.id;
                            const isExpanded = expandedPlugin === plugin.id;
                            const requiredParams = plugin.parameters?.filter(
                              (p: PluginParamDef) => p.required && !p.isSet,
                            ) ?? [];
                            const needsConfig = plugin.enabled && requiredParams.length > 0;

                            return (
                              <div
                                key={plugin.id}
                                className={`rounded-lg border transition-colors ${
                                  plugin.enabled
                                    ? needsConfig
                                      ? "border-amber-500/30 bg-amber-500/5"
                                      : "border-accent/30 bg-accent-subtle/50"
                                    : "border-border-strong bg-bg-elevated/50"
                                }`}
                              >
                                <div className="flex items-center gap-2.5 px-3 py-2.5">
                                  <button
                                    type="button"
                                    disabled={isToggling}
                                    onClick={() => handleTogglePlugin(plugin)}
                                    className={`relative w-8 h-4 rounded-full transition-colors flex-shrink-0 cursor-pointer disabled:opacity-50 ${
                                      plugin.enabled ? "bg-accent" : "bg-border-strong"
                                    }`}
                                  >
                                    <span
                                      className={`absolute top-0.5 w-3 h-3 rounded-full bg-white shadow transition-transform ${
                                        plugin.enabled ? "translate-x-4" : "translate-x-0.5"
                                      }`}
                                    />
                                  </button>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-[12px] font-medium text-txt truncate">
                                      {plugin.name}
                                    </div>
                                    {needsConfig && (
                                      <div className="text-[10px] text-amber-400">
                                        Needs configuration
                                      </div>
                                    )}
                                  </div>
                                  {plugin.enabled && plugin.parameters?.length > 0 && (
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setExpandedPlugin(isExpanded ? null : plugin.id)
                                      }
                                      className="text-[10px] text-muted hover:text-txt cursor-pointer transition-colors"
                                    >
                                      {isExpanded ? "Hide" : "Config"}
                                    </button>
                                  )}
                                </div>

                                {/* Plugin parameters */}
                                {isExpanded && plugin.parameters?.length > 0 && (
                                  <div className="px-3 pb-3 pt-1 border-t border-border-strong/50 space-y-2">
                                    {plugin.parameters.map((param: PluginParamDef) => (
                                      <div key={param.key}>
                                        <label className="text-[10px] text-muted font-medium block mb-0.5">
                                          {param.description || param.key}
                                          {param.required && (
                                            <span className="text-red-400 ml-0.5">*</span>
                                          )}
                                        </label>
                                        <input
                                          type={param.sensitive ? "password" : "text"}
                                          defaultValue={param.currentValue ?? ""}
                                          placeholder={param.default || param.key}
                                          className="w-full bg-bg border border-border-strong text-txt text-[11px] rounded-md px-2 py-1.5 outline-none focus:border-accent"
                                          onBlur={(e) => {
                                            const val = e.target.value.trim();
                                            if (val !== (param.currentValue ?? "")) {
                                              handleSavePluginParam(plugin.id, param.key, val);
                                            }
                                          }}
                                          onKeyDown={(e) => {
                                            if (e.key === "Enter") {
                                              const val = (e.target as HTMLInputElement).value.trim();
                                              handleSavePluginParam(plugin.id, param.key, val);
                                            }
                                          }}
                                        />
                                      </div>
                                    ))}
                                    <p className="text-[9px] text-muted">
                                      Changes may require a restart to take effect.
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </SidePanel>
                )}

                {/* ── Source panel ── */}
                {activePanel === "source" && (
                  <SidePanel title="Stream Source">
                    <p className="text-[11px] text-muted">
                      Choose what content is captured.
                    </p>
                    {(["stream-tab", "game", "custom-url"] as StreamSourceType[]).map(
                      (st) => {
                        const isGame = st === "game";
                        const disabled =
                          !streamAvailable ||
                          (isGame && !activeGameViewerUrl.trim());
                        const active = streamSource.type === st;

                        return (
                          <div key={st}>
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => {
                                if (st !== "custom-url") {
                                  handleSourceChange(
                                    st,
                                    isGame ? activeGameViewerUrl : undefined,
                                  );
                                }
                              }}
                              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg border transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed text-left ${
                                active && st !== "custom-url"
                                  ? "border-accent/50 bg-accent-subtle"
                                  : "border-border-strong bg-bg-elevated/50 hover:border-accent/30"
                              }`}
                            >
                              <span
                                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                                  active && st !== "custom-url"
                                    ? "bg-accent"
                                    : "bg-border-strong"
                                }`}
                              />
                              <div>
                                <div
                                  className={`text-[13px] font-medium ${active && st !== "custom-url" ? "text-accent" : "text-txt"}`}
                                >
                                  {STREAM_SOURCE_LABELS[st]}
                                </div>
                                <div className="text-[10px] text-muted">
                                  {st === "stream-tab" && "Capture stream tab (default)"}
                                  {st === "game" &&
                                    (activeGameViewerUrl.trim()
                                      ? `Active: ${activeGameViewerUrl.slice(0, 40)}...`
                                      : "No game active")}
                                  {st === "custom-url" && "Broadcast from a custom URL"}
                                </div>
                              </div>
                            </button>

                            {st === "custom-url" && (
                              <div
                                className={`mt-1.5 flex items-center gap-2 px-3 py-2 rounded-lg border ${
                                  streamSource.type === "custom-url"
                                    ? "border-accent/50 bg-accent-subtle"
                                    : "border-border-strong bg-bg-elevated/50"
                                }`}
                              >
                                <input
                                  type="text"
                                  placeholder="https://your-url.com"
                                  value={customUrlInput}
                                  onChange={(e) => setCustomUrlInput(e.target.value)}
                                  className="flex-1 bg-transparent text-txt text-[12px] outline-none placeholder:text-muted"
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter" && customUrlValid) {
                                      handleSourceChange("custom-url", trimmedCustomUrl);
                                    }
                                  }}
                                />
                                <button
                                  type="button"
                                  disabled={!customUrlValid}
                                  onClick={() => {
                                    if (customUrlValid) {
                                      handleSourceChange("custom-url", trimmedCustomUrl);
                                    }
                                  }}
                                  className="px-2 py-1 rounded bg-accent-subtle text-accent text-[11px] font-semibold hover:bg-accent/20 transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  Use
                                </button>
                              </div>
                            )}
                            {st === "custom-url" && trimmedCustomUrl && !customUrlValid && (
                              <p className="mt-1 px-1 text-[10px] text-red-400">
                                Must start with http:// or https://
                              </p>
                            )}
                          </div>
                        );
                      },
                    )}
                  </SidePanel>
                )}

                {/* ── Voice panel ── */}
                {activePanel === "voice" && (
                  <SidePanel title="Voice / TTS">
                    <StreamVoiceConfig streamLive={streamLive} />
                  </SidePanel>
                )}

                {/* ── Theme panel ── */}
                {activePanel === "theme" && (
                  <SidePanel title="Theme & Settings">
                    <div className="flex flex-col gap-3">
                      {/* Theme selector — uses actual app themes */}
                      <div>
                        <span className="text-[11px] text-muted font-medium block mb-1.5">
                          Stream Theme
                        </span>
                        <div className="grid grid-cols-2 gap-1.5">
                          {THEMES.map((t) => {
                            const isActive = streamTheme === t.id;
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => saveThemeSettings(t.id, avatarIndex)}
                                className={`px-2.5 py-2 rounded-lg text-left transition-all cursor-pointer ${
                                  isActive
                                    ? "bg-accent-subtle border border-accent/40"
                                    : "bg-bg-elevated/60 border border-border-strong hover:border-accent/30"
                                }`}
                              >
                                <div
                                  className={`text-[11px] font-medium ${isActive ? "text-accent" : "text-txt"}`}
                                >
                                  {t.label}
                                </div>
                                <div className="text-[9px] text-muted">
                                  {t.hint}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Avatar selector — shows actual VRM avatars */}
                      <div className="border-t border-border-strong pt-3">
                        <div className="flex items-center justify-between mb-1.5">
                          <span className="text-[11px] text-muted font-medium">
                            Avatar ({getVrmTitle(avatarIndex || 1)})
                          </span>
                          {/* Display mode toggle */}
                          <div className="flex rounded-md overflow-hidden border border-border-strong">
                            <button
                              type="button"
                              onClick={() => toggleAvatarDisplay("pip")}
                              className={`px-2 py-0.5 text-[9px] font-medium cursor-pointer transition-colors ${
                                avatarDisplayMode === "pip"
                                  ? "bg-accent-subtle text-accent"
                                  : "text-muted hover:text-txt"
                              }`}
                              title="Small avatar in corner"
                            >
                              PIP
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleAvatarDisplay("full")}
                              className={`px-2 py-0.5 text-[9px] font-medium cursor-pointer transition-colors ${
                                avatarDisplayMode === "full"
                                  ? "bg-accent-subtle text-accent"
                                  : "text-muted hover:text-txt"
                              }`}
                              title="Full-size avatar on canvas"
                            >
                              Full
                            </button>
                          </div>
                        </div>
                        <div className="grid grid-cols-4 gap-1 max-h-[200px] overflow-y-auto pr-1">
                          {Array.from({ length: VRM_COUNT }, (_, i) => i + 1).map(
                            (idx) => {
                              const isActive = avatarIndex === idx;
                              return (
                                <button
                                  key={idx}
                                  type="button"
                                  onClick={() => saveThemeSettings(streamTheme, idx)}
                                  className={`relative rounded-md overflow-hidden aspect-square transition-all cursor-pointer ${
                                    isActive
                                      ? "ring-2 ring-accent shadow-[0_0_6px_rgba(99,102,241,0.4)]"
                                      : "ring-1 ring-border-strong hover:ring-accent/40"
                                  }`}
                                  title={getVrmTitle(idx)}
                                >
                                  <img
                                    src={getVrmPreviewUrl(idx)}
                                    alt={getVrmTitle(idx)}
                                    className="w-full h-full object-cover bg-bg-elevated"
                                    loading="lazy"
                                  />
                                  {isActive && (
                                    <div className="absolute inset-0 bg-accent-subtle" />
                                  )}
                                </button>
                              );
                            },
                          )}
                        </div>
                      </div>

                      {/* Stream info */}
                      <div className="border-t border-border-strong pt-3">
                        <div className="text-[11px] text-muted font-medium mb-2">
                          Stream Info
                        </div>
                        <div className="space-y-1 text-[11px] text-muted">
                          <div className="flex justify-between">
                            <span>Status</span>
                            <span className={streamLive ? "text-red-400" : "text-muted-strong"}>
                              {streamLive ? "LIVE" : "Offline"}
                            </span>
                          </div>
                          {streamLive && (
                            <>
                              <div className="flex justify-between">
                                <span>Uptime</span>
                                <span className="text-muted-strong font-mono">
                                  {formatUptime(uptime)}
                                </span>
                              </div>
                              <div className="flex justify-between">
                                <span>Frames</span>
                                <span className="text-muted-strong font-mono">
                                  {frameCount.toLocaleString()}
                                </span>
                              </div>
                              {audioSource && (
                                <div className="flex justify-between">
                                  <span>Audio</span>
                                  <span className="text-muted-strong">
                                    {audioSource}
                                  </span>
                                </div>
                              )}
                            </>
                          )}
                          {activeDestination && (
                            <div className="flex justify-between">
                              <span>Destination</span>
                              <span className="text-muted-strong">
                                {activeDestination.name}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Permissions */}
                      <div className="border-t border-border-strong pt-3">
                        <div className="text-[11px] text-muted font-medium mb-2">
                          Permissions
                        </div>
                        {permissions ? (
                          <div className="space-y-1.5">
                            {(
                              [
                                { id: "microphone" as SystemPermissionId, label: "Microphone", desc: "Voice input / talk mode" },
                                { id: "camera" as SystemPermissionId, label: "Camera", desc: "Video capture" },
                                { id: "screen-recording" as SystemPermissionId, label: "Screen Capture", desc: "Screen recording" },
                              ] as const
                            )
                              .filter((p) => {
                                const s = permissions[p.id];
                                return s && s.status !== "not-applicable";
                              })
                              .map((p) => {
                                const s = permissions[p.id];
                                const status: PermStatus = s?.status ?? "not-determined";
                                const granted = status === "granted";
                                const canReq = s?.canRequest ?? false;
                                return (
                                  <div
                                    key={p.id}
                                    className="flex items-center gap-2 px-2.5 py-2 rounded-lg bg-bg-elevated/50 border border-border-strong"
                                  >
                                    <span
                                      className={`w-2 h-2 rounded-full shrink-0 ${
                                        granted
                                          ? "bg-emerald-400"
                                          : status === "denied"
                                            ? "bg-red-400"
                                            : "bg-amber-400"
                                      }`}
                                    />
                                    <div className="flex-1 min-w-0">
                                      <div className="text-[11px] font-medium text-txt">
                                        {p.label}
                                      </div>
                                      <div className="text-[9px] text-muted">
                                        {p.desc}
                                      </div>
                                    </div>
                                    <span
                                      className={`text-[9px] font-medium ${
                                        granted
                                          ? "text-emerald-400"
                                          : status === "denied"
                                            ? "text-red-400"
                                            : "text-amber-400"
                                      }`}
                                    >
                                      {granted ? "Granted" : status === "denied" ? "Denied" : "Not set"}
                                    </span>
                                    {!granted && (
                                      <button
                                        type="button"
                                        onClick={() =>
                                          canReq
                                            ? handleRequestPermission(p.id)
                                            : handleOpenPermissionSettings(p.id)
                                        }
                                        className="px-1.5 py-0.5 rounded text-[9px] font-medium text-accent bg-accent-subtle hover:bg-accent/20 cursor-pointer transition-colors"
                                      >
                                        {canReq ? "Allow" : "Settings"}
                                      </button>
                                    )}
                                  </div>
                                );
                              })}
                          </div>
                        ) : (
                          <p className="text-[10px] text-muted">
                            Permission info unavailable (requires Electron).
                          </p>
                        )}
                      </div>
                    </div>
                  </SidePanel>
                )}

                {/* ── Background panel ── */}
                {activePanel === "background" && (
                  <SidePanel title="Background">
                    <p className="text-[11px] text-muted">
                      Upload a custom background image for your stream canvas.
                      Supports PNG, JPEG, and WebP (max 10 MB).
                    </p>

                    {bgImageUrl ? (
                      <div className="space-y-2">
                        <div
                          className="aspect-video rounded-lg bg-cover bg-center border border-border-strong overflow-hidden"
                          style={{ backgroundImage: `url(${bgImageUrl})` }}
                        />
                        <div className="flex gap-2">
                          <label className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-bg-elevated text-txt text-[12px] hover:bg-bg-hover transition-colors cursor-pointer border border-border-strong">
                            <Image className="w-3.5 h-3.5" />
                            Replace
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="hidden"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) uploadBackground(file);
                              }}
                            />
                          </label>
                          <button
                            type="button"
                            onClick={removeBackground}
                            className="px-3 py-2 rounded-lg bg-red-500/10 text-red-400 text-[12px] hover:bg-red-500/20 transition-colors cursor-pointer border border-red-500/20"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    ) : (
                      <label className="flex flex-col items-center justify-center gap-2 py-8 rounded-lg border-2 border-dashed border-border-strong hover:border-accent/40 transition-colors cursor-pointer">
                        <Image className="w-8 h-8 text-muted" />
                        <span className="text-[12px] text-muted">
                          {bgUploading ? "Uploading..." : "Click to upload"}
                        </span>
                        <span className="text-[10px] text-muted">
                          PNG, JPEG, or WebP
                        </span>
                        <input
                          type="file"
                          accept="image/png,image/jpeg,image/webp"
                          className="hidden"
                          disabled={bgUploading}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) uploadBackground(file);
                          }}
                        />
                      </label>
                    )}

                    <div className="border-t border-border-strong pt-3">
                      <div className="text-[11px] text-muted font-medium mb-2">
                        Preset Gradients
                      </div>
                      <div className="grid grid-cols-3 gap-1.5">
                        {[
                          { label: "None", bg: "#12151f" },
                          { label: "Indigo", bg: "linear-gradient(135deg, #1e1b4b 0%, #312e81 50%, #1e1b4b 100%)" },
                          { label: "Purple", bg: "linear-gradient(135deg, #2e1065 0%, #581c87 50%, #2e1065 100%)" },
                          { label: "Ocean", bg: "linear-gradient(135deg, #0c1222 0%, #1e3a5f 50%, #0c1222 100%)" },
                          { label: "Emerald", bg: "linear-gradient(135deg, #022c22 0%, #065f46 50%, #022c22 100%)" },
                          { label: "Sunset", bg: "linear-gradient(135deg, #1a0a2e 0%, #7c2d12 50%, #1a0a2e 100%)" },
                        ].map((preset) => (
                          <button
                            key={preset.label}
                            type="button"
                            className={`aspect-video rounded-md border transition-colors cursor-pointer overflow-hidden ${
                              bgGradient === preset.bg || (!bgGradient && !bgImageUrl && preset.label === "None")
                                ? "border-accent ring-1 ring-accent/50"
                                : "border-border-strong hover:border-accent/50"
                            }`}
                            title={preset.label}
                            onClick={() => {
                              if (preset.label === "None") {
                                removeBackground();
                              } else {
                                setPresetGradient(preset.bg);
                              }
                            }}
                          >
                            <div
                              className="w-full h-full"
                              style={{ background: preset.bg }}
                            />
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-border-strong pt-3">
                      <div className="text-[11px] text-muted font-medium mb-1.5">
                        Custom Widgets
                      </div>
                      <p className="text-[11px] text-muted leading-relaxed">
                        You can add fully custom overlays using the{" "}
                        <span className="text-accent">Custom HTML</span>{" "}
                        widget in the Widgets panel. It supports inline
                        HTML/CSS/JS or an external URL, sandboxed for security.
                      </p>
                    </div>
                  </SidePanel>
                )}
              </div>
            )}

            {/* Activity panel (special — uses its own component) */}
            {activePanel === "activity" && (
              <div className="w-[280px] xl:w-[320px] border-l border-border">
                <ActivityFeed events={feedEvents} />
              </div>
            )}

            {/* Icon toolbar */}
            <div className="w-[56px] min-w-[56px] bg-bg-accent border-l border-border flex flex-col items-center py-3 gap-0.5">
              {TOOL_ITEMS.map((tool) => {
                const isActive = activePanel === tool.id;
                const Icon = tool.icon;
                return (
                  <button
                    key={tool.id}
                    type="button"
                    className={`w-11 h-11 rounded-lg flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer group ${
                      isActive
                        ? "bg-accent-subtle text-accent"
                        : "text-muted hover:text-txt hover:bg-bg-elevated"
                    }`}
                    title={tool.label}
                    onClick={() => toggleToolPanel(tool.id)}
                  >
                    <Icon className="w-4 h-4" />
                    <span
                      className={`text-[8px] leading-none font-medium ${
                        isActive ? "text-accent" : "text-muted group-hover:text-muted-strong"
                      }`}
                    >
                      {tool.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ═══════════════ BOTTOM CONTROL BAR ═══════════════ */}
      {!isPip && (
        <div className="flex items-center justify-between px-4 py-2.5 bg-bg-accent border-t border-border shrink-0">
          {/* Left: quick access */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] transition-colors cursor-pointer ${
                activePanel === "activity"
                  ? "bg-accent-subtle text-accent"
                  : "bg-bg-elevated text-muted-strong hover:text-txt-strong hover:bg-bg-hover"
              }`}
              onClick={() => toggleToolPanel("activity")}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Activity</span>
            </button>
          </div>

          {/* Center: controls */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!streamAvailable}
              onClick={handleToggleMute}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                muted
                  ? "bg-red-500 text-white shadow-[0_0_12px_rgba(239,68,68,0.3)]"
                  : "bg-bg-elevated text-muted-strong hover:text-txt-strong hover:bg-bg-hover"
              }`}
              title={muted ? "Unmute" : "Mute"}
            >
              {muted ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>

            <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-bg-elevated">
              {muted ? (
                <VolumeX className="w-3.5 h-3.5 text-muted" />
              ) : (
                <Volume2 className="w-3.5 h-3.5 text-muted-strong" />
              )}
              <input
                type="range"
                min={0}
                max={100}
                value={muted ? 0 : volume}
                disabled={!streamAvailable}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-20 h-1 accent-accent cursor-pointer"
                title={`Volume: ${muted ? 0 : volume}%`}
              />
            </div>

            <button
              type="button"
              disabled={!streamAvailable}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-bg-elevated text-muted-strong hover:text-txt-strong hover:bg-bg-hover transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Stream source"
              onClick={() => toggleToolPanel("source")}
            >
              <Monitor className="w-4 h-4" />
            </button>

            <button
              type="button"
              className="w-10 h-10 rounded-full flex items-center justify-center bg-bg-elevated text-muted-strong hover:text-txt-strong hover:bg-bg-hover transition-all cursor-pointer"
              title="Widgets"
              onClick={() => toggleToolPanel("widgets")}
            >
              <Plus className="w-4 h-4" />
            </button>

            <button
              type="button"
              disabled={!streamAvailable}
              className="w-10 h-10 rounded-full flex items-center justify-center bg-bg-elevated text-muted-strong hover:text-txt-strong hover:bg-bg-hover transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              title="Settings"
              onClick={() => toggleToolPanel("theme")}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* Right: theme */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-[12px] transition-colors cursor-pointer ${
                activePanel === "theme"
                  ? "bg-accent-subtle text-accent"
                  : "bg-bg-elevated text-muted-strong hover:text-txt-strong hover:bg-bg-hover"
              }`}
              onClick={() => toggleToolPanel("theme")}
            >
              <Palette className="w-3.5 h-3.5" />
              <span>Theme</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
