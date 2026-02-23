import { expandCryptoSlangContext } from "./crypto-slang.js";

/**
 * Chat intent engine for API routing.
 *
 * Centralizes wording/intent detection and target resolution so behavior stays
 * consistent as phrase variants grow.
 */

export type IntentCategory =
  | "ai-provider"
  | "connector"
  | "database"
  | "feature";

export interface IntentParam {
  key: string;
  required?: boolean;
}

export interface IntentComponent {
  id: string;
  name: string;
  category: IntentCategory;
  enabled?: boolean;
  configured?: boolean;
  validationErrors?: Array<{ field: string; message?: string }>;
  parameters?: IntentParam[];
}

export interface RecentAssistantTurn {
  assistant: string;
}

export interface CoreIntentFlags {
  isGenericOpener: boolean;
  capabilityIntent: boolean;
  toolSafetyReviewIntent: boolean;
  socialCheckInIntent: boolean;
  genericHowItWorksIntent: boolean;
  gettingStartedIntent: boolean;
  platformIntent: boolean;
  agentOverviewIntent: boolean;
  workflowExplainIntent: boolean;
  marketsAppsIntent: boolean;
  explainPluginsIntent: boolean;
  inAppTradeBetAppsIntent: boolean;
  securityControlsIntent: boolean;
  postSetupExecutionIntent: boolean;
  nextStepIntent: boolean;
  setupNoTargetIntent: boolean;
  planningAdviceIntent: boolean;
}

const ALIASES: Array<{ id: string; terms: string[] }> = [
  {
    id: "discord",
    terms: ["discord", "discoerd", "discrod", "disord", "discor"],
  },
  { id: "telegram", terms: ["telegram", "telegran", "telegarm"] },
  {
    id: "polymarket",
    terms: [
      "polymarket",
      "poly market",
      "pollymarket",
      "polymarketbet",
      "polybet",
      "poly",
    ],
  },
  { id: "openai", terms: ["openai", "open ai", "gpt"] },
  { id: "ollama", terms: ["ollama", "olamma", "olama"] },
];

export function normalizeComponentName(name: string): string {
  const n = name.trim().toLowerCase();
  if (n === "openai") return "OpenAI";
  if (n === "xai") return "xAI";
  if (n === "vercel ai gateway") return "Vercel AI Gateway";
  return name;
}

export function classifyCoreIntents(userText: string): CoreIntentFlags {
  const intentText = expandCryptoSlangContext(userText);
  const normalized = intentText
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const lower = intentText.toLowerCase();
  const setupVerb =
    /\b(setup|set up|configure|config|connect|enable|install|plug in)\b/i.test(
      userText,
    );
  const marketsAppsPlanIntent =
    /\b(action plan|next action plan|next action|plan)\b/i.test(intentText) &&
    /\b(markets?\s*&?\s*apps?|markets and apps|integrations?|connectors?)\b/i.test(
      intentText,
    );
  const setupObject =
    /\b(plugin|plugins|provider|providers|integration|integrations|connector|connectors|api key|token|secret|credential|credentials|discord|telegram|polymarket|openai|ollama|model|models|ai settings|markets?\s*&?\s*apps?|wallet)\b/i.test(
      userText,
    );
  const bareSetup =
    /^(setup|set up|configure|config|connect|enable|install|plug in)\b/i.test(
      userText.trim(),
    );
  const planningAdviceIntent =
    (/\b(plan|steps?|strategy|advice|roadmap|allocation|risk rules?|risk management|goal)\b/i.test(
      intentText,
    ) &&
      /\b(crypto|bitcoin|btc|eth|sol|solana|meme\s*coins?|trading|invest|investing|wealth|portfolio|retirement|budget)\b/i.test(
        intentText,
      )) ||
    (/\b(should i|what should i do|is it smart|worth it|good idea)\b/i.test(
      intentText,
    ) &&
      /\b(ape|all in|full port|yolo|meme|memes|coin|coins|token|tokens|crypto|trading|portfolio|position|risk|buy|sell|btc|eth|sol)\b/i.test(
        intentText,
      ));
  const setupContext =
    /\b(setup|set(?:\s+(?:it|this))?\s+up|configured|configuration|enabled|connected|turned on|done setup|set up done)\b/i.test(
      intentText,
    );
  const nextStepCue =
    /\b(then what|what next|next step|what now|after that|and then|now what|what happens next|then how|what after)\b/i.test(
      intentText,
    ) ||
    normalized === "then" ||
    normalized === "next";
  const executionCue =
    /\b(execute|execution|run|perform|do it|take action|trigger|operate|carry out)\b/i.test(
      intentText,
    );
  return {
    isGenericOpener:
      /^(hey|hi|hello|yo|sup|gm|good morning|good afternoon|good evening|hola|what'?s up|whats up)\b/.test(
        lower,
      ) && userText.length <= 48,
    capabilityIntent:
      /\b(what can you do|what can i do|what you can do|what are you able to do|what are your capabilities|what do you do|capabilit(y|ies)|everything tool|what can we do|know what you can do)\b/i.test(
        intentText,
      ),
    toolSafetyReviewIntent:
      /\b(review|check|audit|assess|summari[sz]e)\b/i.test(intentText) &&
      /\b(enabled|active|connected)\b/i.test(intentText) &&
      /\b(tools?|providers?|integrations?|markets?\s*&?\s*apps?)\b/i.test(
        intentText,
      ) &&
      /\b(safer defaults?|risk|security|permissions?)\b/i.test(intentText),
    socialCheckInIntent:
      /\b(how are you|how you doing|how're you|you good|you okay|how is it going|hows it going)\b/i.test(
        intentText,
      ),
    genericHowItWorksIntent:
      /\b(how (this|it) works?|how do you work|how does this work)\b/i.test(
        intentText,
      ),
    gettingStartedIntent:
      /\b(how do i get started|how to get started|get started|how do i use this|how to use this|what do i do|what should i do first|where do i start)\b/i.test(
        intentText,
      ),
    platformIntent:
      /\b(milaidy|this platform|the platform|workspace)\b/i.test(intentText) &&
      /\b(what (is|does)|how (it|this) works?|understand|overview|explain)\b/i.test(
        intentText,
      ),
    agentOverviewIntent:
      /\b(understand|explain|overview|what is)\b/i.test(intentText) &&
      /\b(agent|milaidy)\b/i.test(intentText),
    workflowExplainIntent:
      /\b(explain|show|walk me through|understand)\b/i.test(intentText) &&
      /\b(workflow|flow|process)\b/i.test(intentText),
    marketsAppsIntent:
      /\b(markets?\s*&?\s*apps?|market and apps|apps and markets)\b/i.test(
        intentText,
      ) ||
      (/\bplugins?\b/i.test(intentText) &&
        /\bmarket|apps?\b/i.test(intentText)),
    explainPluginsIntent:
      /\b(explain|overview|show|list|what are)\b/.test(lower) &&
      /\bplugins?|integrations?|connectors?\b/i.test(intentText),
    inAppTradeBetAppsIntent:
      /\b(what apps|which apps|apps can you use|can you use apps)\b/i.test(
        intentText,
      ) && /\b(trade|trading|bet|betting|polymarket)\b/i.test(intentText),
    securityControlsIntent:
      /\b(where|find|located|location|how do i set|how to set|show me)\b/i.test(
        intentText,
      ) &&
      /\b(confirmations?|limits?|spend guard|per[- ]trade|cooldown|execution)\b/i.test(
        intentText,
      ),
    postSetupExecutionIntent:
      setupContext &&
      ((/\b(how|when|once|after|then)\b/i.test(intentText) && executionCue) ||
        nextStepCue),
    nextStepIntent: nextStepCue,
    setupNoTargetIntent:
      ((setupVerb && setupObject) || bareSetup) &&
      !marketsAppsPlanIntent &&
      !planningAdviceIntent,
    planningAdviceIntent,
  };
}

export function isLowContextInput(
  userText: string,
  opts: { agentOverviewIntent: boolean; workflowExplainIntent: boolean },
): boolean {
  const intentText = expandCryptoSlangContext(userText);
  const words = userText.trim().split(/\s+/).filter(Boolean);
  const wc = words.length;
  const isGreeting =
    /^(hey|hi|hello|yo|sup|gm|good morning|good afternoon|good evening|hola)\b/i.test(
      userText.trim(),
    );
  const asksQuestion =
    /\?/.test(intentText) ||
    /\b(how|what|why|where|when|can|should)\b/i.test(intentText);
  const hasObject =
    /\b(discord|telegram|polymarket|poly\s*market|prediction\s*market|wallet|portfolio|email|calendar|trip|plugin|model|provider|settings|milaidy|platform|workspace|plan|strategy|advice|crypto|trading|invest|wealth|risk|position|buy|sell|meme|coin|token)\b/i.test(
      intentText,
    );
  return (
    wc <= 7 &&
    !hasObject &&
    !asksQuestion &&
    !isGreeting &&
    !opts.agentOverviewIntent &&
    !opts.workflowExplainIntent
  );
}

export function resolveComponentTarget(
  userText: string,
  components: IntentComponent[],
  recentAssistantText?: string | null,
): IntentComponent | null {
  const lower = userText.toLowerCase();
  const normalized = lower.replace(/[^a-z0-9]+/g, " ");
  const upper = userText.toUpperCase();

  const direct =
    components.find((p) => lower.includes(p.id.toLowerCase())) ??
    components.find((p) => lower.includes(p.name.toLowerCase()));
  if (direct) return direct;

  const byConfigKey = components.find((p) =>
    (p.parameters ?? []).some((param) => {
      const key = (param.key ?? "").trim().toUpperCase();
      return key.length >= 4 && upper.includes(key);
    }),
  );
  if (byConfigKey) return byConfigKey;

  for (const alias of ALIASES) {
    if (alias.terms.some((t) => normalized.includes(t))) {
      const match = components.find((p) => p.id === alias.id);
      if (match) return match;
    }
  }

  if (recentAssistantText) {
    const setupMatch = /^([A-Za-z0-9 ._-]+)\s+setup\b/i.exec(
      recentAssistantText.trim(),
    );
    if (setupMatch?.[1]) {
      const name = setupMatch[1].trim().toLowerCase();
      const fromName = components.find((p) => p.name.toLowerCase() === name);
      if (fromName) return fromName;
    }
  }

  return null;
}
