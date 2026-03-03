# Trust Scoring System — Design Document

## Overview

A contributor trust scoring system for `milady-ai/milady`, an agents-only GitHub repository. Replaces the naive `+10 approve / -5 reject / -15 close` system with a multi-factor algorithm resistant to gaming.

**Score range:** 0–100  
**Initial score:** 35 (trust is earned, not given)  
**Storage:** GitHub repo variable, JSON, <48KB  

## Architecture

```
Event Stream → Per-Event Scoring → Velocity Gate → Inactivity Decay → Final Score → Tier
                     ↑
         ┌───────────┼───────────────┐
         │           │               │
   Diminishing   Recency        Complexity
    Returns      Weighting      + Category
         │           │          + Streak
         └───────────┴───────────────┘
```

## Scoring Components

### 1. Diminishing Returns

**Problem:** Under the naive system, 5 approvals maxed out score. Contributors had no reason to maintain quality after hitting 100.

**Solution:** Logarithmic diminishing returns. Each approval earns less than the previous one.

```
multiplier = 1 / (1 + 0.20 × ln(1 + priorApprovals))
```

| Prior Approvals | Multiplier | Effective Points (base 12) |
|-----------------|------------|---------------------------|
| 0               | 100%       | 12.0                      |
| 5               | 74%        | 8.8                       |
| 10              | 68%        | 8.1                       |
| 20              | 62%        | 7.4                       |
| 50              | 49%        | 5.9                       |

> **Note:** Rate set to 0.20 (lowered from 0.25) because this repo averages 10 PRs/week per contributor. Diminishing returns are gentler to avoid penalizing normal activity.

This means reaching high scores requires sustained, quality contributions — not a sprint.

### 2. Recency Weighting

**Problem:** A contributor's approval from 2 years ago shouldn't carry the same weight as one from last week.

**Solution:** Exponential decay with a 45-day half-life. Events lose half their weight every 45 days.

| Days Ago | Weight |
|----------|--------|
| 0        | 100%   |
| 15       | 79%    |
| 45       | 50%    |
| 90       | 25%    |
| 180      | 6%     |

This naturally keeps scores current without explicit pruning.

### 3. PR Complexity/Size

**Problem:** A 3-line typo fix shouldn't earn the same trust as a 500-line feature.

**Solution:** Size buckets with multipliers. Notably, "massive" PRs (>1500 lines) get a *lower* multiplier than "xlarge" — because suspiciously large diffs are often auto-generated or padding.

| Lines Changed | Multiplier | Label    |
|---------------|------------|----------|
| ≤10           | 0.4×       | trivial  |
| ≤50           | 0.7×       | small    |
| ≤150          | 1.0×       | medium   |
| ≤500          | 1.3×       | large    |
| ≤1500         | 1.5×       | xlarge   |
| >1500         | 1.2×       | massive  |

**Anti-gaming note:** The dropoff at >1500 lines prevents inflating scores by adding blank lines or auto-generated code.

### 4. Category Weighting

**Problem:** Fixing a security vulnerability demonstrates more competence and trustworthiness than updating a README.

**Solution:** PR labels map to trust multipliers. Highest label wins (no stacking to prevent label spam).

| Category     | Multiplier |
|-------------|------------|
| security    | 1.8×       |
| critical-fix| 1.5×       |
| core        | 1.3×       |
| feature     | 1.1×       |
| bugfix      | 1.0×       |
| refactor    | 0.9×       |
| test        | 0.8×       |
| docs        | 0.6×       |
| chore       | 0.5×       |
| aesthetic   | 0.4×       |

Unlabeled PRs default to 0.8× (slight penalty for not categorizing work).

### 5. Streak Mechanics

**Problem:** A contributor who delivers 6 clean PRs in a row is demonstrably more reliable than one who alternates pass/fail.

**Solution:** 
- **Approval streaks:** +8% bonus per consecutive approval, capping at +50% (streak of ~7)
- **Rejection streaks:** +15% compounding penalty per consecutive rejection, capping at 2.5×

Streaks reset when the pattern breaks. Self-closes don't affect streaks.

### 6. Time Decay (Inactivity)

**Problem:** A contributor who was trusted 6 months ago but hasn't been seen since shouldn't retain full trust. Skills rust, codebases change.

**Solution:** After 10 days of inactivity, score decays at 0.5% per day toward a target of 40. Score never decays below 30.

> **Note:** Grace period shortened from 14→10 days and decay rate increased from 0.3%→0.5% because this repo moves fast. If you're not contributing for 2+ weeks, trust should erode quickly.

| Days Inactive | Score Impact (from 80) |
|---------------|----------------------|
| 10            | 80.0 (grace period)  |
| 20            | ~78.0                |
| 40            | ~72.1                |
| 60            | ~64.7                |
| 90            | ~53.4                |

This ensures inactive contributors quickly lose privileges in a fast-moving repo.

### 7. Velocity Gates

**Problem:** An agent submitting 30 PRs in a week is likely spamming, not contributing. Volume ≠ value.

**Solution:** Rolling 7-day window with soft and hard caps, tuned for a high-velocity repo where 10 PRs/week is normal:
- **≤10 PRs/week:** Normal scoring (this is baseline activity)
- **11–25 PRs/week:** 15% penalty per PR over soft cap
- **>25 PRs/week:** All positive gains zeroed (hard block)

Penalties only affect positive points — you can still *lose* trust during a velocity violation.

> **Note:** Caps raised from 5/12 → 10/25 because this repo averages 10 PRs/week per active contributor. The old soft cap at 5 would penalize normal activity.

### 8. Review Severity

**Problem:** Getting rejected for a missing semicolon shouldn't carry the same weight as getting rejected for introducing a SQL injection.

**Solution:** Reviewers can tag rejection severity:

| Severity | Multiplier | Meaning |
|----------|------------|---------|
| critical | 1.8×       | Security/correctness hole |
| major    | 1.3×       | Significant design flaw |
| normal   | 1.0×       | Standard rejection |
| minor    | 0.5×       | Style/formatting |
| trivial  | 0.3×       | Suggestion-level |

### 9. Daily Point Cap

**Problem:** Even with velocity gates, a contributor could submit 5 high-value PRs in one day for a massive score boost.

**Solution:** Maximum of 35 positive points per calendar day, regardless of PR quality. Forces trust to build over time.

> **Note:** Raised from 20→35 to accommodate high-velocity repo. With 10 PRs/week, contributors may legitimately submit 2-3 quality PRs per day.

## Tier System

| Score  | Tier         | Meaning |
|--------|-------------|---------|
| 90–100 | legendary   | Auto-merge eligible |
| 75–89  | trusted     | Expedited review |
| 60–74  | established | Proven track record |
| 45–59  | contributing| Standard review |
| 30–44  | probationary| Closer scrutiny |
| 15–29  | untested    | New contributor |
| 0–14   | restricted  | Trust deficit, needs sponsor |

## Game Theory: Attack Vectors & Defenses

### Attack: Volume Grinding
*"Submit 50 trivial PRs to max out score."*  
**Defense:** Diminishing returns + complexity multiplier (trivial PRs earn 0.4× base) + velocity gates + daily cap. 50 trivial doc PRs would earn approximately: 12 × 0.4 × 0.6 × diminishing ≈ 2.88 points for the first one, decaying to <1 point each. With daily cap of 35 and velocity gates (hard cap at 25/week), this strategy yields a score around 50–55 over months — never reaching "trusted".

### Attack: Size Inflation
*"Add 2000 blank lines to every PR to hit the 'xlarge' multiplier."*  
**Defense:** The "massive" bucket (>1500 lines) has a *lower* multiplier than "xlarge". Reviewers would also reject padded PRs, triggering penalties.

### Attack: Label Manipulation
*"Label every PR as 'security' for the 1.8× multiplier."*  
**Defense:** Labels are set by reviewers/maintainers, not PR authors. If an agent labels its own PR, the review process catches this. Future enhancement: label validation rules.

### Attack: Burst Submission
*"Submit 30 PRs in rapid succession before the system catches up."*  
**Defense:** Velocity hard cap zeroes all positive gains for >25 PRs/week. Daily cap limits per-day gains to 35 points. Both are retroactively applied during score computation.

### Attack: Sockpuppeting
*"Create multiple identities to split negative history."*  
**Defense:** New accounts start at 35 (below midpoint), in "probationary" tier. It takes meaningful sustained contribution to reach useful trust levels. The cost of building a new identity from scratch is intentionally high.

### Attack: Stale Trust Exploitation  
*"Build trust, go dormant, return and exploit elevated privileges."*  
**Defense:** Inactivity decay pulls score toward 40 over time. A contributor who was "trusted" (75+) and goes silent for 120 days drops to ~61 ("established"), losing auto-merge privileges.

## Storage Format

State is stored per-contributor in a GitHub repo variable as JSON. For large numbers of contributors, compact encoding is available:

```json
{
  "contributors": {
    "agent-alice": {
      "c": "agent-alice",
      "t": 1707900000000,
      "m": 0,
      "e": [
        {"y":"a","ts":1707900000000,"l":120,"lb":["bugfix"],"p":42}
      ]
    }
  }
}
```

With compact encoding, each event is ~80 bytes. At 150 events per contributor, that's ~12KB per contributor, allowing ~3-4 contributors within the 48KB limit. For more contributors, reduce `maxEvents` or use multiple repo variables.

## Integration (GitHub Actions)

```javascript
// In actions/github-script (use .cjs extension since parent project is ESM)
const { computeTrustScore, DEFAULT_CONFIG, addEvent, createContributorState } = require('./.github/trust-scoring.cjs');

// Load state from repo variable
const stateJson = await github.rest.actions.getRepoVariable({
  owner: context.repo.owner,
  repo: context.repo.repo,
  name: 'CONTRIBUTOR_TRUST',
}).then(r => r.data.value).catch(() => '{}');

const allState = JSON.parse(stateJson);
const contributor = context.payload.pull_request.user.login;

// Get or create contributor state
let state = allState[contributor] || createContributorState(contributor);

// Add new event
state = addEvent(state, {
  type: 'approve', // or 'reject', 'close', 'selfClose'
  timestamp: Date.now(),
  linesChanged: context.payload.pull_request.additions + context.payload.pull_request.deletions,
  labels: context.payload.pull_request.labels.map(l => l.name),
  prNumber: context.payload.pull_request.number,
  reviewSeverity: 'normal', // extract from review if applicable
});

// Compute score
const result = computeTrustScore(state, DEFAULT_CONFIG);
console.log(`${contributor}: score=${result.score}, tier=${result.tier}`);

// Save state
allState[contributor] = state;
await github.rest.actions.updateRepoVariable({
  owner: context.repo.owner,
  repo: context.repo.repo,
  name: 'CONTRIBUTOR_TRUST',
  value: JSON.stringify(allState),
});
```

## Worked Scenarios (v2 — tuned for 10 PRs/week baseline)

### Scenario A: Steady Contributor — 10 quality PRs/week for 3 months

- **Profile:** 10 merged PRs/week, mixed bugfix/feature/core labels, 50–300 lines each
- **Duration:** ~13 weeks = ~130 PRs total
- **Velocity:** 10/week = exactly at soft cap, NO velocity penalty
- **Daily cap:** ~2 PRs/day, each earning 6–10 points after multipliers → rarely capped at 35/day
- **Diminishing returns (rate=0.20):** By PR #130, multiplier ≈ 39%, still earning ~4.7 pts/PR
- **Recency:** Older PRs fade (45-day half-life), but constant stream keeps weighted total high
- **Estimate:** Accumulates ~55–65 weighted points over 3 months
- **Final score:** 35 (initial) + ~60 = **~95 → legendary** ✅
- **Verdict:** A steady, quality contributor absolutely reaches legendary in ~3 months. This is the intended path.

### Scenario B: Speed Demon — 15 trivial chores in 3 days

- **Profile:** 15 PRs in 3 days, all `chore` label (0.5×), ~15 lines each (trivial, 0.4×)
- **Velocity:** 15 PRs in 7-day window → 5 over soft cap (10) → penalty = 1 - (5 × 0.15) = 0.25× multiplier
- **Daily cap:** 35/day, but each PR earns: 12 × 0.4 × 0.5 × diminishing × streak ≈ 1.5–2.4 pts → ~5 PRs/day × ~2 pts = ~10/day, under cap
- **Raw points before velocity:** ~30 points across 15 PRs
- **After velocity gate (0.25×):** ~7.5 points
- **Final score:** 35 + 7.5 = **~42.5 → probationary** ✅
- **Verdict:** Speed demon stays in probationary tier. The velocity gate + trivial complexity + chore category stack to prevent gaming.

### Scenario C: Mega-spammer — 25+ PRs/week

- **Profile:** 26 PRs in a 7-day window
- **Velocity:** Exceeds hard cap (25) → **all positive gains zeroed**
- **Final score:** 35 + 0 = **35 → probationary** (or lower if any rejections)
- **Verdict:** Hard cap completely blocks trust accumulation. Contributor must slow down to earn anything. ✅

### Scenario D: Stale Trust Exploitation (updated decay)

- **Profile:** Built up to score 80 ("trusted"), then goes inactive
- **Grace period:** 10 days (was 14)
- **Decay rate:** 0.5%/day toward target of 40 (was 0.3%)
- **After 30 days inactive:** 20 days of decay → score drops to ~72
- **After 60 days inactive:** 50 days of decay → score drops to ~58 ("contributing")
- **After 90 days inactive:** 80 days of decay → score drops to ~45 ("contributing")
- **Verdict:** Trust erodes significantly faster. A "trusted" contributor loses their tier in ~5 weeks of inactivity, not ~3 months. ✅

## Future Enhancements

1. **Cross-repo reputation:** Share trust scores across related repositories
2. **Peer review weighting:** Trust the reviews of high-trust contributors more
3. **Code quality metrics:** Integrate linter/test results as scoring signals
4. **Appeal mechanism:** Allow contributors to contest rejections
5. **Seasonal adjustment:** Account for holidays/expected downtime
6. **Collaborative scoring:** Multiple reviewers' assessments averaged
