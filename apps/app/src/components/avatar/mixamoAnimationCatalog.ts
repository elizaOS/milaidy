import { resolveAppAssetUrl } from "../../asset-url";

export type MixamoAnimationCategory =
  | "idle"
  | "emotion"
  | "greeting"
  | "dance"
  | "movement"
  | "combat"
  | "gesture";

interface MixamoAnimationSeed {
  id: string;
  label: string;
  fileName: string;
  category: MixamoAnimationCategory;
  loopByDefault: boolean;
  defaultDurationSec: number;
}

export interface MixamoAnimationDef extends MixamoAnimationSeed {
  source: "girlfie-mixamo";
  url: string;
}

function buildMixamoUrl(fileName: string): string {
  return resolveAppAssetUrl(
    `animations/mixamo/${encodeURIComponent(fileName)}`,
  );
}

const MIXAMO_ANIMATION_SEEDS: MixamoAnimationSeed[] = [
  {
    id: "acknowledging",
    label: "Acknowledging",
    fileName: "Acknowledging.fbx",
    category: "greeting",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "agreeing",
    label: "Agreeing",
    fileName: "Agreeing.fbx",
    category: "gesture",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "agreeing-2",
    label: "Agreeing 2",
    fileName: "Agreeing 2.fbx",
    category: "gesture",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "angry",
    label: "Angry",
    fileName: "Angry.fbx",
    category: "emotion",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "bashful",
    label: "Bashful",
    fileName: "Bashful.fbx",
    category: "emotion",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "blow-a-kiss",
    label: "Blow A Kiss",
    fileName: "Blow A Kiss.fbx",
    category: "greeting",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "bored",
    label: "Bored",
    fileName: "Bored.fbx",
    category: "emotion",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "breakdance-freeze-var-4",
    label: "Breakdance Freeze Var 4",
    fileName: "Breakdance Freeze Var 4.fbx",
    category: "dance",
    loopByDefault: true,
    defaultDurationSec: 8,
  },
  {
    id: "breathing-idle",
    label: "Breathing Idle",
    fileName: "Breathing Idle.fbx",
    category: "idle",
    loopByDefault: true,
    defaultDurationSec: 8,
  },
  {
    id: "cheering",
    label: "Cheering",
    fileName: "Cheering.fbx",
    category: "greeting",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "clapping",
    label: "Clapping",
    fileName: "Clapping.fbx",
    category: "greeting",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "crying",
    label: "Crying",
    fileName: "Crying.fbx",
    category: "emotion",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "fallen-idle",
    label: "Fallen Idle",
    fileName: "Fallen Idle.fbx",
    category: "idle",
    loopByDefault: true,
    defaultDurationSec: 8,
  },
  {
    id: "gangnam-style",
    label: "Gangnam Style",
    fileName: "Gangnam Style.fbx",
    category: "dance",
    loopByDefault: true,
    defaultDurationSec: 8,
  },
  {
    id: "happy-idle",
    label: "Happy Idle",
    fileName: "Happy Idle.fbx",
    category: "idle",
    loopByDefault: true,
    defaultDurationSec: 8,
  },
  {
    id: "happy",
    label: "Happy",
    fileName: "Happy.fbx",
    category: "emotion",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "hard-head-nod",
    label: "Hard Head Nod",
    fileName: "Hard Head Nod.fbx",
    category: "gesture",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "hip-hop-dancing",
    label: "Hip Hop Dancing",
    fileName: "Hip Hop Dancing.fbx",
    category: "dance",
    loopByDefault: true,
    defaultDurationSec: 8,
  },
  {
    id: "hip-hop-dancing-2",
    label: "Hip Hop Dancing 2",
    fileName: "Hip Hop Dancing 2.fbx",
    category: "dance",
    loopByDefault: true,
    defaultDurationSec: 8,
  },
  {
    id: "joyful-jump",
    label: "Joyful Jump",
    fileName: "Joyful Jump.fbx",
    category: "movement",
    loopByDefault: false,
    defaultDurationSec: 2.5,
  },
  {
    id: "kneeling-idle",
    label: "Kneeling Idle",
    fileName: "Kneeling Idle.fbx",
    category: "idle",
    loopByDefault: true,
    defaultDurationSec: 8,
  },
  {
    id: "look-around",
    label: "Look Around",
    fileName: "Look Around.fbx",
    category: "gesture",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "looking",
    label: "Looking",
    fileName: "Looking.fbx",
    category: "gesture",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "mma-kick",
    label: "Mma Kick",
    fileName: "Mma Kick.fbx",
    category: "combat",
    loopByDefault: false,
    defaultDurationSec: 2.5,
  },
  {
    id: "rejected",
    label: "Rejected",
    fileName: "Rejected.fbx",
    category: "emotion",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "relieved-sigh",
    label: "Relieved Sigh",
    fileName: "Relieved Sigh.fbx",
    category: "emotion",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "rumba-dancing",
    label: "Rumba Dancing",
    fileName: "Rumba Dancing.fbx",
    category: "dance",
    loopByDefault: true,
    defaultDurationSec: 8,
  },
  {
    id: "salute",
    label: "Salute",
    fileName: "Salute.fbx",
    category: "greeting",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "shoulder-rubbing",
    label: "Shoulder Rubbing",
    fileName: "Shoulder Rubbing.fbx",
    category: "emotion",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "spin-in-place",
    label: "Spin In Place",
    fileName: "Spin In Place.fbx",
    category: "movement",
    loopByDefault: false,
    defaultDurationSec: 2.5,
  },
  {
    id: "standing-greeting-2",
    label: "Standing Greeting 2",
    fileName: "Standing Greeting 2.fbx",
    category: "greeting",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "surprised",
    label: "Surprised",
    fileName: "Surprised.fbx",
    category: "emotion",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "thankful",
    label: "Thankful",
    fileName: "Thankful.fbx",
    category: "greeting",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "thinking",
    label: "Thinking",
    fileName: "Thinking.fbx",
    category: "emotion",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "wave-hip-hop-dance",
    label: "Wave Hip Hop Dance",
    fileName: "Wave Hip Hop Dance.fbx",
    category: "dance",
    loopByDefault: true,
    defaultDurationSec: 8,
  },
  {
    id: "whatever-gesture",
    label: "Whatever Gesture",
    fileName: "Whatever Gesture.fbx",
    category: "gesture",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
  {
    id: "yawn",
    label: "Yawn",
    fileName: "Yawn.fbx",
    category: "emotion",
    loopByDefault: false,
    defaultDurationSec: 3,
  },
];

export const MIXAMO_ANIMATION_CATALOG: MixamoAnimationDef[] =
  MIXAMO_ANIMATION_SEEDS.map((seed) => ({
    ...seed,
    source: "girlfie-mixamo",
    url: buildMixamoUrl(seed.fileName),
  }));

export const MIXAMO_ANIMATION_BY_ID = new Map<string, MixamoAnimationDef>(
  MIXAMO_ANIMATION_CATALOG.map((entry) => [entry.id, entry]),
);

export const MIXAMO_IDLE_CANDIDATE_IDS = [
  "breathing-idle",
  "happy-idle",
  "kneeling-idle",
  "fallen-idle",
] as const;

export const MIXAMO_IDLE_CANDIDATE_URLS = MIXAMO_IDLE_CANDIDATE_IDS.map(
  (id) => MIXAMO_ANIMATION_BY_ID.get(id)?.url,
).filter((url): url is string => typeof url === "string" && url.length > 0);
