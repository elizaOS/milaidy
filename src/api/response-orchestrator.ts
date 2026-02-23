import { resolveComponentTarget } from "./intent-engine.js";
import { expandCryptoSlangContext } from "./crypto-slang.js";

export type OrchestratorCategory =
  | "ai-provider"
  | "connector"
  | "database"
  | "feature";

export interface OrchestratorPlugin {
  id: string;
  name: string;
  category: OrchestratorCategory;
  enabled: boolean;
  configured: boolean;
  validationErrors: Array<{ field: string; message?: string }>;
  parameters?: Array<{ key: string; required?: boolean }>;
}

export interface OrchestratorTurn {
  user: string;
  assistant: string;
}

export interface OrchestratorInput {
  userText: string;
  turns: OrchestratorTurn[];
  plugins: OrchestratorPlugin[];
  username?: string | null;
  walletConnected: boolean;
}

const PHATIC_RE =
  /^(hey|hi|hello|yo|sup|gm|good morning|good afternoon|good evening|hola|how are you|hows it going|how you doing|what'?s good|whats good|what'?s up)$/i;
const ACK_RE =
  /^(thanks|thank you|thx|ty|nice|great|awesome|cool|perfect|got it|sounds good)[!. ]*$/i;
const HELP_RE =
  /^(help|help me|can you help|i need help|assist me)[!. ]*$/i;
const CONTINUE_RE =
  /^(continue|continue please|go on|carry on|proceed|yes continue|keep going|run it|do it)$/i;

type UniversalIntentKind =
  | "acknowledgement"
  | "help"
  | "continuation"
  | "automation_scope"
  | "markets_apps_plan"
  | "setup"
  | "execution_workflow"
  | "planning"
  | "platform"
  | "execution_capability"
  | "execution_request"
  | "social"
  | "unknown";

function isFillerMessage(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed) return true;
  return (
    PHATIC_RE.test(trimmed) ||
    ACK_RE.test(trimmed) ||
    HELP_RE.test(trimmed) ||
    CONTINUE_RE.test(trimmed) ||
    /^(yes|no|okay|ok|sure|yep|nope)[!. ]*$/i.test(trimmed)
  );
}

export function pickActiveGoal(turns: OrchestratorTurn[]): string {
  const recent = [...turns].reverse();
  for (const turn of recent) {
    const candidate = turn.user?.trim() ?? "";
    if (!candidate || candidate.length < 8) continue;
    if (isFillerMessage(candidate)) continue;
    return candidate.replace(/\s+/g, " ").slice(0, 120);
  }
  return "";
}

function classify(userText: string): UniversalIntentKind {
  const t = expandCryptoSlangContext(userText.trim());
  const lower = t.toLowerCase();
  const socialLead =
    /\b(hey|hi|hello|yo|gm|good morning|good afternoon|good evening|what'?s good|whats good|what'?s up)\b/i.test(
      t,
    ) || /\bhow are you\b/i.test(t);

  if (ACK_RE.test(t)) return "acknowledgement";
  if (HELP_RE.test(t)) return "help";
  if (CONTINUE_RE.test(t)) return "continuation";
  if (PHATIC_RE.test(t) || socialLead) return "social";

  const setupVerb =
    /\b(setup|set up|configure|config|connect|enable|install|plug in)\b/i.test(
      t,
    );
  const marketsAppsPlan =
    /\b(action plan|next action plan|next action|plan)\b/i.test(t) &&
    /\b(markets?\s*&?\s*apps?|markets and apps|integrations?|connectors?)\b/i.test(
      t,
    );
  const setupObject =
    /\b(plugin|provider|integration|connector|api key|token|credential|discord|telegram|polymarket|openai|ollama|ai settings|markets?\s*&?\s*apps?)\b/i.test(
      t,
    );
  if (marketsAppsPlan) return "markets_apps_plan";
  if (setupVerb && setupObject) return "setup";

  const planning =
    (/\b(plan|steps?|strategy|advice|roadmap|risk|allocation|goal)\b/i.test(t) &&
      /\b(crypto|trading|invest|wealth|portfolio|solana|meme|btc|eth|retirement|budget)\b/i.test(
        t,
      )) ||
    (/\b(should i|what should i do|is it smart|worth it|good idea)\b/i.test(
      t,
    ) &&
      /\b(ape|all in|full port|yolo|meme|memes|coin|coins|token|tokens|crypto|trading|portfolio|position|risk|buy|sell|btc|eth|sol)\b/i.test(
        t,
      ));
  if (planning) return "planning";

  const automationScope =
    /\b(automate|automation|at one time|how much|how many|capacity|scale|limits?)\b/i.test(
      t,
    ) &&
    /\b(workspace|platform|app|apps|integrations?|plugins?)\b/i.test(t);
  if (automationScope) return "automation_scope";

  const platform =
    /\b(what can you do|how does this work|how this works|platform|workspace|agent|milaidy)\b/i.test(
      t,
    ) && !socialLead;
  if (platform) return "platform";

  const executionWorkflow =
    /\b(how|explain|workflow|process)\b/i.test(t) &&
    /\b(execute|execution|run|place|bet|polymarket)\b/i.test(t);
  if (executionWorkflow) return "execution_workflow";

  // Market-intel requests should not be treated as execution attempts.
  const polymarketInfoIntent =
    /\b(polymarket|poly market|poly|market|markets)\b/i.test(t) &&
    /\b(hot|trending|current|live|list|show|what are|why)\b/i.test(t);
  if (polymarketInfoIntent) return "unknown";

  const executionCapability =
    /\b(can you|will you|are you able|would you)\b/i.test(t) &&
    /\b(execute|trade|bet|swap|send|transfer|run)\b/i.test(t);
  if (executionCapability) return "execution_capability";

  const executionRequest =
    /\b(trade|bet|swap|transfer|send|execute|place)\b/i.test(t) &&
    /\b(now|for me|this|that|position|order)\b/i.test(t);
  if (executionRequest) return "execution_request";

  return "unknown";
}

function prettyProviderName(plugin: OrchestratorPlugin): string {
  const byId: Record<string, string> = {
    openai: "OpenAI",
    xai: "xAI",
    "google-genai": "Google GenAI",
    "vercel-ai-gateway": "Vercel AI Gateway",
  };
  return byId[plugin.id] ?? plugin.name;
}

function buildCapability(plugins: OrchestratorPlugin[]) {
  const providersReady = plugins
    .filter(
      (p) =>
        p.category === "ai-provider" &&
        p.enabled &&
        p.configured &&
        p.validationErrors.length === 0,
    )
    .map((p) => prettyProviderName(p));
  const integrationsReady = plugins
    .filter(
      (p) =>
        p.category === "connector" &&
        p.enabled &&
        p.configured &&
        p.validationErrors.length === 0,
    )
    .map((p) => p.name);
  return {
    providersReady,
    integrationsReady,
  };
}

function pickVariant(seed: string, count: number): number {
  if (count <= 1) return 0;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return hash % count;
}

function polymarketBlockers(target: OrchestratorPlugin | null): string[] {
  if (!target) return ["Polymarket integration not found"];
  const missing = (target.validationErrors ?? []).map((e) => e.field);
  return missing.map((field) => {
    const key = field.toUpperCase();
    if (key.includes("PRIVATE_KEY") || key.includes("SECRET")) {
      return "trading signer is not configured";
    }
    if (key.includes("API_KEY") || key.includes("TOKEN")) {
      return "required credentials are missing";
    }
    return field;
  });
}

export function orchestrateUniversalReply(input: OrchestratorInput): string | null {
  const userText = input.userText.trim();
  if (!userText) return null;

  const kind = classify(userText);
  const who = input.username?.trim() ? ` ${input.username.trim()}` : "";
  const activeGoal = pickActiveGoal(input.turns);
  const cap = buildCapability(input.plugins);
  const target = resolveComponentTarget(userText, input.plugins);

  switch (kind) {
    case "acknowledgement":
      return activeGoal
        ? `Anytime. We can keep moving on “${activeGoal}” whenever you’re ready.`
        : "Anytime. When you’re ready, send the next task and I’ll run it.";

    case "help":
      return activeGoal
        ? `Happy to help. Do you want to continue with “${activeGoal}” or start a new task?`
        : "Happy to help. Tell me what you want to do first and I’ll take the next step.";

    case "continuation":
      return activeGoal
        ? `Continuing from “${activeGoal}”. Send the next detail and I’ll keep momentum.`
        : "I can continue immediately. Give one line of context and I’ll pick it up from there.";

    case "social":
      if (
        !/\bhow are you\b/i.test(userText) &&
        /\b(are you|you are|u r|ur)\b/i.test(userText) &&
        /\b(milaidy|milady|my lady)\b/i.test(userText)
      ) {
        const options = [
          "Yeah, I’m Milaidy. Want to run something now?",
          "Yes, this is Milaidy. What do you want to work on?",
          "Yep, you’ve got Milaidy. What should we do next?",
        ] as const;
        return options[
          pickVariant(`${userText}|${input.turns.length}|identity`, options.length)
        ]!;
      }
      if (/\bhow are you\b/i.test(userText)) {
        if (activeGoal) {
          const options = [
            `I’m good. We’re still on “${activeGoal}” if you want to keep going.`,
            `Doing good. Want to continue “${activeGoal}” or switch it up?`,
            `All good here. We can keep moving on “${activeGoal}” whenever you want.`,
          ] as const;
          return options[
            pickVariant(
              `${userText}|${activeGoal}|${input.turns.length}`,
              options.length,
            )
          ]!;
        }
        const options = [
          "I’m good. What’s on your mind right now?",
          "Doing well. What are you trying to get done today?",
          "All good here. Want to plan something or solve something specific?",
        ] as const;
        return options[
          pickVariant(`${userText}|${input.turns.length}`, options.length)
        ]!;
      }
      if (activeGoal) {
        return `Hey${who}, we’re currently on “${activeGoal}”. Continue that or switch goals?`;
      }
      {
        const variants = [
          `Hey${who}, Milaidy is live. Provider: ${cap.providersReady.length ? cap.providersReady.join(", ") : "not connected"}. Integrations: ${cap.integrationsReady.length ? cap.integrationsReady.join(", ") : "none enabled"}. What do you want to work on?`,
          `Hey${who}, ready to go. AI provider: ${cap.providersReady.length ? cap.providersReady.join(", ") : "not connected"}. Markets & Apps: ${cap.integrationsReady.length ? cap.integrationsReady.join(", ") : "none enabled"}. What are we solving today?`,
          `Hey${who}. Milaidy workspace is up. Provider ready: ${cap.providersReady.length ? cap.providersReady.join(", ") : "not connected"}. Integrations ready: ${cap.integrationsReady.length ? cap.integrationsReady.join(", ") : "none enabled"}. Drop your goal and I’ll map it.`,
        ];
        return variants[pickVariant(`${userText}|${input.turns.length}`, variants.length)];
      }

    case "planning":
      return (
        "I can do that. I’ll give you a practical, risk-aware plan rather than generic hype.\n" +
        "Before I draft it, confirm your time horizon and risk level (low / medium / high)."
      );

    case "automation_scope": {
      const integrationsCount = cap.integrationsReady.length;
      return (
        "You can automate multi-step workflows across any integrations you enable in Markets & Apps.\n" +
        `Current connected integrations: ${integrationsCount} (${integrationsCount ? cap.integrationsReady.join(", ") : "none enabled"}).\n` +
        "In practice: research -> decision -> execution -> follow-up can run in one flow.\n" +
        "For high-risk actions (trades/transfers/bets), confirmations and limits stay enforced.\n" +
        "If you want, give me 2 integrations + your goal and I’ll map the exact automation flow."
      );
    }

    case "markets_apps_plan": {
      const integrationsCount = cap.integrationsReady.length;
      const enabled = integrationsCount
        ? cap.integrationsReady.join(", ")
        : "none enabled";
      return (
        "Next action plan for Markets & Apps:\n" +
        `1) Confirm your target workflow (alerts, social posting, trading, or ops).\n` +
        `2) Keep only required integrations enabled (current: ${enabled}).\n` +
        "3) Configure credentials + run one smoke test per integration.\n" +
        "4) For money actions, set Security confirmations/limits before execution.\n" +
        "5) Run one end-to-end task and keep what passes; disable noisy integrations.\n" +
        "If you want, I can generate this as a concrete checklist for your exact integrations."
      );
    }

    case "platform":
      return (
        "Milaidy is an agent workspace: you set a goal, I plan steps, then execute through enabled components.\n" +
        `AI provider: ${cap.providersReady.length ? cap.providersReady.join(", ") : "not connected"}.\n` +
        `Markets & Apps enabled: ${cap.integrationsReady.length ? cap.integrationsReady.join(", ") : "none enabled"}.\n` +
        "Typical flow is chat -> plan -> action -> confirmation (for spend/bet) -> result.\n" +
        "If you want, I can walk your exact workflow from setup to first execution."
      );

    case "execution_workflow": {
      const polymarket = input.plugins.find((p) => p.id === "polymarket") ?? null;
      const missing = polymarketBlockers(polymarket);
      const isReady =
        Boolean(polymarket?.enabled) &&
        Boolean(polymarket?.configured) &&
        (polymarket?.validationErrors?.length ?? 0) === 0 &&
        input.walletConnected;
      const lines: string[] = [];
      lines.push("Polymarket execution flow on your behalf is:");
      lines.push("1) You give market, outcome, and amount in chat.");
      lines.push("2) I validate plugin readiness, wallet state, and permissions.");
      lines.push(
        "3) I enforce Security rules (confirmation, spend limits, cooldown, execution toggle).",
      );
      lines.push("4) If approved, I execute and log it in Security/audit.");
      if (isReady) {
        lines.push("");
        lines.push("Status now: execution-ready.");
      } else {
        lines.push("");
        lines.push(`Status now: not ready (${missing.join(", ")}).`);
        lines.push(
          "Next: Markets & Apps -> Polymarket -> Manage, save, restart Milaidy. Then turn Polymarket execution ON in Security.",
        );
      }
      return lines.join("\n");
    }

    case "setup":
      if (target) {
        const settingsTab =
          target.category === "ai-provider" ? "AI Settings" : "Markets & Apps";
        return `To set up ${target.name}: open ${settingsTab} -> ${target.name} -> Manage, complete required fields, save, restart Milaidy.`;
      }
      return (
        "I can route setup immediately.\n" +
        "If it’s an AI provider: AI Settings.\n" +
        "If it’s an integration/app: Markets & Apps.\n" +
        "Tell me the exact name and I’ll give precise setup steps."
      );

    case "execution_capability": {
      const hypotheticalSetupCompleteAsk =
        /\b(when|once|if)\b/i.test(userText) &&
        /\b(setup|set up|configured|ready|complete)\b/i.test(userText);
      if (hypotheticalSetupCompleteAsk) {
        return (
          "Once setup is complete, I can place Polymarket orders on the live markets you choose.\n" +
          "You specify: market question, outcome, and amount. I handle validation, security checks, and execution.\n" +
          "Scope still follows your guardrails (allowed markets, per-trade cap, daily cap, cooldown, and confirmation rules)."
        );
      }
      const polymarket = input.plugins.find((p) => p.id === "polymarket") ?? null;
      const ready =
        Boolean(polymarket?.enabled) &&
        Boolean(polymarket?.configured) &&
        (polymarket?.validationErrors?.length ?? 0) === 0 &&
        input.walletConnected;
      if (ready) {
        return "Execution is available. Tell me the exact market, outcome, and amount, and I’ll prepare a confirmation-safe action.";
      }
      const blockers = polymarketBlockers(polymarket);
      return (
        `Execution for Polymarket is currently blocked by setup.\n` +
        `Missing: ${blockers.join(", ")}.\n` +
        `Next: Markets & Apps -> Polymarket -> Manage, save, restart Milaidy.\n` +
        `${input.walletConnected ? "Then set Security -> Polymarket execution to ON and keep confirmations ON." : "Then connect wallet in Portfolio, set Security -> Polymarket execution to ON, keep confirmations ON."}`
      );
    }

    case "execution_request": {
      const polymarket = input.plugins.find((p) => p.id === "polymarket") ?? null;
      const ready =
        Boolean(polymarket?.enabled) &&
        Boolean(polymarket?.configured) &&
        (polymarket?.validationErrors?.length ?? 0) === 0 &&
        input.walletConnected;
      if (ready) {
        return "Execution is available. Tell me the exact market, outcome, and amount, and I’ll prepare a confirmation-safe action.";
      }
      const blockers = polymarketBlockers(polymarket);
      return (
        `Execution for Polymarket is currently blocked by setup.\n` +
        `Missing: ${blockers.join(", ")}.\n` +
        `Next: Markets & Apps -> Polymarket -> Manage, save, restart Milaidy.\n` +
        `${input.walletConnected ? "Then set Security -> Polymarket execution to ON and keep confirmations ON." : "Then connect wallet in Portfolio, set Security -> Polymarket execution to ON, keep confirmations ON."}`
      );
    }

    case "unknown":
    default:
      return null;
  }
}
