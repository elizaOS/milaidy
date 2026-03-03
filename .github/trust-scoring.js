/**
 * trust-scoring.js — Contributor Trust Scoring System for milady-ai/milady
 *
 * A robust, game-theory-resistant trust scoring algorithm for an agents-only
 * GitHub repository. Produces a score 0-100 and a tier label.
 *
 * Design principles:
 *   - Diminishing returns prevent grinding
 *   - Recency weighting keeps scores relevant
 *   - Complexity awareness rewards meaningful contributions
 *   - Velocity gates detect suspicious burst activity
 *   - Streak mechanics reward consistency, punish repeated failures
 *   - Time decay prevents stale trust from accumulating
 *   - Deterministic: same inputs always produce the same output
 *
 * Usage in GitHub Actions (actions/github-script):
 *   const { computeTrustScore, DEFAULT_CONFIG, getTier } = require('./.github/trust-scoring.js');
 *   const history = JSON.parse(contributorState); // from repo variable
 *   const result = computeTrustScore(history, DEFAULT_CONFIG);
 *   console.log(`Score: ${result.score}, Tier: ${result.tier}`);
 *
 * State is stored as JSON in a GitHub repo variable (<48KB limit).
 * Each contributor gets a compact event history array.
 */

// ============================================================================
// DEFAULT CONFIGURATION
// ============================================================================

const DEFAULT_CONFIG = {
  // --- Base point values ---
  // These are the RAW points before all modifiers. Actual impact varies.
  basePoints: {
    approve: 12, // PR approved and merged
    reject: -6, // PR rejected (REQUEST_CHANGES)
    close: -10, // PR closed without merge (wasted reviewer time)
    selfClose: -2, // Contributor closed their own PR (less punitive)
  },

  // --- Diminishing returns (logarithmic scaling) ---
  // Formula: points * (1 / (1 + diminishingRate * ln(1 + priorApprovals)))
  // At 0 prior approvals: 100% of points
  // At 5 prior approvals:  ~74% of points
  // At 20 prior approvals: ~62% of points
  // At 50 prior approvals: ~49% of points
  // NOTE: Rate lowered from 0.25 → 0.20 for high-velocity repos (10 PRs/week baseline)
  diminishingRate: 0.2,

  // --- Recency weighting (exponential decay) ---
  // Events lose relevance over time. Half-life in days.
  // After 1 half-life, event weight = 50%
  // After 2 half-lives, event weight = 25%
  recencyHalfLifeDays: 45,

  // --- PR complexity/size multipliers ---
  // Based on total lines changed (additions + deletions)
  // Multiplier is capped to prevent gaming via massive auto-generated diffs
  complexityBuckets: [
    { maxLines: 10, multiplier: 0.4, label: "trivial" }, // typo fixes
    { maxLines: 50, multiplier: 0.7, label: "small" }, // minor fixes
    { maxLines: 150, multiplier: 1.0, label: "medium" }, // standard PR
    { maxLines: 500, multiplier: 1.3, label: "large" }, // features
    { maxLines: 1500, multiplier: 1.5, label: "xlarge" }, // major features
    { maxLines: Infinity, multiplier: 1.2, label: "massive" }, // suspiciously large → capped lower
  ],

  // --- Category weighting (based on PR labels) ---
  // Multiple labels: highest multiplier wins (no stacking)
  categoryWeights: {
    security: 1.8, // security fixes are high-trust
    "critical-fix": 1.5, // critical bug fixes
    core: 1.3, // core system changes
    feature: 1.1, // new features
    bugfix: 1.0, // standard bugs (baseline)
    refactor: 0.9, // refactoring
    docs: 0.6, // documentation
    chore: 0.5, // dependency bumps, CI tweaks
    aesthetic: 0.4, // cosmetic/style changes
    test: 0.8, // test additions
  },
  defaultCategoryWeight: 0.8, // unlabeled PRs get a slight penalty

  // --- Streak mechanics ---
  // Consecutive approvals apply a bonus multiplier
  // Consecutive rejections apply a compounding penalty
  streaks: {
    approvalBonus: 0.08, // +8% per consecutive approval (additive)
    approvalMaxBonus: 0.5, // cap at +50% bonus (reached at ~6 streak)
    rejectionPenalty: 0.15, // +15% penalty per consecutive rejection (compounding)
    rejectionMaxPenalty: 2.5, // cap at 2.5x penalty multiplier
  },

  // --- Time decay (inactivity) ---
  // Trust decays toward a baseline when contributor is inactive
  // Applied AFTER all event scoring, as a final adjustment
  inactivityDecay: {
    gracePeriodDays: 10, // no decay for 10 days of inactivity (fast-moving repo)
    decayRatePerDay: 0.005, // 0.5% per day after grace period
    decayFloor: 30, // score never decays below 30 (keeps some history)
    decayTarget: 40, // decay trends toward this value, not zero
  },

  // --- Velocity gates ---
  // Too many PRs too fast is suspicious (bot spam, gaming)
  velocity: {
    windowDays: 7, // look-back window
    softCapPRs: 10, // PRs in window before penalty starts (10/week is baseline)
    hardCapPRs: 25, // PRs in window where points are zeroed
    penaltyPerExcess: 0.15, // 15% penalty per PR over soft cap
  },

  // --- Review severity ---
  // Rejection can carry different weights based on the nature of the issue
  // Set via a label or review comment tag: [severity:critical], [severity:minor]
  reviewSeverity: {
    critical: 1.8, // critical security/correctness issue
    major: 1.3, // significant design/logic problem
    normal: 1.0, // standard rejection
    minor: 0.5, // style/formatting nitpick
    trivial: 0.3, // very minor, almost a suggestion
  },
  defaultReviewSeverity: "normal",

  // --- Score boundaries ---
  minScore: 0,
  maxScore: 100,
  initialScore: 35, // new contributors start below midpoint — trust is earned

  // --- Daily point cap ---
  // Maximum raw points (positive) that can be earned in a single calendar day
  // Prevents single-day trust explosion
  dailyPointCap: 35,

  // --- Tier thresholds ---
  tiers: [
    {
      minScore: 90,
      label: "legendary",
      description: "Elite contributor, auto-merge eligible",
    },
    {
      minScore: 75,
      label: "trusted",
      description: "Highly trusted, expedited review",
    },
    { minScore: 60, label: "established", description: "Proven track record" },
    {
      minScore: 45,
      label: "contributing",
      description: "Active contributor, standard review",
    },
    {
      minScore: 30,
      label: "probationary",
      description: "Building trust, closer scrutiny",
    },
    {
      minScore: 15,
      label: "untested",
      description: "New or low-activity contributor",
    },
    {
      minScore: 0,
      label: "restricted",
      description: "Trust deficit, requires sponsor review",
    },
  ],
};

// ============================================================================
// CORE ALGORITHM
// ============================================================================

/**
 * Compute the trust score for a contributor based on their event history.
 *
 * @param {Object} history - Contributor's event history
 * @param {string} history.contributor - GitHub username
 * @param {number} history.createdAt - Unix timestamp (ms) when first seen
 * @param {Array} history.events - Array of event objects (see below)
 * @param {number} [history.manualAdjustment] - Manual score adjustment (-50 to +50)
 * @param {Object} config - Configuration object (use DEFAULT_CONFIG)
 * @param {number} now - Current timestamp in ms (for determinism, pass explicitly)
 * @returns {Object} { score, tier, tierInfo, breakdown, warnings }
 *
 * Event object shape:
 * {
 *   type: 'approve' | 'reject' | 'close' | 'selfClose',
 *   timestamp: number,          // Unix ms
 *   linesChanged: number,       // additions + deletions
 *   labels: string[],           // PR labels
 *   reviewSeverity?: string,    // for rejections: 'critical'|'major'|'normal'|'minor'|'trivial'
 *   prNumber: number,           // for deduplication
 *   filesChanged?: number,      // optional, for future use
 * }
 */
function computeTrustScore(history, config = DEFAULT_CONFIG, now = Date.now()) {
  const { events = [], manualAdjustment = 0 } = history;
  const warnings = [];
  const breakdown = {
    rawPoints: 0,
    diminishingFactor: 0,
    recencyWeightedPoints: 0,
    streakMultiplier: 1,
    velocityPenalty: 0,
    inactivityDecay: 0,
    manualAdjustment: 0,
    eventDetails: [],
  };

  if (events.length === 0) {
    const score = config.initialScore;
    return {
      score,
      tier: getTier(score, config).label,
      tierInfo: getTier(score, config),
      breakdown,
      warnings: ["No events recorded — using initial score"],
    };
  }

  // Sort events chronologically (oldest first)
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);

  // --- Phase 1: Compute per-event weighted points ---
  let approvalCount = 0;
  const currentStreak = { type: null, length: 0 };
  const dailyPoints = {}; // dateKey -> accumulated positive points
  let totalWeightedPoints = 0;

  for (const event of sorted) {
    const detail = { prNumber: event.prNumber, type: event.type };

    // 1a. Base points
    const basePoints = config.basePoints[event.type] || 0;
    detail.basePoints = basePoints;

    // 1b. Diminishing returns (only for positive events)
    let diminishingMultiplier = 1;
    if (basePoints > 0) {
      diminishingMultiplier =
        1 / (1 + config.diminishingRate * Math.log(1 + approvalCount));
      approvalCount++;
    }
    detail.diminishingMultiplier = round(diminishingMultiplier, 4);

    // 1c. Recency weighting
    const daysSinceEvent = (now - event.timestamp) / (1000 * 60 * 60 * 24);
    const recencyWeight = 0.5 ** (daysSinceEvent / config.recencyHalfLifeDays);
    detail.recencyWeight = round(recencyWeight, 4);
    detail.daysSinceEvent = round(daysSinceEvent, 1);

    // 1d. Complexity multiplier
    const complexityMultiplier = getComplexityMultiplier(
      event.linesChanged || 0,
      config,
    );
    detail.complexityMultiplier = complexityMultiplier;

    // 1e. Category multiplier
    const categoryMultiplier = getCategoryMultiplier(
      event.labels || [],
      config,
    );
    detail.categoryMultiplier = categoryMultiplier;

    // 1f. Streak multiplier
    const streakMult = updateStreak(currentStreak, event.type, config);
    detail.streakMultiplier = round(streakMult, 4);

    // 1g. Review severity (for rejections only)
    let severityMultiplier = 1;
    if (event.type === "reject" && event.reviewSeverity) {
      severityMultiplier =
        config.reviewSeverity[event.reviewSeverity] ||
        config.reviewSeverity[config.defaultReviewSeverity];
    }
    detail.severityMultiplier = severityMultiplier;

    // --- Combine all multipliers ---
    let eventPoints;
    if (basePoints >= 0) {
      // Positive events: all multipliers apply
      eventPoints =
        basePoints *
        diminishingMultiplier *
        recencyWeight *
        complexityMultiplier *
        categoryMultiplier *
        streakMult;
    } else {
      // Negative events: severity and streak compound the penalty
      // Recency still applies (old mistakes fade)
      // Complexity/category still matter (closing a security PR is worse)
      eventPoints =
        basePoints *
        recencyWeight *
        severityMultiplier *
        streakMult *
        Math.max(categoryMultiplier, 0.8); // floor category at 0.8 for penalties
    }

    detail.weightedPoints = round(eventPoints, 4);

    // 1h. Daily cap enforcement (positive points only)
    if (eventPoints > 0) {
      const dateKey = new Date(event.timestamp).toISOString().slice(0, 10);
      const currentDayTotal = dailyPoints[dateKey] || 0;
      const remaining = Math.max(0, config.dailyPointCap - currentDayTotal);
      const capped = Math.min(eventPoints, remaining);
      if (capped < eventPoints) {
        detail.cappedBy = round(eventPoints - capped, 4);
        warnings.push(
          `Daily cap hit on ${dateKey}: PR #${event.prNumber} capped from ${round(eventPoints, 2)} to ${round(capped, 2)}`,
        );
      }
      dailyPoints[dateKey] = currentDayTotal + capped;
      eventPoints = capped;
    }

    detail.finalPoints = round(eventPoints, 4);
    totalWeightedPoints += eventPoints;
    breakdown.eventDetails.push(detail);
  }

  breakdown.recencyWeightedPoints = round(totalWeightedPoints, 4);

  // --- Phase 2: Velocity gate ---
  const recentWindow = now - config.velocity.windowDays * 24 * 60 * 60 * 1000;
  const recentPRs = sorted.filter((e) => e.timestamp >= recentWindow).length;
  let velocityMultiplier = 1;

  if (recentPRs > config.velocity.hardCapPRs) {
    velocityMultiplier = 0; // zero out all gains
    warnings.push(
      `VELOCITY HARD CAP: ${recentPRs} PRs in ${config.velocity.windowDays} days (limit: ${config.velocity.hardCapPRs})`,
    );
  } else if (recentPRs > config.velocity.softCapPRs) {
    const excess = recentPRs - config.velocity.softCapPRs;
    velocityMultiplier = Math.max(
      0.1,
      1 - excess * config.velocity.penaltyPerExcess,
    );
    warnings.push(
      `Velocity warning: ${recentPRs} PRs in ${config.velocity.windowDays} days (soft cap: ${config.velocity.softCapPRs})`,
    );
  }

  breakdown.velocityPenalty = round(1 - velocityMultiplier, 4);

  // Only apply velocity penalty to positive portion of score
  let adjustedPoints;
  if (totalWeightedPoints > 0) {
    adjustedPoints = totalWeightedPoints * velocityMultiplier;
  } else {
    adjustedPoints = totalWeightedPoints; // don't reduce penalties
  }

  // --- Phase 3: Convert points to score ---
  // Score = initialScore + adjustedPoints, clamped to [0, 100]
  // The point scale is designed so that ~60 weighted points ≈ score of 95
  // This means a contributor needs sustained, quality contributions to reach top tier
  let score = config.initialScore + adjustedPoints;

  // --- Phase 4: Inactivity decay ---
  const lastEventTime = sorted[sorted.length - 1].timestamp;
  const daysSinceLastEvent = (now - lastEventTime) / (1000 * 60 * 60 * 24);

  if (daysSinceLastEvent > config.inactivityDecay.gracePeriodDays) {
    const decayDays =
      daysSinceLastEvent - config.inactivityDecay.gracePeriodDays;
    const decayAmount = decayDays * config.inactivityDecay.decayRatePerDay;
    // Decay pulls score toward decayTarget, not toward zero
    const target = config.inactivityDecay.decayTarget;
    if (score > target) {
      const maxDecay =
        score - Math.max(target, config.inactivityDecay.decayFloor);
      const actualDecay = Math.min(maxDecay, (score - target) * decayAmount);
      score -= actualDecay;
      breakdown.inactivityDecay = round(actualDecay, 4);
    }
  }

  // --- Phase 5: Manual adjustment ---
  if (manualAdjustment !== 0) {
    const clampedAdj = Math.max(-50, Math.min(50, manualAdjustment));
    score += clampedAdj;
    breakdown.manualAdjustment = clampedAdj;
  }

  // --- Phase 6: Final clamp ---
  score = Math.max(config.minScore, Math.min(config.maxScore, score));
  score = round(score, 2);

  const tierInfo = getTier(score, config);

  return {
    score,
    tier: tierInfo.label,
    tierInfo,
    breakdown,
    warnings,
  };
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get complexity multiplier based on lines changed.
 */
function getComplexityMultiplier(linesChanged, config) {
  for (const bucket of config.complexityBuckets) {
    if (linesChanged <= bucket.maxLines) {
      return bucket.multiplier;
    }
  }
  return 1.0; // fallback
}

/**
 * Get category multiplier from PR labels. Highest multiplier wins.
 */
function getCategoryMultiplier(labels, config) {
  if (!labels || labels.length === 0) return config.defaultCategoryWeight;

  let maxWeight = 0;
  let found = false;
  for (const label of labels) {
    const normalizedLabel = label.toLowerCase().replace(/\s+/g, "-");
    if (config.categoryWeights[normalizedLabel] !== undefined) {
      maxWeight = Math.max(maxWeight, config.categoryWeights[normalizedLabel]);
      found = true;
    }
  }
  return found ? maxWeight : config.defaultCategoryWeight;
}

/**
 * Update streak state and return the streak multiplier for this event.
 * Mutates currentStreak in place.
 *
 * Approvals: additive bonus up to cap
 * Rejections/closes: compounding penalty up to cap
 */
function updateStreak(currentStreak, eventType, config) {
  const isPositive = eventType === "approve";
  const isNegative = eventType === "reject" || eventType === "close";

  if (isPositive) {
    if (currentStreak.type === "approve") {
      currentStreak.length++;
    } else {
      currentStreak.type = "approve";
      currentStreak.length = 1;
    }
    // Additive bonus: 1 + min(length * bonus, maxBonus)
    const bonus = Math.min(
      (currentStreak.length - 1) * config.streaks.approvalBonus,
      config.streaks.approvalMaxBonus,
    );
    return 1 + bonus;
  }

  if (isNegative) {
    if (currentStreak.type === "negative") {
      currentStreak.length++;
    } else {
      currentStreak.type = "negative";
      currentStreak.length = 1;
    }
    // Compounding penalty: min(1 + length * penalty, maxPenalty)
    const penalty = Math.min(
      1 + (currentStreak.length - 1) * config.streaks.rejectionPenalty,
      config.streaks.rejectionMaxPenalty,
    );
    return penalty; // applied to negative base points, making them more negative
  }

  // selfClose doesn't affect streaks
  return 1;
}

/**
 * Get the tier for a given score.
 */
function getTier(score, config = DEFAULT_CONFIG) {
  for (const tier of config.tiers) {
    if (score >= tier.minScore) {
      return tier;
    }
  }
  return config.tiers[config.tiers.length - 1];
}

/**
 * Round to N decimal places.
 */
function round(n, decimals) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}

// ============================================================================
// STATE MANAGEMENT HELPERS
// ============================================================================

/**
 * Create a fresh contributor state object.
 */
function createContributorState(contributor) {
  return {
    contributor,
    createdAt: Date.now(),
    events: [],
    manualAdjustment: 0,
  };
}

/**
 * Add an event to a contributor's history.
 * Keeps only the most recent N events to stay under the 48KB repo variable limit.
 * With ~200 bytes per event, 200 events per contributor ≈ 40KB for ~1 contributor.
 * For multi-contributor storage, reduce maxEvents.
 */
function addEvent(state, event, maxEvents = 150) {
  state.events.push({
    type: event.type,
    timestamp: event.timestamp || Date.now(),
    linesChanged: event.linesChanged || 0,
    labels: event.labels || [],
    reviewSeverity: event.reviewSeverity || undefined,
    prNumber: event.prNumber,
  });

  // Prune oldest events if over limit
  if (state.events.length > maxEvents) {
    state.events = state.events.slice(state.events.length - maxEvents);
  }

  return state;
}

/**
 * Compact state for storage. Strips undefined fields, shortens keys.
 * Use when approaching the 48KB limit.
 */
function compactState(state) {
  return {
    c: state.contributor,
    t: state.createdAt,
    m: state.manualAdjustment || 0,
    e: state.events.map((e) => ({
      y: e.type[0], // a=approve, r=reject, c=close, s=selfClose
      ts: e.timestamp,
      l: e.linesChanged,
      lb: e.labels,
      ...(e.reviewSeverity ? { rs: e.reviewSeverity[0] } : {}),
      p: e.prNumber,
    })),
  };
}

/**
 * Expand compacted state back to full form.
 */
function expandState(compact) {
  const typeMap = { a: "approve", r: "reject", c: "close", s: "selfClose" };
  const severityMap = {
    c: "critical",
    m: "major",
    n: "normal",
    i: "minor",
    t: "trivial",
  };

  return {
    contributor: compact.c,
    createdAt: compact.t,
    manualAdjustment: compact.m || 0,
    events: compact.e.map((e) => ({
      type: typeMap[e.y] || e.y,
      timestamp: e.ts,
      linesChanged: e.l,
      labels: e.lb || [],
      reviewSeverity: e.rs ? severityMap[e.rs] || e.rs : undefined,
      prNumber: e.p,
    })),
  };
}

// ============================================================================
// EXAMPLE SCENARIOS
// ============================================================================

/**
 * Run example scenarios to demonstrate scoring behavior.
 * Call with: node trust-scoring.js --examples
 */
function runExamples() {
  const NOW = new Date("2026-02-14T18:00:00Z").getTime();
  const DAY = 24 * 60 * 60 * 1000;

  console.log("=".repeat(70));
  console.log("TRUST SCORING SYSTEM — EXAMPLE SCENARIOS");
  console.log("=".repeat(70));

  // --- Scenario 1: Steady Eddie ---
  // 10 approvals over 3 months, mixed sizes, all clean
  const steadyEddie = {
    contributor: "steady-eddie",
    createdAt: NOW - 90 * DAY,
    events: Array.from({ length: 10 }, (_, i) => ({
      type: "approve",
      timestamp: NOW - (90 - i * 9) * DAY,
      linesChanged: 50 + i * 30,
      labels: ["bugfix"],
      prNumber: 100 + i,
    })),
  };
  printScenario(
    "Scenario 1: Steady Eddie",
    "10 approvals over 90 days, growing complexity",
    steadyEddie,
    NOW,
  );

  // --- Scenario 2: Speed Demon ---
  // 8 PRs in 3 days, all approved (gaming attempt)
  const speedDemon = {
    contributor: "speed-demon",
    createdAt: NOW - 3 * DAY,
    events: Array.from({ length: 8 }, (_, i) => ({
      type: "approve",
      timestamp: NOW - 3 * DAY + i * (8 * 60 * 60 * 1000), // every 8 hours
      linesChanged: 15,
      labels: ["chore"],
      prNumber: 200 + i,
    })),
  };
  printScenario(
    "Scenario 2: Speed Demon",
    "8 trivial chore PRs in 3 days (gaming)",
    speedDemon,
    NOW,
  );

  // --- Scenario 3: Security Hero ---
  // 3 security fixes, all approved, moderate pace
  const securityHero = {
    contributor: "security-hero",
    createdAt: NOW - 60 * DAY,
    events: [
      {
        type: "approve",
        timestamp: NOW - 50 * DAY,
        linesChanged: 200,
        labels: ["security"],
        prNumber: 300,
      },
      {
        type: "approve",
        timestamp: NOW - 30 * DAY,
        linesChanged: 350,
        labels: ["security", "critical-fix"],
        prNumber: 301,
      },
      {
        type: "approve",
        timestamp: NOW - 10 * DAY,
        linesChanged: 150,
        labels: ["security"],
        prNumber: 302,
      },
    ],
  };
  printScenario(
    "Scenario 3: Security Hero",
    "3 security fixes over 2 months",
    securityHero,
    NOW,
  );

  // --- Scenario 4: Rough Start ---
  // First 3 PRs rejected, then 5 approved
  const roughStart = {
    contributor: "rough-start",
    createdAt: NOW - 60 * DAY,
    events: [
      {
        type: "reject",
        timestamp: NOW - 55 * DAY,
        linesChanged: 100,
        labels: ["feature"],
        prNumber: 400,
        reviewSeverity: "major",
      },
      {
        type: "reject",
        timestamp: NOW - 50 * DAY,
        linesChanged: 80,
        labels: ["feature"],
        prNumber: 401,
        reviewSeverity: "normal",
      },
      {
        type: "close",
        timestamp: NOW - 48 * DAY,
        linesChanged: 200,
        labels: ["feature"],
        prNumber: 402,
      },
      {
        type: "approve",
        timestamp: NOW - 40 * DAY,
        linesChanged: 60,
        labels: ["bugfix"],
        prNumber: 403,
      },
      {
        type: "approve",
        timestamp: NOW - 30 * DAY,
        linesChanged: 120,
        labels: ["bugfix"],
        prNumber: 404,
      },
      {
        type: "approve",
        timestamp: NOW - 20 * DAY,
        linesChanged: 200,
        labels: ["feature"],
        prNumber: 405,
      },
      {
        type: "approve",
        timestamp: NOW - 10 * DAY,
        linesChanged: 180,
        labels: ["feature"],
        prNumber: 406,
      },
      {
        type: "approve",
        timestamp: NOW - 5 * DAY,
        linesChanged: 250,
        labels: ["core"],
        prNumber: 407,
      },
    ],
  };
  printScenario(
    "Scenario 4: Rough Start",
    "3 rejections then 5 approvals (redemption arc)",
    roughStart,
    NOW,
  );

  // --- Scenario 5: Gone Ghost ---
  // Good contributor who went inactive 120 days ago
  const goneGhost = {
    contributor: "gone-ghost",
    createdAt: NOW - 200 * DAY,
    events: Array.from({ length: 8 }, (_, i) => ({
      type: "approve",
      timestamp: NOW - (200 - i * 10) * DAY,
      linesChanged: 100 + i * 20,
      labels: ["feature"],
      prNumber: 500 + i,
    })),
  };
  printScenario(
    "Scenario 5: Gone Ghost",
    "8 approvals but last activity 120+ days ago",
    goneGhost,
    NOW,
  );

  // --- Scenario 6: Typo Farmer ---
  // Many tiny documentation PRs (trying to game via volume)
  const typoFarmer = {
    contributor: "typo-farmer",
    createdAt: NOW - 30 * DAY,
    events: Array.from({ length: 15 }, (_, i) => ({
      type: "approve",
      timestamp: NOW - (30 - i * 2) * DAY,
      linesChanged: 3 + Math.floor(Math.random() * 5),
      labels: ["docs"],
      prNumber: 600 + i,
    })),
  };
  printScenario(
    "Scenario 6: Typo Farmer",
    "15 tiny doc PRs over 30 days (gaming via volume)",
    typoFarmer,
    NOW,
  );

  // --- Scenario 7: Brand New ---
  // Just arrived, no PRs
  const brandNew = {
    contributor: "brand-new",
    createdAt: NOW,
    events: [],
  };
  printScenario("Scenario 7: Brand New", "No PRs yet", brandNew, NOW);
}

function printScenario(name, description, history, now) {
  console.log(`\n${"—".repeat(70)}`);
  console.log(`${name}`);
  console.log(`${description}`);
  console.log(`${"—".repeat(70)}`);

  const result = computeTrustScore(history, DEFAULT_CONFIG, now);
  console.log(`Score: ${result.score} / 100`);
  console.log(`Tier:  ${result.tier} — ${result.tierInfo.description}`);

  if (result.warnings.length > 0) {
    console.log(`Warnings:`);
    result.warnings.forEach((w) => {
      console.log(`  ⚠ ${w}`);
    });
  }

  console.log(`Breakdown:`);
  console.log(
    `  Weighted points sum: ${result.breakdown.recencyWeightedPoints}`,
  );
  console.log(
    `  Velocity penalty:    ${(result.breakdown.velocityPenalty * 100).toFixed(1)}%`,
  );
  console.log(`  Inactivity decay:    ${result.breakdown.inactivityDecay}`);
  console.log(`  Manual adjustment:   ${result.breakdown.manualAdjustment}`);
}

// ============================================================================
// MODULE EXPORTS
// ============================================================================

module.exports = {
  computeTrustScore,
  DEFAULT_CONFIG,
  getTier,
  createContributorState,
  addEvent,
  compactState,
  expandState,
};

// Run examples if executed directly
if (require.main === module) {
  if (process.argv.includes("--examples")) {
    runExamples();
  } else {
    console.log("Usage: node trust-scoring.js --examples");
    console.log("Or require() as a module in GitHub Actions.");
  }
}
