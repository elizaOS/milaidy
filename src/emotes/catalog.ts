/**
 * Emote Catalog
 *
 * Central registry of all available emotes for the avatar system.
 * Used by both server and client to validate and reference emote definitions.
 */

export type EmoteCategory =
  | "greeting"
  | "emotion"
  | "dance"
  | "combat"
  | "idle"
  | "movement"
  | "other";

export interface EmoteDef {
  id: string;
  name: string;
  description: string;
  glbPath: string;
  duration: number;
  loop: boolean;
  category: EmoteCategory;
}

export const EMOTE_CATALOG: EmoteDef[] = [
  // Greeting
  {
    id: "wave",
    name: "Wave",
    description: "Waves both hands in greeting",
    glbPath: "/animations/emotes/waving-both-hands.glb",
    duration: 2.5,
    loop: false,
    category: "greeting",
  },
  {
    id: "kiss",
    name: "Kiss",
    description: "Blows a kiss",
    glbPath: "/animations/emotes/kiss.glb",
    duration: 2,
    loop: false,
    category: "greeting",
  },

  // Emotion
  {
    id: "crying",
    name: "Crying",
    description: "Cries sadly",
    glbPath: "/animations/emotes/crying.glb",
    duration: 3,
    loop: true,
    category: "emotion",
  },
  {
    id: "sorrow",
    name: "Sorrow",
    description: "Expresses deep sorrow",
    glbPath: "/animations/emotes/sorrow.glb",
    duration: 3,
    loop: true,
    category: "emotion",
  },
  {
    id: "rude-gesture",
    name: "Rude Gesture",
    description: "Makes a rude gesture",
    glbPath: "/animations/emotes/rude-gesture.glb",
    duration: 2,
    loop: false,
    category: "emotion",
  },
  {
    id: "looking-around",
    name: "Looking Around",
    description: "Looks around nervously",
    glbPath: "/animations/emotes/looking-around.glb",
    duration: 3,
    loop: true,
    category: "emotion",
  },

  // Dance
  {
    id: "dance-happy",
    name: "Happy Dance",
    description: "Happy dance",
    glbPath: "/animations/emotes/dance-happy.glb",
    duration: 4,
    loop: true,
    category: "dance",
  },
  {
    id: "dance-breaking",
    name: "Breaking",
    description: "Breakdance moves",
    glbPath: "/animations/emotes/dance-breaking.glb",
    duration: 4,
    loop: true,
    category: "dance",
  },
  {
    id: "dance-hiphop",
    name: "Hip Hop",
    description: "Hip hop dance",
    glbPath: "/animations/emotes/dance-hiphop.glb",
    duration: 4,
    loop: true,
    category: "dance",
  },
  {
    id: "dance-popping",
    name: "Popping",
    description: "Popping dance moves",
    glbPath: "/animations/emotes/dance-popping.glb",
    duration: 4,
    loop: true,
    category: "dance",
  },

  // Combat
  {
    id: "hook-punch",
    name: "Hook Punch",
    description: "Throws a hook punch",
    glbPath: "/animations/emotes/hook-punch.glb",
    duration: 1.5,
    loop: false,
    category: "combat",
  },
  {
    id: "punching",
    name: "Punching",
    description: "Throws punches",
    glbPath: "/animations/emotes/punching.glb",
    duration: 2,
    loop: false,
    category: "combat",
  },
  {
    id: "firing-gun",
    name: "Firing Gun",
    description: "Fires a gun",
    glbPath: "/animations/emotes/firing-gun.glb",
    duration: 2,
    loop: false,
    category: "combat",
  },
  {
    id: "sword-swing",
    name: "Sword Swing",
    description: "Swings a sword",
    glbPath: "/animations/emotes/sword_swing.glb",
    duration: 2,
    loop: false,
    category: "combat",
  },
  {
    id: "chopping",
    name: "Chopping",
    description: "Chops with an axe",
    glbPath: "/animations/emotes/chopping.glb",
    duration: 2,
    loop: false,
    category: "combat",
  },
  {
    id: "spell-cast",
    name: "Spell Cast",
    description: "Casts a magic spell",
    glbPath: "/animations/emotes/spell-cast.glb",
    duration: 2.5,
    loop: false,
    category: "combat",
  },
  {
    id: "range",
    name: "Range",
    description: "Fires a ranged weapon",
    glbPath: "/animations/emotes/range.glb",
    duration: 2,
    loop: false,
    category: "combat",
  },
  {
    id: "death",
    name: "Death",
    description: "Falls down defeated",
    glbPath: "/animations/emotes/death.glb",
    duration: 3,
    loop: false,
    category: "combat",
  },

  // Idle
  {
    id: "idle",
    name: "Idle",
    description: "Stands idle",
    glbPath: "/animations/emotes/idle.glb",
    duration: 5,
    loop: true,
    category: "idle",
  },
  {
    id: "talk",
    name: "Talk",
    description: "Talks animatedly",
    glbPath: "/animations/emotes/talk.glb",
    duration: 3,
    loop: true,
    category: "idle",
  },
  {
    id: "squat",
    name: "Squat",
    description: "Squats down",
    glbPath: "/animations/emotes/squat.glb",
    duration: 3,
    loop: true,
    category: "idle",
  },
  {
    id: "fishing",
    name: "Fishing",
    description: "Casts a fishing line",
    glbPath: "/animations/emotes/fishing.glb",
    duration: 5,
    loop: true,
    category: "idle",
  },
  {
    id: "float",
    name: "Float",
    description: "Floats in the air",
    glbPath: "/animations/emotes/float.glb",
    duration: 4,
    loop: true,
    category: "idle",
  },

  // Movement
  {
    id: "jump",
    name: "Jump",
    description: "Jumps up",
    glbPath: "/animations/emotes/jump.glb",
    duration: 1.5,
    loop: false,
    category: "movement",
  },
  {
    id: "flip",
    name: "Flip",
    description: "Does a backflip",
    glbPath: "/animations/emotes/flip.glb",
    duration: 2,
    loop: false,
    category: "movement",
  },
  {
    id: "run",
    name: "Run",
    description: "Runs in place",
    glbPath: "/animations/emotes/run.glb",
    duration: 3,
    loop: true,
    category: "movement",
  },
  {
    id: "walk",
    name: "Walk",
    description: "Walks in place",
    glbPath: "/animations/emotes/walk.glb",
    duration: 3,
    loop: true,
    category: "movement",
  },
  {
    id: "crawling",
    name: "Crawling",
    description: "Crawls on the ground",
    glbPath: "/animations/emotes/crawling.glb",
    duration: 3,
    loop: true,
    category: "movement",
  },
  {
    id: "fall",
    name: "Fall",
    description: "Falls down",
    glbPath: "/animations/emotes/fall.glb",
    duration: 2,
    loop: false,
    category: "movement",
  },
];

/**
 * Map for O(1) emote lookup by ID
 */
export const EMOTE_BY_ID = new Map<string, EmoteDef>(
  EMOTE_CATALOG.map((emote) => [emote.id, emote]),
);

/**
 * Get emote definition by ID
 */
export function getEmote(id: string): EmoteDef | undefined {
  return EMOTE_BY_ID.get(id);
}

/**
 * Get all emotes in a specific category
 */
export function getEmotesByCategory(category: EmoteCategory): EmoteDef[] {
  return EMOTE_CATALOG.filter((emote) => emote.category === category);
}

/**
 * Validate if an emote ID exists
 */
export function isValidEmote(id: string): boolean {
  return EMOTE_BY_ID.has(id);
}
