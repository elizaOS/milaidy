#!/usr/bin/env bun
/**
 * Action Name Collision Audit — Static analysis of action names to detect
 * substring collisions that could cause misrouting in ElizaOS's 4-tier
 * action lookup.
 *
 * ElizaOS resolves action names from LLM output via 4 tiers:
 *   Tier 1 (exact):          normalize(actionName) === normalize(llmOutput)
 *   Tier 2 (substring):      normalizedA.includes(normalizedB) — first match wins
 *   Tier 3 (simile exact):   Exact match on action aliases
 *   Tier 4 (fuzzy simile):   Substring match on aliases
 *
 * Usage: bun run scripts/audit-action-collisions.ts
 * Requires: dev server running at localhost:2138
 */

const BASE = "http://localhost:2138";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ActionInfo {
  name: string;
  descriptionLength: number;
  parameterCount: number;
  exampleCount: number;
  similes: string[];
}

interface DebugContext {
  actions: ActionInfo[];
  [key: string]: unknown;
}

interface CollisionPair {
  actionA: string;
  actionB: string;
  normA: string;
  normB: string;
  direction: "A⊃B" | "B⊃A" | "both";
  shorterNorm: string;
}

interface SimileCollision {
  actionA: string;
  simileA: string;
  actionB: string;
  nameOrSimileB: string;
  normSimileA: string;
  normB: string;
  kind: "exact" | "substring";
  tier: 3 | 4;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Matches ElizaOS core normalization exactly. */
function normalize(s: string): string {
  return s.toLowerCase().replace(/_/g, "");
}

async function fetchJson(path: string) {
  const res = await fetch(`${BASE}${path}`);
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

function detectNameCollisions(actions: ActionInfo[]): CollisionPair[] {
  const pairs: CollisionPair[] = [];
  for (let i = 0; i < actions.length; i++) {
    for (let j = i + 1; j < actions.length; j++) {
      const a = actions[i];
      const b = actions[j];
      const normA = normalize(a.name);
      const normB = normalize(b.name);

      if (normA === normB) {
        // Exact duplicate after normalization — always dangerous
        pairs.push({
          actionA: a.name,
          actionB: b.name,
          normA,
          normB,
          direction: "both",
          shorterNorm: normA,
        });
        continue;
      }

      const aIncludesB = normA.includes(normB);
      const bIncludesA = normB.includes(normA);

      if (aIncludesB || bIncludesA) {
        const direction: CollisionPair["direction"] =
          aIncludesB && bIncludesA ? "both" : aIncludesB ? "A⊃B" : "B⊃A";
        const shorterNorm = normA.length <= normB.length ? normA : normB;
        pairs.push({
          actionA: a.name,
          actionB: b.name,
          normA,
          normB,
          direction,
          shorterNorm,
        });
      }
    }
  }

  // Sort by length of shorter normalized name (shorter = more collision-prone)
  pairs.sort((a, b) => a.shorterNorm.length - b.shorterNorm.length);
  return pairs;
}

function detectSimileToNameCollisions(
  actions: ActionInfo[],
): SimileCollision[] {
  const collisions: SimileCollision[] = [];

  for (const a of actions) {
    if (!a.similes || a.similes.length === 0) continue;

    for (const simile of a.similes) {
      const normSimile = normalize(simile);

      for (const b of actions) {
        if (a.name === b.name) continue;
        const normName = normalize(b.name);

        if (normSimile === normName) {
          collisions.push({
            actionA: a.name,
            simileA: simile,
            actionB: b.name,
            nameOrSimileB: b.name,
            normSimileA: normSimile,
            normB: normName,
            kind: "exact",
            tier: 3,
          });
        } else if (
          normSimile.includes(normName) ||
          normName.includes(normSimile)
        ) {
          collisions.push({
            actionA: a.name,
            simileA: simile,
            actionB: b.name,
            nameOrSimileB: b.name,
            normSimileA: normSimile,
            normB: normName,
            kind: "substring",
            tier: 4,
          });
        }
      }
    }
  }

  // Sort: tier-3 (exact) first, then by shorter normalized string length
  collisions.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    const aLen = Math.min(a.normSimileA.length, a.normB.length);
    const bLen = Math.min(b.normSimileA.length, b.normB.length);
    return aLen - bLen;
  });

  return collisions;
}

function detectSimileToSimileCollisions(
  actions: ActionInfo[],
): SimileCollision[] {
  const collisions: SimileCollision[] = [];

  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (!a.similes || a.similes.length === 0) continue;

    for (let j = i + 1; j < actions.length; j++) {
      const b = actions[j];
      if (!b.similes || b.similes.length === 0) continue;

      for (const simA of a.similes) {
        const normSimA = normalize(simA);
        for (const simB of b.similes) {
          const normSimB = normalize(simB);

          if (normSimA === normSimB) {
            collisions.push({
              actionA: a.name,
              simileA: simA,
              actionB: b.name,
              nameOrSimileB: simB,
              normSimileA: normSimA,
              normB: normSimB,
              kind: "exact",
              tier: 4,
            });
          } else if (
            normSimA.includes(normSimB) ||
            normSimB.includes(normSimA)
          ) {
            collisions.push({
              actionA: a.name,
              simileA: simA,
              actionB: b.name,
              nameOrSimileB: simB,
              normSimileA: normSimA,
              normB: normSimB,
              kind: "substring",
              tier: 4,
            });
          }
        }
      }
    }
  }

  collisions.sort((a, b) => {
    const aLen = Math.min(a.normSimileA.length, a.normB.length);
    const bLen = Math.min(b.normSimileA.length, b.normB.length);
    return aLen - bLen;
  });

  return collisions;
}

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

function printNameCollisions(pairs: CollisionPair[]) {
  console.log("\n═══ TIER 2 RISK: Name Substring Collisions ═══\n");
  console.log(
    "These pairs could cause the wrong action to be selected when the LLM",
  );
  console.log("emits a partial or abbreviated action name.\n");

  if (pairs.length === 0) {
    console.log("  No name substring collisions detected.\n");
    return;
  }

  for (const p of pairs) {
    console.log(`  ${p.actionA} <-> ${p.actionB}`);

    if (p.direction === "both" && p.normA === p.normB) {
      console.log(`    "${p.normA}" === "${p.normB}"`);
      console.log(
        `    -> DANGEROUS: Identical after normalization, order-dependent match\n`,
      );
    } else if (p.direction === "A⊃B") {
      console.log(`    "${p.normA}".includes("${p.normB}") = true`);
      console.log(
        `    -> DANGEROUS: If LLM says "${p.actionB}", tier-2 may match either one\n`,
      );
    } else if (p.direction === "B⊃A") {
      console.log(`    "${p.normB}".includes("${p.normA}") = true`);
      console.log(
        `    -> DANGEROUS: If LLM says "${p.actionA}", tier-2 may match either one\n`,
      );
    } else {
      console.log(`    "${p.normA}".includes("${p.normB}") = true`);
      console.log(`    "${p.normB}".includes("${p.normA}") = true`);
      console.log(
        `    -> DANGEROUS: Mutual containment, both directions ambiguous\n`,
      );
    }
  }
}

function printSimileToNameCollisions(collisions: SimileCollision[]) {
  console.log("\n═══ TIER 3/4 RISK: Simile-to-Name Collisions ═══\n");
  console.log(
    "An action's alias (simile) matches or overlaps with another action's name.\n",
  );

  if (collisions.length === 0) {
    console.log("  No simile-to-name collisions detected.\n");
    return;
  }

  for (const c of collisions) {
    const tierLabel =
      c.kind === "exact" ? "TIER 3 (exact)" : "TIER 4 (substring)";
    console.log(
      `  [${tierLabel}] ${c.actionA} simile "${c.simileA}" <-> ${c.actionB} name "${c.nameOrSimileB}"`,
    );
    if (c.kind === "exact") {
      console.log(
        `    normalize("${c.simileA}") === normalize("${c.nameOrSimileB}") = "${c.normSimileA}"`,
      );
      console.log(
        `    -> DANGEROUS: Simile exactly matches another action's name\n`,
      );
    } else {
      console.log(
        `    normalize("${c.simileA}") = "${c.normSimileA}", normalize("${c.nameOrSimileB}") = "${c.normB}"`,
      );
      console.log(
        `    -> WARNING: Substring overlap between simile and name\n`,
      );
    }
  }
}

function printSimileToSimileCollisions(collisions: SimileCollision[]) {
  console.log("\n═══ TIER 4 RISK: Simile-to-Simile Collisions ═══\n");
  console.log(
    "Aliases from different actions overlap, causing ambiguity in tier-4 matching.\n",
  );

  if (collisions.length === 0) {
    console.log("  No simile-to-simile collisions detected.\n");
    return;
  }

  for (const c of collisions) {
    const kindLabel = c.kind === "exact" ? "EXACT" : "SUBSTR";
    console.log(
      `  [${kindLabel}] ${c.actionA} simile "${c.simileA}" <-> ${c.actionB} simile "${c.nameOrSimileB}"`,
    );
    if (c.kind === "exact") {
      console.log(
        `    normalize("${c.simileA}") === normalize("${c.nameOrSimileB}") = "${c.normSimileA}"`,
      );
      console.log(`    -> DANGEROUS: Identical similes on different actions\n`);
    } else {
      console.log(
        `    normalize("${c.simileA}") = "${c.normSimileA}", normalize("${c.nameOrSimileB}") = "${c.normB}"`,
      );
      console.log(`    -> WARNING: Substring overlap between similes\n`);
    }
  }
}

function printSummary(
  _actions: ActionInfo[],
  nameCollisions: CollisionPair[],
  simileNameCollisions: SimileCollision[],
  simileSimileCollisions: SimileCollision[],
) {
  const tier2Count = nameCollisions.length;
  const tier3Count = simileNameCollisions.filter(
    (c) => c.kind === "exact",
  ).length;
  const tier4NameCount = simileNameCollisions.filter(
    (c) => c.kind === "substring",
  ).length;
  const tier4SimCount = simileSimileCollisions.length;
  const total = tier2Count + tier3Count + tier4NameCount + tier4SimCount;

  console.log("\n═══ SUMMARY ═══\n");
  console.log(`  Tier 2 dangerous pairs (name-name):     ${tier2Count}`);
  console.log(`  Tier 3 dangerous pairs (simile=name):   ${tier3Count}`);
  console.log(`  Tier 4 risky pairs (simile~name):       ${tier4NameCount}`);
  console.log(`  Tier 4 risky pairs (simile~simile):     ${tier4SimCount}`);
  console.log(`  Total collision risks:                  ${total}`);

  if (total === 0) {
    console.log("\n  No collisions detected.\n");
    return;
  }

  // Count how many collisions each action is involved in
  const involvement: Record<string, number> = {};
  const bump = (name: string) => {
    involvement[name] = (involvement[name] || 0) + 1;
  };

  for (const p of nameCollisions) {
    bump(p.actionA);
    bump(p.actionB);
  }
  for (const c of simileNameCollisions) {
    bump(c.actionA);
    bump(c.actionB);
  }
  for (const c of simileSimileCollisions) {
    bump(c.actionA);
    bump(c.actionB);
  }

  const ranked = Object.entries(involvement)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);

  if (ranked.length > 0) {
    console.log("\n  Most collision-prone actions:");
    for (const [name, count] of ranked) {
      console.log(
        `    ${name.padEnd(40)} involved in ${count} collision${count > 1 ? "s" : ""}`,
      );
    }
  }
  console.log();
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log("╔═════════════════════════════════════════════╗");
  console.log("║    ACTION NAME COLLISION AUDIT              ║");
  console.log("╚═════════════════════════════════════════════╝\n");

  // Fetch action data from the debug endpoint
  let ctx: DebugContext;
  try {
    ctx = await fetchJson("/api/debug/context");
  } catch (err) {
    console.error(
      `Failed to fetch debug context from ${BASE}/api/debug/context`,
    );
    console.error(`Is the dev server running? Start with: bun run dev\n`);
    console.error(err);
    process.exit(1);
  }

  const actions = ctx.actions;
  if (!actions || actions.length === 0) {
    console.error("No actions found in debug context.");
    process.exit(1);
  }

  // Ensure every action has a similes array
  for (const action of actions) {
    if (!action.similes) {
      action.similes = [];
    }
  }

  const hasAnySimiles = actions.some((a) => a.similes.length > 0);

  console.log(
    `Analyzed ${actions.length} actions for routing collision risks.`,
  );
  if (!hasAnySimiles) {
    console.log(
      "Note: No similes data found on any action. Simile checks will be skipped.",
    );
  }

  // Detect collisions
  const nameCollisions = detectNameCollisions(actions);
  const simileNameCollisions = hasAnySimiles
    ? detectSimileToNameCollisions(actions)
    : [];
  const simileSimileCollisions = hasAnySimiles
    ? detectSimileToSimileCollisions(actions)
    : [];

  // Print results
  printNameCollisions(nameCollisions);
  printSimileToNameCollisions(simileNameCollisions);
  printSimileToSimileCollisions(simileSimileCollisions);
  printSummary(
    actions,
    nameCollisions,
    simileNameCollisions,
    simileSimileCollisions,
  );
}

main().catch(console.error);
