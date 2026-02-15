# Phase 7: Context Bridging Between Admin Chat and Autonomy

Goal: blend admin chat with autonomous operation in a controlled way that preserves relevance and avoids context overload.

## Problem

Desired behavior:

- while in admin chat, agent has autonomy awareness
- while autonomous, agent retains admin guidance continuity

Risk:

- naive "include all admin chat" approach blows context budget and degrades model quality.

## Bridging model

Use a two-layer bridge:

1. **Short-term memory layer**
   - latest high-priority admin directives (small window)
2. **Summarized continuity layer**
   - compact summary of older admin intent and commitments

## Canonical source selection

Need deterministic source ordering:

1. canonical admin room (if explicitly marked)
2. latest active admin conversation
3. fallback: most recent owner-authored DM messages

## Inclusion policy

Include only messages satisfying at least one:

- explicit directive intent
- identity assertion relevant to rolodex/trust
- unresolved operational objective

Exclude:

- greetings/chitchat
- redundant acknowledgements
- stale resolved instructions beyond retention horizon

## Token budget allocation example

Total bridge budget: 1200 chars

- 700 chars: unresolved directives
- 300 chars: identity/trust claims summary
- 200 chars: continuity metadata (timestamps, provenance labels)

## Conflict resolution rules

If admin directives conflict:

1. newest directive wins
2. previous directive retained as superseded note
3. mark conflict explicitly in provider output

## Freshness and expiry

Directive states:

1. active
2. superseded
3. expired
4. completed

Expiry default:

- active directives expire after configurable horizon unless refreshed

## Implementation options

## Option A: provider-only bridge (recommended first)

Bridge generated at inference-time in provider.

Pros:

- minimal storage model changes
- easy iteration

Cons:

- repeated summarization compute

## Option B: memory-backed bridge cache

Maintain derived bridge summary memories updated on message writes.

Pros:

- faster inference-time reads

Cons:

- cache invalidation complexity

## Option C: hybrid

Provider reads cached summary and refreshes selectively.

Pros:

- balanced cost/performance

Cons:

- highest complexity

Recommendation: Option A first, move to C if needed.

## Observability requirements

Need instrumentation to debug bridge quality:

- bridge summary length
- number of directives included/excluded
- truncation reason counters
- stale directive rate

## Failure modes

1. wrong canonical room selection
   - mitigation: explicit room metadata marker and deterministic fallback chain.
2. stale directives persist too long
   - mitigation: expiry + superseded rules.
3. bridge includes sensitive admin content
   - mitigation: redaction and claim-category allowlist.

## Testing

1. deterministic inclusion/exclusion tests
2. conflict resolution tests
3. truncation consistency tests
4. end-to-end autonomy behavior regression tests under bridged context

## Done criteria

1. Autonomous runs receive relevant admin guidance context.
2. Bridge remains bounded and deterministic.
3. No major context bloat or stale-directive regressions.

