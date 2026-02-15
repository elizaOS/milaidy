/**
 * trust-scoring.cjs — Contributor Trust Scoring v3
 * Synced with trust-dashboard scoring-engine.ts via esbuild
 * Source of truth: milady-ai/trust-dashboard/src/lib/scoring-engine.ts
 */

"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);
var scoring_engine_exports = {};
__export(scoring_engine_exports, {
  DEFAULT_CONFIG: () => DEFAULT_CONFIG,
  addEvent: () => addEvent,
  compactState: () => compactState,
  computeScoreHistory: () => computeScoreHistory,
  computeTrustScore: () => computeTrustScore,
  createContributorState: () => createContributorState,
  expandState: () => expandState,
  getCategoryMultiplier: () => getCategoryMultiplier,
  getComplexityMultiplier: () => getComplexityMultiplier,
  getTier: () => getTier,
  round: () => round,
  updateStreak: () => updateStreak
});
module.exports = __toCommonJS(scoring_engine_exports);
const DEFAULT_CONFIG = {
  basePoints: {
    approve: 12,
    reject: -6,
    close: -5,
    selfClose: -2
  },
  diminishingRate: 0.08,
  recencyHalfLifeDays: 60,
  complexityBuckets: [
    { maxLines: 10, multiplier: 0.4, label: "trivial" },
    { maxLines: 50, multiplier: 0.7, label: "small" },
    { maxLines: 150, multiplier: 1, label: "medium" },
    { maxLines: 500, multiplier: 1.3, label: "large" },
    { maxLines: 1500, multiplier: 1.5, label: "xlarge" },
    { maxLines: Number.POSITIVE_INFINITY, multiplier: 1.2, label: "massive" }
  ],
  categoryWeights: {
    security: 1.8,
    "critical-fix": 1.5,
    core: 1.3,
    feature: 1.1,
    bugfix: 1,
    refactor: 0.9,
    docs: 0.6,
    chore: 0.5,
    aesthetic: 0.4,
    test: 0.8
  },
  defaultCategoryWeight: 0.8,
  streaks: {
    approvalBonus: 0.08,
    approvalMaxBonus: 0.5,
    rejectionPenalty: 0.15,
    rejectionMaxPenalty: 2.5
  },
  inactivityDecay: {
    gracePeriodDays: 10,
    decayRatePerDay: 5e-3,
    decayFloor: 30,
    decayTarget: 40
  },
  velocity: {
    windowDays: 7,
    softCapPRs: 80,
    hardCapPRs: 200,
    penaltyPerExcess: 0.03
  },
  reviewSeverity: {
    critical: 1.8,
    major: 1.3,
    normal: 1,
    minor: 0.5,
    trivial: 0.3
  },
  defaultReviewSeverity: "normal",
  minScore: 0,
  maxScore: 100,
  initialScore: 40,
  dailyPointCap: 80,
  tiers: [
    { minScore: 90, label: "legendary", description: "Elite contributor, auto-merge eligible" },
    { minScore: 75, label: "trusted", description: "Highly trusted, expedited review" },
    { minScore: 60, label: "established", description: "Proven track record" },
    { minScore: 45, label: "contributing", description: "Active contributor, standard review" },
    { minScore: 30, label: "probationary", description: "Building trust, closer scrutiny" },
    { minScore: 15, label: "untested", description: "New or low-activity contributor" },
    { minScore: 0, label: "restricted", description: "Trust deficit, requires sponsor review" }
  ]
};
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
    approveRateBonus: 0,
    volumeBonus: 0,
    eventDetails: []
  };
  if (events.length === 0) {
    const score2 = config.initialScore;
    return {
      score: score2,
      tier: getTier(score2, config).label,
      tierInfo: getTier(score2, config),
      breakdown,
      warnings: ["No events recorded \u2014 using initial score"]
    };
  }
  const sorted = [...events].sort((a, b) => a.timestamp - b.timestamp);
  const SUPERSEDE_WINDOW_MS = 24 * 60 * 60 * 1e3;
  const supersededPRs = /* @__PURE__ */ new Set();
  for (let i = 0; i < sorted.length; i++) {
    const ev = sorted[i];
    if (ev.type !== "close" && ev.type !== "selfClose") continue;
    for (let j = i + 1; j < sorted.length; j++) {
      const next = sorted[j];
      if (next.timestamp - ev.timestamp > SUPERSEDE_WINDOW_MS) break;
      if (next.type === "approve") {
        supersededPRs.add(ev.prNumber);
        break;
      }
    }
  }
  let approvalCount = 0;
  let closeCount = 0;
  const currentStreak = {
    type: null,
    length: 0
  };
  const dailyPoints = {};
  let totalWeightedPoints = 0;
  for (const event of sorted) {
    const detail = {
      prNumber: event.prNumber,
      type: event.type,
      basePoints: 0,
      diminishingMultiplier: 1,
      recencyWeight: 1,
      daysSinceEvent: 0,
      complexityMultiplier: 1,
      categoryMultiplier: 1,
      streakMultiplier: 1,
      severityMultiplier: 1,
      weightedPoints: 0,
      finalPoints: 0
    };
    const isSuperseded = (event.type === "close" || event.type === "selfClose") && supersededPRs.has(event.prNumber);
    const basePoints = isSuperseded ? -2 : config.basePoints[event.type] ?? 0;
    detail.basePoints = basePoints;
    let diminishingMultiplier = 1;
    if (basePoints > 0) {
      diminishingMultiplier = 1 / (1 + config.diminishingRate * Math.log(1 + approvalCount));
      approvalCount++;
    } else if (basePoints < 0 && (event.type === "close" || event.type === "selfClose" || event.type === "reject")) {
      diminishingMultiplier = 1 / (1 + config.diminishingRate * Math.log(1 + closeCount));
      closeCount++;
    }
    detail.diminishingMultiplier = round(diminishingMultiplier, 4);
    const daysSinceEvent = (now - event.timestamp) / (1e3 * 60 * 60 * 24);
    const recencyWeight = 0.5 ** (daysSinceEvent / config.recencyHalfLifeDays);
    detail.recencyWeight = round(recencyWeight, 4);
    detail.daysSinceEvent = round(daysSinceEvent, 1);
    const complexityMultiplier = getComplexityMultiplier(event.linesChanged || 0, config);
    detail.complexityMultiplier = complexityMultiplier;
    const categoryMultiplier = getCategoryMultiplier(event.labels || [], config);
    detail.categoryMultiplier = categoryMultiplier;
    const streakMult = updateStreak(currentStreak, event.type, config);
    detail.streakMultiplier = round(streakMult, 4);
    let severityMultiplier = 1;
    if (event.type === "reject" && event.reviewSeverity) {
      severityMultiplier = config.reviewSeverity[event.reviewSeverity] ?? config.reviewSeverity[config.defaultReviewSeverity];
    }
    detail.severityMultiplier = severityMultiplier;
    let eventPoints;
    if (basePoints >= 0) {
      eventPoints = basePoints * diminishingMultiplier * recencyWeight * complexityMultiplier * categoryMultiplier * streakMult;
    } else {
      eventPoints = basePoints * diminishingMultiplier * recencyWeight * severityMultiplier * streakMult * Math.max(categoryMultiplier, 0.8);
    }
    detail.weightedPoints = round(eventPoints, 4);
    if (eventPoints > 0) {
      const dateKey = new Date(event.timestamp).toISOString().slice(0, 10);
      const currentDayTotal = dailyPoints[dateKey] || 0;
      const remaining = Math.max(0, config.dailyPointCap - currentDayTotal);
      const capped = Math.min(eventPoints, remaining);
      if (capped < eventPoints) {
        detail.cappedBy = round(eventPoints - capped, 4);
        warnings.push(
          `Daily cap hit on ${dateKey}: PR #${event.prNumber} capped from ${round(eventPoints, 2)} to ${round(capped, 2)}`
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
  const recentWindow = now - config.velocity.windowDays * 24 * 60 * 60 * 1e3;
  const recentPRs = sorted.filter((e) => e.timestamp >= recentWindow).length;
  let velocityMultiplier = 1;
  if (recentPRs > config.velocity.hardCapPRs) {
    velocityMultiplier = 0;
    warnings.push(
      `VELOCITY HARD CAP: ${recentPRs} PRs in ${config.velocity.windowDays} days (limit: ${config.velocity.hardCapPRs})`
    );
  } else if (recentPRs > config.velocity.softCapPRs) {
    const excess = recentPRs - config.velocity.softCapPRs;
    velocityMultiplier = Math.max(0.1, 1 - excess * config.velocity.penaltyPerExcess);
    warnings.push(
      `Velocity warning: ${recentPRs} PRs in ${config.velocity.windowDays} days (soft cap: ${config.velocity.softCapPRs})`
    );
  }
  breakdown.velocityPenalty = round(1 - velocityMultiplier, 4);
  const adjustedPoints = totalWeightedPoints > 0 ? totalWeightedPoints * velocityMultiplier : totalWeightedPoints;
  let approveRateBonus = 0;
  const totalEvents = approvalCount + closeCount;
  if (totalEvents > 0 && approvalCount > 0) {
    const approveRate = approvalCount / totalEvents;
    let rateMultiplier = 1;
    if (approveRate >= 0.9) rateMultiplier = 1.5;
    else if (approveRate >= 0.8) rateMultiplier = 1.3;
    else if (approveRate >= 0.7) rateMultiplier = 1.2;
    else if (approveRate >= 0.6) rateMultiplier = 1.1;
    if (rateMultiplier > 1) {
      const positivePoints = breakdown.eventDetails.filter((d) => d.finalPoints > 0).reduce((sum, d) => sum + d.finalPoints, 0);
      const boostedPositive = positivePoints * velocityMultiplier * rateMultiplier;
      const originalPositive = positivePoints * velocityMultiplier;
      approveRateBonus = round(boostedPositive - originalPositive, 4);
    }
  }
  breakdown.approveRateBonus = approveRateBonus;
  const volumeBonus = round(Math.min(10, Math.sqrt(approvalCount) * 1.5), 4);
  breakdown.volumeBonus = volumeBonus;
  let score = config.initialScore + adjustedPoints + approveRateBonus + volumeBonus;
  const lastEventTime = sorted[sorted.length - 1].timestamp;
  const daysSinceLastEvent = (now - lastEventTime) / (1e3 * 60 * 60 * 24);
  if (daysSinceLastEvent > config.inactivityDecay.gracePeriodDays) {
    const decayDays = daysSinceLastEvent - config.inactivityDecay.gracePeriodDays;
    const decayAmount = decayDays * config.inactivityDecay.decayRatePerDay;
    const target = config.inactivityDecay.decayTarget;
    if (score > target) {
      const maxDecay = score - Math.max(target, config.inactivityDecay.decayFloor);
      const actualDecay = Math.min(maxDecay, (score - target) * decayAmount);
      score -= actualDecay;
      breakdown.inactivityDecay = round(actualDecay, 4);
    }
  }
  if (manualAdjustment !== 0) {
    const clampedAdj = Math.max(-50, Math.min(50, manualAdjustment));
    score += clampedAdj;
    breakdown.manualAdjustment = clampedAdj;
  }
  score = Math.max(config.minScore, Math.min(config.maxScore, score));
  score = round(score, 2);
  const tierInfo = getTier(score, config);
  return {
    score,
    tier: tierInfo.label,
    tierInfo,
    breakdown,
    warnings
  };
}
function computeScoreHistory(history, config = DEFAULT_CONFIG, now = Date.now()) {
  const sorted = [...history.events ?? []].sort((a, b) => a.timestamp - b.timestamp);
  if (sorted.length === 0) {
    return [{ timestamp: now, score: config.initialScore }];
  }
  const points = [];
  for (let i = 0; i < sorted.length; i++) {
    const sliceHistory = {
      ...history,
      events: sorted.slice(0, i + 1)
    };
    const eventTimestamp = sorted[i].timestamp;
    const result = computeTrustScore(sliceHistory, config, eventTimestamp);
    points.push({ timestamp: eventTimestamp, score: result.score });
  }
  return points;
}
function getComplexityMultiplier(linesChanged, config) {
  for (const bucket of config.complexityBuckets) {
    if (linesChanged <= bucket.maxLines) {
      return bucket.multiplier;
    }
  }
  return 1;
}
function getCategoryMultiplier(labels, config) {
  if (!labels || labels.length === 0) return config.defaultCategoryWeight;
  let maxWeight = 0;
  let found = false;
  for (const label of labels) {
    const normalizedLabel = label.toLowerCase().replace(/\s+/g, "-");
    if (config.categoryWeights[normalizedLabel] !== void 0) {
      maxWeight = Math.max(maxWeight, config.categoryWeights[normalizedLabel]);
      found = true;
    }
  }
  return found ? maxWeight : config.defaultCategoryWeight;
}
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
    const bonus = Math.min(
      (currentStreak.length - 1) * config.streaks.approvalBonus,
      config.streaks.approvalMaxBonus
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
    const penalty = Math.min(
      1 + (currentStreak.length - 1) * config.streaks.rejectionPenalty,
      config.streaks.rejectionMaxPenalty
    );
    return penalty;
  }
  return 1;
}
function getTier(score, config = DEFAULT_CONFIG) {
  for (const tier of config.tiers) {
    if (score >= tier.minScore) {
      return tier;
    }
  }
  return config.tiers[config.tiers.length - 1];
}
function round(n, decimals) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
function createContributorState(contributor) {
  return {
    contributor,
    createdAt: Date.now(),
    events: [],
    manualAdjustment: 0
  };
}
function addEvent(state, event, maxEvents = 150) {
  state.events.push({
    type: event.type,
    timestamp: event.timestamp ?? Date.now(),
    linesChanged: event.linesChanged ?? 0,
    labels: event.labels ?? [],
    reviewSeverity: event.reviewSeverity,
    prNumber: event.prNumber,
    filesChanged: event.filesChanged
  });
  if (state.events.length > maxEvents) {
    state.events = state.events.slice(state.events.length - maxEvents);
  }
  return state;
}
function compactState(state) {
  return {
    c: state.contributor,
    t: state.createdAt,
    m: state.manualAdjustment || 0,
    e: state.events.map((e) => ({
      y: e.type[0],
      ts: e.timestamp,
      l: e.linesChanged,
      lb: e.labels,
      ...e.reviewSeverity ? { rs: e.reviewSeverity[0] } : {},
      p: e.prNumber
    }))
  };
}
function expandState(compact) {
  const typeMap = {
    a: "approve",
    r: "reject",
    c: "close",
    s: "selfClose"
  };
  const severityMap = {
    c: "critical",
    m: "major",
    n: "normal",
    i: "minor",
    t: "trivial"
  };
  return {
    contributor: compact.c,
    createdAt: compact.t,
    manualAdjustment: compact.m || 0,
    events: compact.e.map((e) => ({
      type: typeMap[e.y] ?? e.y,
      timestamp: e.ts,
      linesChanged: e.l,
      labels: e.lb || [],
      reviewSeverity: e.rs ? severityMap[e.rs] ?? e.rs : void 0,
      prNumber: e.p
    }))
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  DEFAULT_CONFIG,
  addEvent,
  compactState,
  computeScoreHistory,
  computeTrustScore,
  createContributorState,
  expandState,
  getCategoryMultiplier,
  getComplexityMultiplier,
  getTier,
  round,
  updateStreak
});
