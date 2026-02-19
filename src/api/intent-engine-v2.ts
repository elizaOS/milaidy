/**
 * Intent Engine V2
 *
 * Capability-aware, conversation-first routing helper.
 * This module is safe-by-default: it only returns a composed response when
 * confidence is high enough; otherwise callers should fall back to legacy flow.
 */

export type V2Category = "ai-provider" | "connector" | "database" | "feature";

export interface V2PluginSnapshot {
  id: string;
  name: string;
  category: V2Category;
  enabled: boolean;
  configured: boolean;
  validationErrors: Array<{ field: string; message?: string }>;
}

export interface CapabilityGraph {
  providersReady: string[];
  providersBlocked: string[];
  integrationsReady: string[];
  integrationsBlocked: string[];
  walletConnected: boolean;
  polymarketEnabled: boolean;
  polymarketReady: boolean;
}

export type InterpretedIntentKind =
  | "planning_advice"
  | "markets_apps_plan"
  | "platform_help"
  | "setup_flow"
  | "execution_capability"
  | "execution_request"
  | "acknowledgement"
  | "social"
  | "continuation"
  | "unknown";

export interface InterpretedIntent {
  kind: InterpretedIntentKind;
  confidence: number;
  goal: string;
}

export function buildCapabilityGraph(
  plugins: V2PluginSnapshot[],
  walletConnected: boolean,
): CapabilityGraph {
  const providersReady = plugins
    .filter(
      (p) =>
        p.category === "ai-provider" &&
        p.enabled &&
        p.configured &&
        p.validationErrors.length === 0,
    )
    .map((p) => p.name);

  const providersBlocked = plugins
    .filter(
      (p) =>
        p.category === "ai-provider" &&
        (p.validationErrors.length > 0 || !p.enabled || !p.configured),
    )
    .map((p) => p.name);

  const integrationsReady = plugins
    .filter(
      (p) =>
        p.category === "connector" &&
        p.enabled &&
        p.configured &&
        p.validationErrors.length === 0,
    )
    .map((p) => p.name);

  const integrationsBlocked = plugins
    .filter(
      (p) =>
        p.category === "connector" &&
        (!p.enabled || !p.configured || p.validationErrors.length > 0),
    )
    .map((p) => p.name);

  const polymarket = plugins.find((p) => p.id === "polymarket");
  const polymarketEnabled = Boolean(polymarket?.enabled);
  const polymarketReady = Boolean(
    polymarket &&
      polymarket.enabled &&
      polymarket.configured &&
      polymarket.validationErrors.length === 0,
  );

  return {
    providersReady,
    providersBlocked,
    integrationsReady,
    integrationsBlocked,
    walletConnected,
    polymarketEnabled,
    polymarketReady,
  };
}

export function interpretIntentV2(
  userText: string,
  opts?: { lastAssistantText?: string | null },
): InterpretedIntent {
  const text = userText.trim();
  const intentText = expandCryptoSlangContext(text);
  const lower = intentText.toLowerCase();
  const lastAssistant = (opts?.lastAssistantText ?? "").toLowerCase();

  const looksSocial =
    /^(hey|hi|hello|yo|gm|good morning|good afternoon|good evening|what'?s good|whats good|what'?s up)\b/.test(
      lower,
    ) || /\bhow are you\b/.test(lower);
  if (looksSocial) {
    return { kind: "social", confidence: 0.92, goal: text };
  }

  const acknowledgement =
    /^(thanks|thank you|thx|ty|nice|perfect|great|cool|awesome)[!. ]*$/i.test(
      intentText,
    );
  if (acknowledgement) {
    return { kind: "acknowledgement", confidence: 0.93, goal: text };
  }

  const continuation =
    (/^(continue|continue please|go on|carry on|proceed|yes continue|keep going)$/i.test(
      intentText.trim(),
    ) &&
      lastAssistant.length > 0) ||
    (/\b(continue|resume|pick up|where we left off|carry on)\b/.test(lower) &&
      !/\b(find|show|list|fetch|lookup|look up|bet|bets|trade|polymarket|market|markets|fed|rates|topic|topics)\b/.test(
        lower,
      ));
  if (continuation) {
    return { kind: "continuation", confidence: 0.92, goal: text };
  }

  const planningAdvice =
    /\b(plan|steps?|strategy|advice|roadmap|risk|allocation)\b/.test(lower) &&
    /\b(crypto|trading|invest|wealth|portfolio|solana|meme|btc|eth|sol)\b/.test(
      lower,
    );
  if (planningAdvice) {
    return { kind: "planning_advice", confidence: 0.95, goal: text };
  }

  const platformHelp =
    /\b(what can you do|how does this work|how this works|platform|workspace|agent)\b/.test(
      lower,
    );
  if (platformHelp) {
    return { kind: "platform_help", confidence: 0.9, goal: text };
  }

  const marketsAppsPlan =
    /\b(action plan|next action plan|next action|plan)\b/.test(lower) &&
    /\b(markets?\s*&?\s*apps?|markets and apps|integrations?|connectors?)\b/.test(
      lower,
    );
  if (marketsAppsPlan) {
    return { kind: "markets_apps_plan", confidence: 0.92, goal: text };
  }

  const setupVerb = /\b(setup|set up|configure|connect|enable|install)\b/.test(
    lower,
  );
  const setupObject =
    /\b(plugin|provider|integration|api key|token|discord|telegram|polymarket|openai|ollama|ai settings|markets?\s*&?\s*apps?)\b/.test(
      lower,
    );
  if (setupVerb && setupObject) {
    return { kind: "setup_flow", confidence: 0.88, goal: text };
  }

  const executionCapabilityAsk =
    /\b(can you|will you|are you able|would you)\b/.test(lower) &&
    /\b(execute|trade|bet|swap|send|transfer|run)\b/.test(lower);
  if (executionCapabilityAsk) {
    return { kind: "execution_capability", confidence: 0.9, goal: text };
  }

  const executionRequest =
    /\b(trade|bet|swap|transfer|send|execute|place)\b/.test(lower) &&
    /\b(now|for me|this|that|position|order)\b/.test(lower);
  if (executionRequest) {
    return { kind: "execution_request", confidence: 0.86, goal: text };
  }

  return { kind: "unknown", confidence: 0.2, goal: text };
}

export function composeResponseV2(
  intent: InterpretedIntent,
  graph: CapabilityGraph,
  opts?: { username?: string | null; priorGoal?: string | null },
): string | null {
  if (intent.confidence < 0.75) return null;

  const who = opts?.username ? ` ${opts.username}` : "";
  const providerLine = graph.providersReady.length
    ? graph.providersReady.join(", ")
    : "not connected";
  const integrationLine = graph.integrationsReady.length
    ? graph.integrationsReady.join(", ")
    : "none enabled";

  switch (intent.kind) {
    case "social":
      if (opts?.priorGoal) {
        return `Hey${who}, we’re currently on “${opts.priorGoal}”. Continue that or start a new task?`;
      }
      return `Hey${who}, Milaidy workspace is live. AI provider: ${providerLine}. Integrations: ${integrationLine}. What do you want to run first?`;

    case "acknowledgement":
      if (opts?.priorGoal) {
        return `Anytime. We can keep moving on “${opts.priorGoal}” when you’re ready.`;
      }
      return "Anytime. When you’re ready, send the next task and I’ll run it.";

    case "continuation":
      if (opts?.priorGoal) {
        return `Continuing from “${opts.priorGoal}”. Send the next detail and I’ll keep momentum.`;
      }
      return "I can continue immediately. Give one line of context and I’ll pick it up from there.";

    case "planning_advice":
      return (
        "I can do that. I’ll give you a practical, risk-aware plan rather than generic hype.\n" +
        "Before I draft the 5-step plan, confirm: time horizon and risk level (low / medium / high)."
      );

    case "markets_apps_plan":
      return (
        "Next action plan for Markets & Apps:\n" +
        "1) Pick one target workflow (alerts, social, trading, ops).\n" +
        `2) Keep only required integrations enabled (current: ${integrationLine}).\n` +
        "3) Configure credentials and run one smoke test per integration.\n" +
        "4) For money actions, enable confirmations/limits before execution.\n" +
        "5) Run one end-to-end task and keep only integrations that pass.\n" +
        "If you want, I’ll turn this into your exact checklist now."
      );

    case "platform_help":
      return (
        `Milaidy is an execution-focused workspace: you give a goal, I reason, then run through enabled components.\n` +
        `Provider ready: ${providerLine}. Integrations ready: ${integrationLine}.\n` +
        "For high-risk actions (trades/transfers/bets), confirmations and limits are always enforced."
      );

    case "setup_flow":
      return (
        "I can route setup immediately.\n" +
        "If it’s an AI provider: AI Settings.\n" +
        "If it’s an integration/app: Markets & Apps.\n" +
        "Tell me the exact name and I’ll give precise setup steps."
      );

    case "execution_capability":
      if (graph.polymarketReady && graph.walletConnected) {
        return (
          "Yes — execution is available when permissions and confirmations pass.\n" +
          "Tell me the exact action and amount, and I’ll prepare it safely."
        );
      }
      return (
        "Execution is possible once setup is complete.\n" +
        "Current blockers are usually integration readiness, wallet connection, or execution/safety toggles."
      );

    case "execution_request":
      if (!graph.walletConnected) {
        return "I can do that, but first connect a wallet in Portfolio so execution can proceed.";
      }
      if (!graph.polymarketReady) {
        return "I can prepare this, but the trading integration is not fully ready yet. Complete setup in Markets & Apps first.";
      }
      return "I can run this. Confirm your exact market/action/amount and I’ll prepare an execution-safe step.";

    case "unknown":
    default:
      return null;
  }
}
import { expandCryptoSlangContext } from "./crypto-slang.js";
