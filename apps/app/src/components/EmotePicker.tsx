import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useApp } from "../AppContext.js";
import { client } from "../api-client.js";

// Types
interface EmoteItem {
  id: string;
  name: string;
  category: string;
  icon: string;
}

// Category icons
const CATEGORY_ICONS: Record<string, string> = {
  greeting: "\u{1F44B}",
  emotion: "\u{1F622}",
  dance: "\u{1F57A}",
  combat: "\u{2694}",
  idle: "\u{1F9D8}",
  movement: "\u{1F3C3}",
  other: "\u{2728}",
};

// Emote icons
const EMOTE_ICONS: Record<string, string> = {
  wave: "\u{1F44B}",
  kiss: "\u{1F48B}",
  crying: "\u{1F62D}",
  sorrow: "\u{1F614}",
  "rude-gesture": "\u{1F595}",
  "looking-around": "\u{1F440}",
  "dance-happy": "\u{1F483}",
  "dance-breaking": "\u{1F938}",
  "dance-hiphop": "\u{1F57A}",
  "dance-popping": "\u{1FAA9}",
  "hook-punch": "\u{1F44A}",
  punching: "\u{1F94A}",
  "firing-gun": "\u{1F52B}",
  "sword-swing": "\u{2694}",
  chopping: "\u{1FA93}",
  "spell-cast": "\u{1FA84}",
  range: "\u{1F3F9}",
  death: "\u{1F480}",
  idle: "\u{1F9D8}",
  talk: "\u{1F5E3}",
  squat: "\u{1F9CE}",
  fishing: "\u{1F3A3}",
  float: "\u{1F54A}",
  jump: "\u{1F4A8}",
  flip: "\u{1F938}",
  run: "\u{1F3C3}",
  walk: "\u{1F6B6}",
  crawling: "\u{1F40D}",
  fall: "\u{1F4A5}",
};

// All emotes
const ALL_EMOTES: EmoteItem[] = [
  // Greeting
  { id: "wave", name: "Wave", category: "greeting", icon: EMOTE_ICONS.wave },
  { id: "kiss", name: "Kiss", category: "greeting", icon: EMOTE_ICONS.kiss },

  // Emotion
  { id: "crying", name: "Crying", category: "emotion", icon: EMOTE_ICONS.crying },
  { id: "sorrow", name: "Sorrow", category: "emotion", icon: EMOTE_ICONS.sorrow },
  { id: "rude-gesture", name: "Rude Gesture", category: "emotion", icon: EMOTE_ICONS["rude-gesture"] },
  { id: "looking-around", name: "Looking Around", category: "emotion", icon: EMOTE_ICONS["looking-around"] },

  // Dance
  { id: "dance-happy", name: "Dance Happy", category: "dance", icon: EMOTE_ICONS["dance-happy"] },
  { id: "dance-breaking", name: "Dance Breaking", category: "dance", icon: EMOTE_ICONS["dance-breaking"] },
  { id: "dance-hiphop", name: "Dance Hip Hop", category: "dance", icon: EMOTE_ICONS["dance-hiphop"] },
  { id: "dance-popping", name: "Dance Popping", category: "dance", icon: EMOTE_ICONS["dance-popping"] },

  // Combat
  { id: "hook-punch", name: "Hook Punch", category: "combat", icon: EMOTE_ICONS["hook-punch"] },
  { id: "punching", name: "Punching", category: "combat", icon: EMOTE_ICONS.punching },
  { id: "firing-gun", name: "Firing Gun", category: "combat", icon: EMOTE_ICONS["firing-gun"] },
  { id: "sword-swing", name: "Sword Swing", category: "combat", icon: EMOTE_ICONS["sword-swing"] },
  { id: "chopping", name: "Chopping", category: "combat", icon: EMOTE_ICONS.chopping },
  { id: "spell-cast", name: "Spell Cast", category: "combat", icon: EMOTE_ICONS["spell-cast"] },
  { id: "range", name: "Range", category: "combat", icon: EMOTE_ICONS.range },
  { id: "death", name: "Death", category: "combat", icon: EMOTE_ICONS.death },

  // Idle
  { id: "idle", name: "Idle", category: "idle", icon: EMOTE_ICONS.idle },
  { id: "talk", name: "Talk", category: "idle", icon: EMOTE_ICONS.talk },
  { id: "squat", name: "Squat", category: "idle", icon: EMOTE_ICONS.squat },
  { id: "fishing", name: "Fishing", category: "idle", icon: EMOTE_ICONS.fishing },

  // Movement
  { id: "float", name: "Float", category: "movement", icon: EMOTE_ICONS.float },
  { id: "jump", name: "Jump", category: "movement", icon: EMOTE_ICONS.jump },
  { id: "flip", name: "Flip", category: "movement", icon: EMOTE_ICONS.flip },
  { id: "run", name: "Run", category: "movement", icon: EMOTE_ICONS.run },
  { id: "walk", name: "Walk", category: "movement", icon: EMOTE_ICONS.walk },
  { id: "crawling", name: "Crawling", category: "movement", icon: EMOTE_ICONS.crawling },
  { id: "fall", name: "Fall", category: "movement", icon: EMOTE_ICONS.fall },
];

const CATEGORIES = ["greeting", "emotion", "dance", "combat", "idle", "movement"];

const CATEGORY_LABELS: Record<string, string> = {
  greeting: "Greeting",
  emotion: "Emotion",
  dance: "Dance",
  combat: "Combat",
  idle: "Idle",
  movement: "Movement",
};

export function EmotePicker() {
  const { emotePickerOpen, openEmotePicker, closeEmotePicker } = useApp();
  const [search, setSearch] = useState("");
  const [playing, setPlaying] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const posRef = useRef({ x: 0, y: 0 });
  const dragOrigin = useRef<{ startX: number; startY: number; rect: DOMRect } | null>(null);

  // Apply position to panel
  const applyPosition = useCallback((x: number, y: number) => {
    const el = panelRef.current;
    if (!el) return;

    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.bottom = "auto";
    el.style.right = "auto";

    posRef.current = { x, y };
  }, []);

  // Drag handlers
  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const el = panelRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    dragOrigin.current = {
      startX: e.clientX,
      startY: e.clientY,
      rect,
    };

    const onPointerMove = (moveEvent: PointerEvent) => {
      if (!dragOrigin.current) return;

      const dx = moveEvent.clientX - dragOrigin.current.startX;
      const dy = moveEvent.clientY - dragOrigin.current.startY;

      let newX = dragOrigin.current.rect.left + dx;
      let newY = dragOrigin.current.rect.top + dy;

      // Clamp to viewport
      const maxX = window.innerWidth - dragOrigin.current.rect.width;
      const maxY = window.innerHeight - dragOrigin.current.rect.height;

      newX = Math.max(0, Math.min(newX, maxX));
      newY = Math.max(0, Math.min(newY, maxY));

      applyPosition(newX, newY);
    };

    const onPointerUp = () => {
      dragOrigin.current = null;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }, [applyPosition]);

  // Reset position on open
  useEffect(() => {
    if (emotePickerOpen && panelRef.current) {
      panelRef.current.style.left = "";
      panelRef.current.style.top = "";
      panelRef.current.style.bottom = "";
      panelRef.current.style.right = "";
      posRef.current = { x: 0, y: 0 };
    }
  }, [emotePickerOpen]);

  // Filter emotes
  const filteredEmotes = useMemo(() => {
    let emotes = ALL_EMOTES;

    if (activeCategory) {
      emotes = emotes.filter((e) => e.category === activeCategory);
    }

    if (search.trim()) {
      const query = search.toLowerCase();
      emotes = emotes.filter((e) =>
        e.name.toLowerCase().includes(query) || e.id.toLowerCase().includes(query)
      );
    }

    return emotes;
  }, [search, activeCategory]);

  // Play emote
  const playEmote = useCallback(async (emoteId: string) => {
    setPlaying(emoteId);
    try {
      await client.playEmote(emoteId);
    } catch (err) {
      console.error("Failed to play emote:", err);
    } finally {
      setTimeout(() => setPlaying(null), 1000);
    }
  }, []);

  // Stop emote
  const stopEmote = useCallback(() => {
    document.dispatchEvent(new CustomEvent("milaidy:stop-emote"));
    setPlaying(null);
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Cmd+E toggle
      if ((e.metaKey || e.ctrlKey) && e.key === "e") {
        e.preventDefault();
        if (emotePickerOpen) {
          closeEmotePicker();
        } else {
          openEmotePicker();
        }
      }

      // Escape to close
      if (e.key === "Escape" && emotePickerOpen) {
        closeEmotePicker();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [emotePickerOpen, openEmotePicker, closeEmotePicker]);

  // Electron IPC listener
  useEffect(() => {
    const handleElectronToggle = () => {
      if (emotePickerOpen) {
        closeEmotePicker();
      } else {
        openEmotePicker();
      }
    };

    document.addEventListener("milaidy:emote-picker", handleElectronToggle);
    return () => document.removeEventListener("milaidy:emote-picker", handleElectronToggle);
  }, [emotePickerOpen, openEmotePicker, closeEmotePicker]);

  // Focus search input on open
  useEffect(() => {
    if (emotePickerOpen && inputRef.current) {
      inputRef.current.focus();
    }
  }, [emotePickerOpen]);

  if (!emotePickerOpen) return null;

  return (
    <div
      ref={panelRef}
      className="fixed bottom-4 left-4 z-[9999] w-[320px] rounded-lg border border-gray-700 bg-gray-900/95 shadow-2xl backdrop-blur-md"
    >
      {/* Header */}
      <div
        className="flex cursor-move items-center justify-between border-b border-gray-700 px-3 py-2"
        onPointerDown={onPointerDown}
      >
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-400">☰</span>
          <span className="text-sm font-semibold text-white">Emotes</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Stop button */}
          <button
            onClick={stopEmote}
            className="rounded bg-red-600 px-2 py-1 text-xs font-medium text-white hover:bg-red-700"
          >
            Stop
          </button>

          {/* Shortcut label */}
          <span className="text-xs text-gray-400">⌘E</span>

          {/* Close button */}
          <button
            onClick={closeEmotePicker}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="border-b border-gray-700 px-3 py-2">
        <input
          ref={inputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search emotes..."
          className="w-full rounded bg-gray-800 px-2 py-1 text-sm text-white placeholder-gray-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      {/* Category tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-700 px-3 py-2">
        <button
          onClick={() => setActiveCategory(null)}
          className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${
            activeCategory === null
              ? "bg-blue-600 text-white"
              : "bg-gray-800 text-gray-300 hover:bg-gray-700"
          }`}
        >
          All
        </button>
        {CATEGORIES.map((cat) => (
          <button
            key={cat}
            onClick={() => setActiveCategory(cat)}
            className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${
              activeCategory === cat
                ? "bg-blue-600 text-white"
                : "bg-gray-800 text-gray-300 hover:bg-gray-700"
            }`}
          >
            <span className="mr-1">{CATEGORY_ICONS[cat]}</span>
            {CATEGORY_LABELS[cat]}
          </button>
        ))}
      </div>

      {/* Emote grid */}
      <div className="max-h-[400px] overflow-y-auto p-3">
        <div className="grid grid-cols-5 gap-2">
          {filteredEmotes.map((emote) => (
            <button
              key={emote.id}
              onClick={() => playEmote(emote.id)}
              disabled={playing === emote.id}
              title={emote.name}
              className={`flex aspect-square items-center justify-center rounded text-2xl transition-colors ${
                playing === emote.id
                  ? "bg-blue-600"
                  : "bg-gray-800 hover:bg-gray-700"
              }`}
            >
              {emote.icon}
            </button>
          ))}
        </div>

        {filteredEmotes.length === 0 && (
          <div className="py-8 text-center text-sm text-gray-500">
            No emotes found
          </div>
        )}
      </div>
    </div>
  );
}
