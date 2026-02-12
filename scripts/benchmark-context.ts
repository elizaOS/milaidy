#!/usr/bin/env bun
/**
 * Context Benchmark — Measures ACTUAL token cost of the current prompt assembly.
 *
 * Gets real action/provider data from the runtime debug endpoint (which calls
 * composeState internally to measure real provider output sizes).
 *
 * Usage: bun run scripts/benchmark-context.ts
 * Requires: dev server running at localhost:2138
 */

const BASE = "http://localhost:2138";

function estimateTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

async function fetchJson(path: string) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

async function sendChat(text: string): Promise<{ text: string; latencyMs: number }> {
  const start = Date.now();
  try {
    const res = await fetch(`${BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    const data = await res.json();
    const latencyMs = Date.now() - start;
    const responseText = data.text || data.response || JSON.stringify(data).slice(0, 500);
    return { text: responseText, latencyMs };
  } catch (err) {
    return { text: `ERROR: ${err}`, latencyMs: Date.now() - start };
  }
}

interface ActionDetail {
  name: string;
  descriptionLength: number;
  parameterCount: number;
  exampleCount: number;
}

interface DebugContext {
  actionCount: number;
  actions: ActionDetail[];
  providerCount: number;
  providers: string[];
  pluginCount: number;
  plugins: string[];
  providerOutputSizes: Record<string, number>;
  totalStateChars: number;
}

function pad(s: string, w: number, align: "left" | "right" = "right"): string {
  return align === "left" ? s.padEnd(w) : s.padStart(w);
}

async function main() {
  console.log("╔═══════════════════════════════════════════════╗");
  console.log("║        MILAIDY CONTEXT BENCHMARK              ║");
  console.log("║   Real data from runtime composeState()        ║");
  console.log("╚═══════════════════════════════════════════════╝\n");

  // 1. Check agent is running
  const status = await fetchJson("/api/status");
  if (status.state !== "running") {
    console.error("Agent is not running. Start with: bun run dev");
    process.exit(1);
  }
  console.log(`Agent:    ${status.agentName}`);
  console.log(`Model:    ${status.model}`);
  console.log(`Provider: ${status.provider}`);
  console.log(`Fallback: ${status.fallbackActive ? "YES (using cloud instead of subscription)" : "no"}\n`);

  // 2. Get REAL data from debug endpoint (calls composeState internally)
  console.log("Fetching runtime context data (calls composeState)...\n");
  let ctx: DebugContext;
  try {
    ctx = await fetchJson("/api/debug/context");
  } catch (err) {
    console.error(`Failed to get debug context: ${err}`);
    process.exit(1);
  }

  const totalStateTokens = estimateTokens(ctx.totalStateChars);

  console.log(`Loaded plugins:       ${ctx.pluginCount}`);
  console.log(`Registered actions:   ${ctx.actionCount}`);
  console.log(`Registered providers: ${ctx.providerCount}`);
  console.log(`Total state output:   ${ctx.totalStateChars.toLocaleString()} chars (~${totalStateTokens.toLocaleString()} tokens)`);

  // 3. Provider output breakdown (REAL MEASURED DATA)
  console.log("\n\n═══ PROVIDER OUTPUT SIZES (MEASURED) ═══\n");
  console.log("These are the ACTUAL character counts from composeState().\n");

  const sizes = ctx.providerOutputSizes;
  const sorted = Object.entries(sizes)
    .filter(([_, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);

  console.log(`${"Provider".padEnd(42)} ${"Chars".padStart(8)} ${"~Tokens".padStart(8)} ${"% Total".padStart(8)}`);
  console.log("-".repeat(68));

  // Group into categories
  const categories: Record<string, { chars: number; items: [string, number][] }> = {
    "Action-related": { chars: 0, items: [] },
    "Provider context": { chars: 0, items: [] },
    "Character/persona": { chars: 0, items: [] },
    "Conversation/messages": { chars: 0, items: [] },
    "Plugin state": { chars: 0, items: [] },
    "Other": { chars: 0, items: [] },
  };

  const actionKeys = ["actionsWithDescriptions", "actionExamples", "actionCallExamples", "actionNames", "actionResults", "recentActionResults", "hasActionResults", "hasActionPlan", "currentActionStep", "totalActionSteps", "completedActions", "failedActions"];
  const providerKeys = ["providers", "providersWithDescriptions"];
  const charKeys = ["system", "bio", "topics", "adjective", "agentName", "characterPostExamples", "characterMessageExamples", "messageDirections", "directions", "postDirections", "examples"];
  const msgKeys = ["recentMessage", "recentMessages", "recentPosts", "recentMessageInteractions", "recentPostInteractions", "recentInteractions"];
  const pluginKeys = ["originalPlugins", "protectedPlugins", "registryAvailable", "enabled", "configurationServicesAvailable", "hasUnconfiguredPlugins", "totalPlugins", "loadedCount", "errorCount", "readyCount", "unloadedCount", "configuredPlugins", "needsConfiguration", "availableCount", "installedCount", "pluginState"];

  for (const [key, chars] of sorted) {
    let cat = "Other";
    if (actionKeys.includes(key)) cat = "Action-related";
    else if (providerKeys.includes(key)) cat = "Provider context";
    else if (charKeys.includes(key)) cat = "Character/persona";
    else if (msgKeys.includes(key)) cat = "Conversation/messages";
    else if (pluginKeys.includes(key)) cat = "Plugin state";
    categories[cat].chars += chars;
    categories[cat].items.push([key, chars]);
  }

  for (const [catName, cat] of Object.entries(categories)) {
    if (cat.chars === 0) continue;
    const pct = ((cat.chars / ctx.totalStateChars) * 100).toFixed(1);
    console.log(`\n  ${catName} (${cat.chars.toLocaleString()} chars, ~${estimateTokens(cat.chars).toLocaleString()} tokens, ${pct}%)`);
    for (const [key, chars] of cat.items) {
      if (chars < 5) continue;
      const tokens = estimateTokens(chars);
      const pct = ((chars / ctx.totalStateChars) * 100).toFixed(1);
      console.log(`    ${key.padEnd(40)} ${chars.toLocaleString().padStart(8)} ${("~" + tokens.toLocaleString()).padStart(8)} ${(pct + "%").padStart(8)}`);
    }
  }

  // 4. Action detail analysis
  console.log("\n\n═══ ACTION ANALYSIS ═══\n");

  const totalDescChars = ctx.actions.reduce((sum, a) => sum + a.descriptionLength, 0);
  const totalParams = ctx.actions.reduce((sum, a) => sum + a.parameterCount, 0);
  const totalExamples = ctx.actions.reduce((sum, a) => sum + a.exampleCount, 0);

  console.log(`Total actions:           ${ctx.actionCount}`);
  console.log(`Total description chars: ${totalDescChars.toLocaleString()}`);
  console.log(`Total parameters:        ${totalParams}`);
  console.log(`Total examples defined:  ${totalExamples}`);
  console.log(`Avg description:         ${(totalDescChars / ctx.actionCount).toFixed(0)} chars`);
  console.log(`Avg params/action:       ${(totalParams / ctx.actionCount).toFixed(1)}`);

  // Real action token cost (from measured composeState output)
  const realActionChars =
    (sizes.actionsWithDescriptions || 0) +
    (sizes.actionExamples || 0) +
    (sizes.actionCallExamples || 0) +
    (sizes.actionNames || 0);
  const realActionTokens = estimateTokens(realActionChars);

  console.log(`\nMeasured action context: ${realActionChars.toLocaleString()} chars (~${realActionTokens.toLocaleString()} tokens)`);
  console.log(`  actionsWithDescriptions: ${(sizes.actionsWithDescriptions || 0).toLocaleString()} chars`);
  console.log(`  actionExamples:          ${(sizes.actionExamples || 0).toLocaleString()} chars`);
  console.log(`  actionCallExamples:      ${(sizes.actionCallExamples || 0).toLocaleString()} chars`);
  console.log(`  actionNames:             ${(sizes.actionNames || 0).toLocaleString()} chars`);

  console.log("\nTop 10 largest actions by description:");
  const sortedActions = [...ctx.actions].sort((a, b) => b.descriptionLength - a.descriptionLength);
  for (const a of sortedActions.slice(0, 10)) {
    console.log(`  ${a.name.padEnd(30)} ${a.descriptionLength} chars, ${a.parameterCount} params, ${a.exampleCount} examples`);
  }

  // 5. Token cost summary
  console.log("\n\n═══ TOKEN COST SUMMARY (REAL DATA) ═══\n");

  const providerContextChars = (sizes.providers || 0) + (sizes.providersWithDescriptions || 0);
  const characterChars = (sizes.system || 0) + (sizes.bio || 0) + (sizes.topics || 0) +
    (sizes.characterPostExamples || 0) + (sizes.characterMessageExamples || 0) +
    (sizes.messageDirections || 0) + (sizes.directions || 0) + (sizes.postDirections || 0) +
    (sizes.examples || 0);
  const msgChars = (sizes.recentMessage || 0) + (sizes.recentMessages || 0) +
    (sizes.recentPosts || 0) + (sizes.recentMessageInteractions || 0) +
    (sizes.recentPostInteractions || 0) + (sizes.recentInteractions || 0);

  const summary = [
    { name: "Provider context text", chars: providerContextChars },
    { name: "Action definitions", chars: realActionChars },
    { name: "Character/persona", chars: characterChars },
    { name: "Messages/conversation", chars: msgChars },
    { name: "Plugin state", chars: categories["Plugin state"].chars },
    { name: "Other", chars: categories["Other"].chars },
  ];

  console.log(`${"Component".padEnd(30)} ${"Chars".padStart(10)} ${"~Tokens".padStart(10)} ${"% Total".padStart(10)}`);
  console.log("-".repeat(62));
  for (const s of summary) {
    const tokens = estimateTokens(s.chars);
    const pct = ((s.chars / ctx.totalStateChars) * 100).toFixed(1);
    console.log(`${s.name.padEnd(30)} ${s.chars.toLocaleString().padStart(10)} ${("~" + tokens.toLocaleString()).padStart(10)} ${(pct + "%").padStart(10)}`);
  }
  console.log("-".repeat(62));
  console.log(`${"TOTAL".padEnd(30)} ${ctx.totalStateChars.toLocaleString().padStart(10)} ${("~" + totalStateTokens.toLocaleString()).padStart(10)} ${"100%".padStart(10)}`);

  // 6. Key insight
  console.log("\n\n═══ KEY INSIGHT ═══\n");

  const providerPct = ((providerContextChars / ctx.totalStateChars) * 100).toFixed(1);
  const actionPct = ((realActionChars / ctx.totalStateChars) * 100).toFixed(1);
  const charPct = ((characterChars / ctx.totalStateChars) * 100).toFixed(1);

  console.log(`The "providers" field alone is ${(sizes.providers || 0).toLocaleString()} chars (~${estimateTokens(sizes.providers || 0).toLocaleString()} tokens) = ${(((sizes.providers || 0) / ctx.totalStateChars) * 100).toFixed(1)}% of total context.`);
  console.log(`This contains ALL provider text concatenated into a single string.`);
  console.log();
  console.log(`Provider context text: ${providerPct}% (${estimateTokens(providerContextChars).toLocaleString()} tokens)`);
  console.log(`Action definitions:    ${actionPct}% (${estimateTokens(realActionChars).toLocaleString()} tokens)`);
  console.log(`Character/persona:     ${charPct}% (${estimateTokens(characterChars).toLocaleString()} tokens)`);

  // 7. Optimization projections
  console.log("\n\n═══ OPTIMIZATION PROJECTIONS ═══\n");

  // Strategy 1: Deferred action loading
  const coreActionChars = 500; // Keep ~5 core actions, ~100 chars each
  const searchToolChars = 300; // search_tools definition
  const deferredActionSavings = realActionChars - coreActionChars - searchToolChars;

  // Strategy 2: Provider deduplication (found duplicates: session, sessionSkills, sendPolicy, ENTITIES, ATTACHMENTS)
  // "providers" field has all provider text. Many providers are registered twice.
  const duplicateProviderSavings = Math.round(providerContextChars * 0.15); // conservative 15% from dedup

  // Strategy 3: Lazy provider evaluation (only run providers relevant to the message)
  const lazyProviderSavings = Math.round(providerContextChars * 0.4); // 40% - most context is always-on providers

  // Strategy 4: Character examples pruning (not all examples needed every turn)
  const examplePruningSavings = Math.round(characterChars * 0.3); // 30% of character examples

  const strategies = [
    {
      name: "Deferred action loading",
      description: "Keep 5 core actions, defer rest behind search tool",
      savings: deferredActionSavings,
    },
    {
      name: "Provider deduplication",
      description: "Remove duplicate providers (session, sessionSkills, sendPolicy, etc.)",
      savings: duplicateProviderSavings,
    },
    {
      name: "Lazy provider evaluation",
      description: "Only run providers relevant to the message context",
      savings: lazyProviderSavings,
    },
    {
      name: "Example pruning",
      description: "Rotate examples instead of including all every turn",
      savings: examplePruningSavings,
    },
  ];

  let totalSavings = 0;
  console.log(`${"Strategy".padEnd(35)} ${"Token savings".padStart(14)} ${"% of total".padStart(12)}`);
  console.log("-".repeat(63));
  for (const s of strategies) {
    const tokens = estimateTokens(s.savings);
    const pct = ((s.savings / ctx.totalStateChars) * 100).toFixed(1);
    totalSavings += s.savings;
    console.log(`${s.name.padEnd(35)} ${("~" + tokens.toLocaleString()).padStart(14)} ${(pct + "%").padStart(12)}`);
    console.log(`  ${s.description}`);
  }
  console.log("-".repeat(63));
  const totalSavingsTokens = estimateTokens(totalSavings);
  const totalSavingsPct = ((totalSavings / ctx.totalStateChars) * 100).toFixed(1);
  console.log(`${"COMBINED SAVINGS".padEnd(35)} ${("~" + totalSavingsTokens.toLocaleString()).padStart(14)} ${(totalSavingsPct + "%").padStart(12)}`);

  const afterChars = ctx.totalStateChars - totalSavings;
  const afterTokens = estimateTokens(afterChars);
  console.log(`\nBEFORE: ~${totalStateTokens.toLocaleString()} tokens/turn (${ctx.totalStateChars.toLocaleString()} chars)`);
  console.log(`AFTER:  ~${afterTokens.toLocaleString()} tokens/turn (${afterChars.toLocaleString()} chars)`);
  console.log(`REDUCTION: ${totalSavingsPct}%`);

  // 8. Cost impact
  console.log("\n\n═══ COST IMPACT ═══\n");

  const turnsPerDay = 100;
  const daysPerMonth = 30;
  const pricing = [
    { name: "Claude Sonnet 4.5", inputPerMToken: 3 },
    { name: "Claude Opus 4", inputPerMToken: 15 },
  ];

  for (const model of pricing) {
    const monthlyBefore = (totalStateTokens * turnsPerDay * daysPerMonth / 1_000_000) * model.inputPerMToken;
    const monthlyAfter = (afterTokens * turnsPerDay * daysPerMonth / 1_000_000) * model.inputPerMToken;
    console.log(`${model.name} ($${model.inputPerMToken}/M input, ${turnsPerDay} turns/day):`);
    console.log(`  Before: $${monthlyBefore.toFixed(2)}/month → After: $${monthlyAfter.toFixed(2)}/month → Save: $${(monthlyBefore - monthlyAfter).toFixed(2)}/month`);
  }

  // 9. Tool selection accuracy test
  console.log("\n\n═══ TOOL SELECTION ACCURACY TEST ═══\n");
  console.log("Sending test messages to verify the agent uses appropriate tools.\n");

  const testCases = [
    {
      prompt: "What time is it?",
      expectedMention: ["time", "clock", "am", "pm", "utc"],
      category: "basic-query",
    },
    {
      prompt: "Send a message to @alice on Discord",
      expectedMention: ["discord", "message", "send", "alice"],
      category: "discord-action",
    },
    {
      prompt: "Check my Solana wallet balance",
      expectedMention: ["solana", "wallet", "balance", "sol", "address"],
      category: "crypto-action",
    },
    {
      prompt: "Post a tweet about AI agents",
      expectedMention: ["tweet", "post", "x", "twitter", "bird", "skill"],
      category: "social-action",
    },
  ];

  let passed = 0;

  for (const tc of testCases) {
    const result = await sendChat(tc.prompt);
    const lower = result.text.toLowerCase();
    const mentionsAny = tc.expectedMention.some((kw) => lower.includes(kw.toLowerCase()));

    const badge = mentionsAny ? "PASS" : "WEAK";
    if (mentionsAny) passed++;

    console.log(`  [${badge}] "${tc.prompt}"`);
    console.log(`        ${result.latencyMs}ms | ${result.text.slice(0, 140)}`);
    console.log();

    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log(`Tool selection score: ${passed}/${testCases.length} (${((passed / testCases.length) * 100).toFixed(0)}%)`);
  console.log("WEAK = response didn't contain expected keywords (may still be correct).\n");

  // 10. Summary
  console.log("\n╔═══════════════════════════════════════════════╗");
  console.log("║              BENCHMARK SUMMARY                 ║");
  console.log("╚═══════════════════════════════════════════════╝\n");
  console.log(`Actions:              ${ctx.actionCount} registered`);
  console.log(`Providers:            ${ctx.providerCount} registered (${sorted.length} with output)`);
  console.log(`Plugins:              ${ctx.pluginCount} loaded`);
  console.log(`Context per turn:     ~${totalStateTokens.toLocaleString()} tokens (${ctx.totalStateChars.toLocaleString()} chars)`);
  console.log(`Biggest cost:         "providers" field at ${estimateTokens(sizes.providers || 0).toLocaleString()} tokens (${(((sizes.providers || 0) / ctx.totalStateChars) * 100).toFixed(0)}%)`);
  console.log(`Projected savings:    ~${totalSavingsTokens.toLocaleString()} tokens/turn (${totalSavingsPct}%)`);
  console.log(`After optimization:   ~${afterTokens.toLocaleString()} tokens/turn`);
  console.log(`Tool selection:       ${passed}/${testCases.length}`);
}

main().catch(console.error);
