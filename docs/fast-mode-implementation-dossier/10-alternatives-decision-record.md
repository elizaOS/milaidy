# Alternatives and Decision Record

## Decision Context

Need per-chat/per-message fast mode with:

- lower latency
- reduced provider/action/evaluator load
- model override capability
- minimal regressions to autonomous/default mode

The architecture spans Milady app + API + cloud bridge + Eliza core.

---

## Evaluation Criteria

1. **Latency ceiling**: How much real latency can this option remove?
2. **Correctness**: Does it preserve deterministic mode behavior under concurrency?
3. **Blast radius**: How invasive is the change footprint?
4. **Maintainability**: Ongoing upgrade/merge burden.
5. **Cloud parity**: Can local and cloud behavior stay consistent?
6. **Reversibility**: Ease of rollback.

---

## Option A: Milady-Only Fast Path (No Eliza core changes)

## Description

Implement fast behavior in Milady layer only by controlling request flow and maybe bypassing portions of Eliza runtime.

## Pros

- minimal upstream/core modifications
- quick initial implementation

## Cons

- limited control over core planner/model internals
- high risk of behavior divergence from standard Eliza pipeline
- hard to preserve feature parity and plugin expectations

## Assessment

- Latency ceiling: medium
- Correctness under concurrency: medium (depends on workaround choices)
- Maintainability: low (custom behavior drifts from core)

Verdict: acceptable only as temporary prototype.

---

## Option B: Message-Level Metadata + Existing `handleMessage` Options

## Description

Use existing options (`useMultiStep`, `shouldRespondModel`, retries) plus metadata-driven plugin logic.

## Pros

- small incremental change
- uses existing API contracts

## Cons

- does not fully control main generation model path
- no first-class provider/evaluator/action profile controls
- likely needs global runtime tricks for deeper model override (unsafe)

## Assessment

- Latency ceiling: medium-low
- Correctness: medium-low (incomplete control surface)
- Maintainability: medium

Verdict: insufficient as final architecture.

---

## Option C: Custom Milady MessageService Fork/Wrapper

## Description

Replace or wrap default MessageService in Milady, implementing fast-mode branches and custom policy logic.

## Pros

- high immediate control
- can ship without waiting for full upstream changes

## Cons

- high drift tax against evolving core message pipeline
- hard to maintain parity with upstream bug fixes
- greater regression risk over time

## Assessment

- Latency ceiling: high
- Correctness: medium-high if well built
- Maintainability: low long-term

Verdict: useful as short bridge only, not strategic end state.

---

## Option D: Eliza Core First-Class Processing Mode Framework

## Description

Add explicit message-scoped processing mode/profile in core:

- model routing
- provider/action/evaluator policies
- deterministic per-message behavior

## Pros

- strong correctness and consistency
- low drift and good long-term maintainability
- reusable for all Eliza-based clients beyond Milady

## Cons

- larger upfront core change set
- requires careful compatibility management

## Assessment

- Latency ceiling: high
- Correctness: high
- Maintainability: high

Verdict: best long-term architecture.

---

## Option E: Hybrid Staged Migration (Recommended)

## Description

Stage implementation:

1. contract plumbing through Milady + cloud
2. minimal core extensions for message-scoped mode/profile and model routing
3. deterministic capability profiles
4. observability + canary rollout

## Pros

- practical delivery speed
- avoids long-lived fork
- converges to robust core architecture

## Cons

- requires disciplined sequencing
- temporary mixed state during rollout

## Assessment

- Latency ceiling: high
- Correctness: high (if context-scoped model routing is done)
- Maintainability: high
- Reversibility: high with flags

Verdict: best balance of speed and long-term quality.

---

## Decision Matrix

| Option | Latency Potential | Concurrency Safety | Maint. Burden | Cloud Parity | Long-Term Fit |
| --- | --- | --- | --- | --- | --- |
| A Milady-only | Medium | Medium | High | Medium | Low |
| B Existing options only | Medium-Low | Medium-Low | Medium | Medium | Low |
| C Custom service fork | High | Medium-High | Very High | Medium | Medium-Low |
| D Core first-class | High | High | Medium | High | High |
| E Hybrid staged | High | High | Medium | High | High |

---

## Why Option E Over Option D-Only

Option D-only is architecturally clean but slower to de-risk in production.  
Option E keeps the same end state while allowing:

- early parity verification through contract plumbing
- incremental risk isolation
- faster user-visible progress

---

## Non-Recommended Paths and Failure Modes

## Runtime global mode mutation

Failure mode:

- cross-request contamination in concurrent traffic.

## Text-embedded mode flags

Failure mode:

- prompt pollution, non-deterministic parsing, security ambiguity.

## Unbounded dynamic filtering in fast mode

Failure mode:

- latency variance and hard-to-debug behavior drift.

---

## Final ADR Statement

Adopt **Option E (Hybrid Staged Migration)**:

1. quickly establish end-to-end mode intent transport
2. implement message-scoped core processing controls and model routing isolation
3. enforce deterministic fast profiles for providers/actions/evaluators
4. ship behind flags with strong observability and parity testing

This provides the strongest balance of low rollout risk and long-term architectural integrity.

