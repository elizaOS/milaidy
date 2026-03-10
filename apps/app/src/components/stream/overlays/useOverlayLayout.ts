/**
 * React hook for managing per-scene overlay layouts.
 *
 * Persistence strategy (dual-layer):
 *  1. **Server API** (`GET/POST /api/stream/scene-layouts`) — authoritative
 *     source that persists across headless browser restarts on a VPS.
 *  2. **localStorage** (`milady.stream.scene-layouts.v2`) — fast local cache,
 *     used as initial state and fallback when the server is unreachable.
 *
 * On mount the hook loads from localStorage (instant), then fetches from the
 * server. If the server has layouts, they win. Mutations write to both.
 *
 * Backwards compatible: migrates from v1 single-layout to v2 scene layouts.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { client } from "../../../api-client";
import type { AgentMode } from "../helpers";
import { getAllWidgets } from "./registry";
import type {
  OverlayLayout,
  SceneId,
  SceneLayout,
  BackgroundConfig,
  SceneLayouts,
  SlateConfig,
  WidgetInstance,
  WidgetPosition,
} from "./types";
import {
  ALL_SCENE_IDS as SCENE_IDS,
  isBroadcastScene,
} from "./types";

// ---------------------------------------------------------------------------
// Storage keys
// ---------------------------------------------------------------------------

function storageKeyV2(destinationId?: string | null): string {
  const base = "milady.stream.scene-layouts.v2";
  return destinationId ? `${base}.${destinationId}` : base;
}

function storageKeyV1(destinationId?: string | null): string {
  const base = "milady.stream.overlay-layout.v1";
  return destinationId ? `${base}.${destinationId}` : base;
}

// ---------------------------------------------------------------------------
// ID generator
// ---------------------------------------------------------------------------

let _idCounter = 0;
function localId(): string {
  _idCounter += 1;
  return `w${Date.now().toString(36)}${_idCounter.toString(36)}`;
}

// ---------------------------------------------------------------------------
// Default builders
// ---------------------------------------------------------------------------

const DEFAULT_SLATE_TEXT: Record<string, string> = {
  "starting-soon": "Starting Soon",
  "be-right-back": "Be Right Back",
  ending: "Thanks for Watching!",
};

function buildDefaultLayout(): OverlayLayout {
  const widgets: WidgetInstance[] = getAllWidgets().map((def) => ({
    id: localId(),
    type: def.type,
    enabled: def.type === "thought-bubble" || def.type === "branding",
    position: { ...def.defaultPosition },
    zIndex: def.defaultZIndex,
    config: { ...def.defaultConfig },
  }));
  return { version: 1, name: "Default", widgets };
}

function buildDefaultSceneLayout(sceneId: SceneId): SceneLayout {
  const layout = buildDefaultLayout();
  const sl: SceneLayout = { sceneId, layout };
  sl.background = { type: "color", value: "#12151f" };
  if (isBroadcastScene(sceneId)) {
    sl.slate = {
      text: DEFAULT_SLATE_TEXT[sceneId] ?? sceneId,
      subtext: "",
      backgroundColor: "#0e1118",
      textColor: "#ffffff",
    };
    // Broadcast scenes: only enable branding by default
    sl.layout.widgets = sl.layout.widgets.map((w) => ({
      ...w,
      enabled: w.type === "branding",
    }));
  }
  return sl;
}

function buildDefaultSceneLayouts(): SceneLayouts {
  const scenes: Record<string, SceneLayout> = {};
  for (const id of SCENE_IDS) {
    scenes[id] = buildDefaultSceneLayout(id);
  }
  return { version: 2, activeSceneId: null, scenes };
}

/** Migrate a v1 OverlayLayout into v2 SceneLayouts. */
function migrateV1ToV2(v1: OverlayLayout): SceneLayouts {
  const scenes: Record<string, SceneLayout> = {};
  // Copy v1 layout to all content scenes
  for (const id of SCENE_IDS) {
    if (isBroadcastScene(id)) {
      scenes[id] = buildDefaultSceneLayout(id);
    } else {
      // Deep-clone the v1 layout with fresh widget IDs
      const widgets = v1.widgets.map((w) => ({
        ...w,
        id: localId(),
        position: { ...w.position },
        config: { ...w.config },
      }));
      scenes[id] = {
        sceneId: id,
        layout: { version: 1, name: v1.name, widgets },
      };
    }
  }
  return { version: 2, activeSceneId: null, scenes };
}

// ---------------------------------------------------------------------------
// Ensure all registered widgets exist in a layout
// ---------------------------------------------------------------------------

function ensureAllWidgets(layout: OverlayLayout): OverlayLayout {
  const allDefs = getAllWidgets();
  const existingTypes = new Set(layout.widgets.map((w) => w.type));
  const missing = allDefs.filter((d) => !existingTypes.has(d.type));
  if (missing.length === 0) return layout;

  return {
    ...layout,
    widgets: [
      ...layout.widgets,
      ...missing.map((def) => ({
        id: localId(),
        type: def.type,
        enabled: false,
        position: { ...def.defaultPosition },
        zIndex: def.defaultZIndex,
        config: { ...def.defaultConfig },
      })),
    ],
  };
}

function ensureAllWidgetsInScenes(sl: SceneLayouts): SceneLayouts {
  let changed = false;
  const scenes = { ...sl.scenes };
  for (const [id, scene] of Object.entries(scenes)) {
    const updated = ensureAllWidgets(scene.layout);
    if (updated !== scene.layout) {
      scenes[id] = { ...scene, layout: updated };
      changed = true;
    }
  }
  // Also ensure all scenes exist
  for (const id of SCENE_IDS) {
    if (!scenes[id]) {
      scenes[id] = buildDefaultSceneLayout(id);
      changed = true;
    }
  }
  return changed ? { ...sl, scenes } : sl;
}

// ---------------------------------------------------------------------------
// Local storage
// ---------------------------------------------------------------------------

function loadLocal(destinationId?: string | null): SceneLayouts {
  // Try v2 first
  try {
    const raw = localStorage.getItem(storageKeyV2(destinationId));
    if (raw) {
      const parsed = JSON.parse(raw) as SceneLayouts;
      if (parsed.version === 2 && parsed.scenes) {
        return ensureAllWidgetsInScenes(parsed);
      }
    }
  } catch {
    // corrupted
  }

  // Try v1 migration
  try {
    const raw = localStorage.getItem(storageKeyV1(destinationId));
    if (raw) {
      const parsed = JSON.parse(raw) as OverlayLayout;
      if (parsed.version === 1 && Array.isArray(parsed.widgets)) {
        const migrated = migrateV1ToV2(parsed);
        return ensureAllWidgetsInScenes(migrated);
      }
    }
  } catch {
    // corrupted
  }

  return ensureAllWidgetsInScenes(buildDefaultSceneLayouts());
}

function saveLocal(
  layouts: SceneLayouts,
  destinationId?: string | null,
): void {
  try {
    localStorage.setItem(
      storageKeyV2(destinationId),
      JSON.stringify(layouts),
    );
  } catch {
    // storage full
  }
}

function saveServer(
  layouts: SceneLayouts,
  destinationId?: string | null,
): void {
  client.saveSceneLayouts(layouts, destinationId).catch(() => {});
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface UseSceneLayouts {
  /** Full scene layouts structure. */
  scenes: SceneLayouts;
  /** The currently effective scene (manual override or auto-detected). */
  activeSceneId: SceneId;
  /** Whether scene is manually overridden (vs auto-detect). */
  isManualOverride: boolean;
  /** Set active scene. null = return to auto-detect. */
  setActiveScene: (id: SceneId | null) => void;

  /** Current scene's overlay layout. */
  layout: OverlayLayout;
  addWidget: (type: string) => void;
  removeWidget: (id: string) => void;
  toggleWidget: (id: string) => void;
  updateWidget: (
    id: string,
    patch: Partial<Pick<WidgetInstance, "position" | "zIndex" | "config">>,
  ) => void;
  moveWidget: (id: string, position: WidgetPosition) => void;
  resetLayout: () => void;

  /** Update slate config for broadcast scenes. */
  updateSlate: (sceneId: SceneId, patch: Partial<SlateConfig>) => void;
  /** Copy layout from one scene to another. */
  copyLayoutToScene: (fromSceneId: SceneId, toSceneId: SceneId) => void;
  /** Update background config for a scene. */
  updateBackground: (sceneId: SceneId, background: BackgroundConfig | undefined) => void;

  /** Save current scene layouts as a named preset. */
  savePreset: (name: string) => void;
  /** Load a named preset, replacing current scene layouts. */
  loadPreset: (name: string) => void;
  /** Delete a named preset. */
  deletePreset: (name: string) => void;
  /** List all saved preset names. */
  presetNames: string[];
}

export function useSceneLayouts(
  destinationId?: string | null,
  autoDetectedMode?: AgentMode,
): UseSceneLayouts {
  const [scenes, setScenes] = useState<SceneLayouts>(() =>
    loadLocal(destinationId),
  );
  const serverFetched = useRef<string | null | undefined>(undefined);

  // Re-fetch when destinationId changes
  useEffect(() => {
    setScenes(loadLocal(destinationId));
    serverFetched.current = undefined;
  }, [destinationId]);

  // Fetch from server
  useEffect(() => {
    if (serverFetched.current === destinationId) return;
    serverFetched.current = destinationId;

    client
      .getSceneLayouts(destinationId)
      .then((res) => {
        const remote = res.layouts as SceneLayouts | null;
        if (remote && remote.version === 2 && remote.scenes) {
          const ensured = ensureAllWidgetsInScenes(remote);
          setScenes(ensured);
          saveLocal(ensured, destinationId);
        }
      })
      .catch(() => {});
  }, [destinationId]);

  // Poll for agent-initiated scene changes
  useEffect(() => {
    const interval = setInterval(() => {
      client
        .getActiveScene()
        .then((res) => {
          if (res.ok && res.sceneId !== undefined) {
            setScenes((prev) => {
              if (prev.activeSceneId === res.sceneId) return prev;
              return { ...prev, activeSceneId: res.sceneId as SceneId | null };
            });
          }
        })
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  // Persist on change
  const isInitialMount = useRef(true);
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    saveLocal(scenes, destinationId);
    saveServer(scenes, destinationId);
  }, [scenes, destinationId]);

  // Resolve active scene
  const activeSceneId: SceneId = useMemo(() => {
    if (scenes.activeSceneId) return scenes.activeSceneId;
    return autoDetectedMode ?? "idle";
  }, [scenes.activeSceneId, autoDetectedMode]);

  const isManualOverride = scenes.activeSceneId !== null;

  const setActiveScene = useCallback((id: SceneId | null) => {
    setScenes((prev) => ({ ...prev, activeSceneId: id }));
    // Also notify server so agent can read it
    client.setActiveScene(id).catch(() => {});
  }, []);

  // Current scene's layout
  const layout: OverlayLayout = useMemo(() => {
    const scene = scenes.scenes[activeSceneId];
    return scene?.layout ?? buildDefaultLayout();
  }, [scenes, activeSceneId]);

  // Layout mutation helpers — all operate on current scene
  const updateCurrentSceneLayout = useCallback(
    (updater: (layout: OverlayLayout) => OverlayLayout) => {
      setScenes((prev) => {
        const sceneId = prev.activeSceneId ?? autoDetectedMode ?? "idle";
        const scene = prev.scenes[sceneId];
        if (!scene) return prev;
        return {
          ...prev,
          scenes: {
            ...prev.scenes,
            [sceneId]: {
              ...scene,
              layout: updater(scene.layout),
            },
          },
        };
      });
    },
    [autoDetectedMode],
  );

  const addWidget = useCallback(
    (type: string) => {
      const defs = getAllWidgets();
      const def = defs.find((d) => d.type === type);
      if (!def) return;
      const instance: WidgetInstance = {
        id: localId(),
        type: def.type,
        enabled: true,
        position: { ...def.defaultPosition },
        zIndex: def.defaultZIndex,
        config: { ...def.defaultConfig },
      };
      updateCurrentSceneLayout((l) => ({
        ...l,
        widgets: [...l.widgets, instance],
      }));
    },
    [updateCurrentSceneLayout],
  );

  const removeWidget = useCallback(
    (id: string) => {
      updateCurrentSceneLayout((l) => ({
        ...l,
        widgets: l.widgets.filter((w) => w.id !== id),
      }));
    },
    [updateCurrentSceneLayout],
  );

  const toggleWidget = useCallback(
    (id: string) => {
      updateCurrentSceneLayout((l) => ({
        ...l,
        widgets: l.widgets.map((w) =>
          w.id === id ? { ...w, enabled: !w.enabled } : w,
        ),
      }));
    },
    [updateCurrentSceneLayout],
  );

  const updateWidget = useCallback(
    (
      id: string,
      patch: Partial<Pick<WidgetInstance, "position" | "zIndex" | "config">>,
    ) => {
      updateCurrentSceneLayout((l) => ({
        ...l,
        widgets: l.widgets.map((w) =>
          w.id === id ? { ...w, ...patch } : w,
        ),
      }));
    },
    [updateCurrentSceneLayout],
  );

  const moveWidget = useCallback(
    (id: string, position: WidgetPosition) => {
      updateCurrentSceneLayout((l) => ({
        ...l,
        widgets: l.widgets.map((w) =>
          w.id === id ? { ...w, position } : w,
        ),
      }));
    },
    [updateCurrentSceneLayout],
  );

  const resetLayout = useCallback(() => {
    updateCurrentSceneLayout(() => buildDefaultLayout());
  }, [updateCurrentSceneLayout]);

  const updateSlate = useCallback(
    (sceneId: SceneId, patch: Partial<SlateConfig>) => {
      setScenes((prev) => {
        const scene = prev.scenes[sceneId];
        if (!scene) return prev;
        return {
          ...prev,
          scenes: {
            ...prev.scenes,
            [sceneId]: {
              ...scene,
              slate: { ...scene.slate, ...patch } as SlateConfig,
            },
          },
        };
      });
    },
    [],
  );

  const copyLayoutToScene = useCallback(
    (fromSceneId: SceneId, toSceneId: SceneId) => {
      setScenes((prev) => {
        const from = prev.scenes[fromSceneId];
        if (!from) return prev;
        const copiedWidgets = from.layout.widgets.map((w) => ({
          ...w,
          id: localId(),
          position: { ...w.position },
          config: { ...w.config },
        }));
        const existing = prev.scenes[toSceneId];
        return {
          ...prev,
          scenes: {
            ...prev.scenes,
            [toSceneId]: {
              ...existing,
              sceneId: toSceneId,
              layout: {
                ...from.layout,
                widgets: copiedWidgets,
              },
            },
          },
        };
      });
    },
    [],
  );

  // Scene presets
  const [presetNames, setPresetNames] = useState<string[]>(() => {
    try {
      const raw = localStorage.getItem("milady.stream.scene-presets.index");
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  });

  const savePreset = useCallback(
    (name: string) => {
      if (!name.trim()) return;
      const key = `milady.stream.scene-preset.${name.trim()}`;
      try {
        localStorage.setItem(key, JSON.stringify(scenes));
        setPresetNames((prev) => {
          const updated = Array.from(new Set([...prev, name.trim()]));
          localStorage.setItem("milady.stream.scene-presets.index", JSON.stringify(updated));
          return updated;
        });
      } catch { /* storage full */ }
    },
    [scenes],
  );

  const loadPreset = useCallback(
    (name: string) => {
      const key = `milady.stream.scene-preset.${name.trim()}`;
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return;
        const parsed = JSON.parse(raw) as SceneLayouts;
        if (parsed.version === 2 && parsed.scenes) {
          const ensured = ensureAllWidgetsInScenes(parsed);
          setScenes(ensured);
        }
      } catch { /* ignore */ }
    },
    [],
  );

  const deletePreset = useCallback(
    (name: string) => {
      const key = `milady.stream.scene-preset.${name.trim()}`;
      try {
        localStorage.removeItem(key);
        setPresetNames((prev) => {
          const updated = prev.filter((n) => n !== name.trim());
          localStorage.setItem("milady.stream.scene-presets.index", JSON.stringify(updated));
          return updated;
        });
      } catch { /* ignore */ }
    },
    [],
  );

  const updateBackground = useCallback(
    (sceneId: SceneId, background: BackgroundConfig | undefined) => {
      setScenes((prev) => {
        const scene = prev.scenes[sceneId];
        if (!scene) return prev;
        return {
          ...prev,
          scenes: {
            ...prev.scenes,
            [sceneId]: {
              ...scene,
              background,
            },
          },
        };
      });
    },
    [],
  );

  return {
    scenes,
    activeSceneId,
    isManualOverride,
    setActiveScene,
    layout,
    addWidget,
    removeWidget,
    toggleWidget,
    updateWidget,
    moveWidget,
    resetLayout,
    updateSlate,
    copyLayoutToScene,
    updateBackground,
    savePreset,
    loadPreset,
    deletePreset,
    presetNames,
  };
}

// ---------------------------------------------------------------------------
// Legacy hook — wraps useSceneLayouts for backward compatibility
// ---------------------------------------------------------------------------

export interface UseOverlayLayout {
  layout: OverlayLayout;
  addWidget: (type: string) => void;
  removeWidget: (id: string) => void;
  toggleWidget: (id: string) => void;
  updateWidget: (
    id: string,
    patch: Partial<Pick<WidgetInstance, "position" | "zIndex" | "config">>,
  ) => void;
  moveWidget: (id: string, position: WidgetPosition) => void;
  resetLayout: () => void;
}

export function useOverlayLayout(
  destinationId?: string | null,
): UseOverlayLayout {
  const sl = useSceneLayouts(destinationId, "idle");
  return {
    layout: sl.layout,
    addWidget: sl.addWidget,
    removeWidget: sl.removeWidget,
    toggleWidget: sl.toggleWidget,
    updateWidget: sl.updateWidget,
    moveWidget: sl.moveWidget,
    resetLayout: sl.resetLayout,
  };
}
