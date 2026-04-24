# Macro Signals Implementation Plan

This document outlines the sequence of work required to migrate from the existing Oil Shock system to the Macro Signals multi-engine architecture described in `macro-signals-design.md`.  It is a living plan intended to guide implementation and to record decisions, risks and milestones.  Dates and durations are indicative; adjust them as engineering effort and priorities evolve.

## Stage 0 – Documentation groundwork (now)

* Add the target architecture (Macro Signals design) and this implementation plan to the repository, ensuring they are clearly distinguished from the current implementation.  Update `README.md`, `AGENTS.md`, `CLAUDE.md` and `docs/current-priorities.md` to reference these documents.
* Agree on terminology: use “engine”, “feed”, “rule” and “guardrail” consistently across docs and code.

## Stage 1 – Refactor current code for extensibility

* **Modularise collectors and scoring:** Extract data-collection and scoring logic from the monolithic worker into separate, easily replaceable modules.  Introduce interfaces for collectors, metrics and scorers so that new engines can be added without modifying core logic.
* **Configuration unification:** Replace hard-coded threshold values with a configuration loader that reads from a key–value table.  This prepares the ground for the rule engine.
* **Directory and namespacing cleanup:** Move engine-specific code into an `engines/oilshock` subfolder.  This will make it obvious where new engines should live.
* **Tests:** Write or update tests to ensure the refactor does not change current behaviour.  Add integration tests that exercise the external API through the worker.

### Required checklist mapped to Stage 1 deliverables (current code reality)

This is the required checklist mapped to the current repository implementation.

1) **Modularize collectors/scoring behind stable seams** *(Stage 1: Modularise collectors and scoring)*
   - **Status: complete**
   - Collectors are already isolated per source module and called from a thin collection job.
   - Runtime execution is namespaced through `worker/src/engines/oilshock/run-pipeline.ts`.
   - Scoring now runs through an engine-local seam (`worker/src/engines/oilshock/score.ts`) while preserving the existing `runScore` implementation and outputs.

2) **Unify configuration loading for scoring constants** *(Stage 1: Configuration unification + architecture constraints)*
   - **Status: complete**
   - Runtime thresholds are loaded from `config_thresholds` through `loadThresholds`.
   - Missing required keys fail clearly via `MISSING_THRESHOLD`.
   - Focused tests now cover both missing required rows and invalid threshold values.

3) **Introduce engine-oriented namespacing for Oil Shock code** *(Stage 1: Directory and namespacing cleanup)*
   - **Status: complete for the current minimum seam**
   - The pipeline entrypoint delegates into `worker/src/engines/oilshock/` while preserving existing API contracts and route shapes.

4) **Behavior-preserving test updates** *(Stage 1 tests + repo validation expectations)*
   - **Status: complete**
   - Integration coverage exists for collect → score → snapshot flow.
   - API contract tests exist for state/evidence/coverage/ledger behavior.
   - Targeted worker tests and replay validation pass after the Stage 1 seam/config test updates.

### Stage 1 completion note

The previously identified final Stage 1 slice is now completed:

1. Added an explicit engine-local scorer seam under `worker/src/engines/oilshock/`.
2. Kept scoring outputs and API contracts unchanged.
3. Added focused threshold-loading tests for missing and invalid runtime config values.

### Validation checklist (targeted)

Run only checks relevant to this Stage 1 slice:

- `corepack pnpm -C worker test`
- `corepack pnpm replay:validate` *(only if scoring behavior path changes)*
- `corepack pnpm docs:check` *(if docs/contracts change)*

### Done when / stop rule

- Oil Shock collection → scoring → snapshot serving works unchanged.
- Stage 1 seams exist (module boundaries + namespacing + config loading).
- Relevant checks pass.
- No Stage 2 schema tables/work are introduced in this increment.

## Stage 2 – Data schema migration

* **Create new tables:** Add `engines`, `feeds`, `metrics`, `rules` and `scores` tables as described in the design.  Each table is additive: they can be present without affecting the current code.
  * **Status: complete** via migration `db/migrations/0010_macro_signals_stage2.sql`.
* **Seed minimal metadata:** Populate the `engines` table with an entry for Oil Shock.  Populate the `feeds` table with existing feed keys and freshness thresholds.  Defer populating `rules` until the rule engine is in place.
  * **Status: complete** for `engines` and `feeds`; `rules` remains intentionally unseeded.
* **Dual writes (optional):** Consider writing Oil Shock scores into the new `scores` table in parallel to the existing tables.  This will surface schema issues early.
  * **Status: complete (flagged)**. Snapshot writes now optionally dual-write to `scores` when `ENABLE_SCORE_DUAL_WRITE` is enabled.
* **Migration scripts:** Add migration code to create the new tables and to backfill historical data if dual writes are enabled.  Document how to roll back.
  * **Status: complete**. Migration includes additive schema creation, metadata seeds, historical backfill into `scores`, and rollback instructions.

## Stage 3 – Rule engine and guardrails

* **Implement rule evaluation:** Build a rule engine that loads rules from the database, evaluates predicates against current metrics and produces score adjustments.  Start with simple threshold rules and expand to cross-feed conditions.
  * **Status: complete** with threshold and cross-feed (`all`) predicate support, D1-backed active rule loading, and mismatch score adjustments during scoring.
* **Implement guardrails:** Add a guardrail subsystem that checks feed freshness and completeness before scoring.  Integrate guardrail flags into the score output.
  * **Status: complete** with guardrail flags for stale/missing dimensions and missing feeds, persisted into snapshots and score dual-write payload flags.
* **Define initial rules:** For Oil Shock, translate existing hard-coded thresholds into rule definitions.  Validate that the rule engine reproduces the current scoring behaviour.
  * **Status: complete** via additive migration `db/migrations/0011_stage3_rules_guardrails.sql` seeding initial Oil Shock confirmation rules from existing threshold semantics.
* **Operator tooling:** Provide a basic UI or CLI to list rules, modify them and review guardrail failures.  Include a dry-run mode for testing rule changes.
  * **Status: complete** via admin endpoints for listing rules, updating rules, reviewing latest guardrail failures, and dry-run evaluation against ad-hoc metrics.

## Stage 4 – Add new engines

* **Identify candidate engines:** Determine which new markets or signals (e.g. energy price spreads, macroeconomic releases) should be added next.  For each, define required feeds and metrics and add them to the `feeds` table.
  * **Status: complete** via migration `db/migrations/0012_stage4_new_engines.sql` with initial `energy` and `macro_releases` engine seeds plus feed and metric metadata.
* **Implement collectors:** Write collectors for each new feed.  Use the pluggable collector interfaces introduced in Stage 1.  Ensure they respect back-off and error-handling policies.
  * **Status: complete (initial engine slice)** with `worker/src/jobs/collectors/energy.ts` collecting `energy_spread.wti_brent_spread` and `energy_spread.diesel_wti_crack` using retry/backoff-capable HTTP helpers.
* **Define rules:** Write rule definitions for each new engine, referencing both new and existing feeds as needed.  Validate them against historical data.
  * **Status: complete (initial engine slice)** with seeded energy rules in `0012_stage4_new_engines.sql` plus scoring integration referencing existing `price_signal.curve_slope` as confirmation.
* **Add engine-scoped APIs:** Expose new endpoints (e.g. `/api/v1/energy/state`) that return precomputed scores for the new engine.
  * **Status: complete (energy)** via `GET /api/v1/energy/state`, reading precomputed rows from `scores` for `energy.state`.

## Stage 5 – User interface and operator shell

* **Dashboard:** Build a dashboard showing engines, feeds, their freshness and current scores.  Provide drill-down into rule details and guardrail statuses.
  * **Status: complete (initial operator shell)** with frontend operator dashboard panel showing current engine score, feed freshness, rule list, and guardrail failures via admin APIs.
  * **Note:** the frontend currently keeps a static feed catalog fallback for display labels/order; long term this should be sourced from API metadata to avoid contract drift.
* **Rule editor:** Implement a form or code editor that allows operators to add or modify rules.  Validate rule syntax and provide previews of how rule changes would affect scoring.
  * **Status: complete (initial operator shell)** with JSON predicate validation, add/update rule actions, and dry-run preview wiring.
* **Backfill and testing:** Implement a tool to re-score historical data using the new rule engine.  Use this to compare new engines’ outputs against expectations.
  * **Status: complete (initial operator shell)** with `/api/admin/backfill/rescore` and UI controls to run historical comparisons with optional override rules.

## Stage 6 – Macro Signals Cut-over (Split into Phase 6A and Phase 6B)

**Status: In progress**

Stage 6 is split into two sequential phases based on realistic constraints:

### Phase 6A – Energy Engine (3-4 weeks, May 2026) [IN PROGRESS]

* **Validate energy engine independently:** Energy engine is already active and collecting from EIA APIs. Phase 6A establishes validation gates to confirm reliability before making it the default for `/api/state`.
* **Implement enforced pre-deploy gates:** 6 gates must pass before feature flag can flip: determinism, data freshness, rule consistency, guardrail correctness, health endpoint schema, rollout monitoring ready.
* **Gradual rollout to production:** Ramp from 0% → 10% (internal canary, Week 1) → 50% (public rollout, Weeks 2) → 100% (full production, Week 3) with monitoring and automatic rollback triggers.
* **Establish operational procedures:** Runbooks for monitoring, failure handling, rollback. Pre-deploy checklist tracking gate sign-offs.
* **Documentation:** See `/docs/phase-6a-energy.md`, `/docs/validation-strategy.md`, `/docs/energy-rollout-strategy.md`, `/docs/failure-handling.md`, `/docs/phase-6-rollback-procedures.md`, `/docs/pre-deploy-gates.md`, `PRE_DEPLOY_CHECKLIST.md`.

**Status: Documentation complete. Implementation starting (Days 4-28).**

### Phase 6B – Macro Releases Engine (Q3 2026, post-stabilization) [DEFERRED]

* **Prerequisites:** Energy engine must be stable in production for 4+ weeks, 8-12 weeks of CPI historical data accumulated, BLS API integration designed and reviewed.
* **Implement macro_releases engine:** BLS API collector, macro scorer, rules. Comprehensive error handling for transient/permanent API failures.
* **Multi-engine coordination:** Both energy and macro engines run simultaneously with per-component health tracking and graceful degradation.
* **Extended gradual rollout:** Similar phased approach as Phase 6A but with multi-engine monitoring.
* **Complete operator dashboard:** Add macro-specific UI (CPI release tracking, BLS health, combined engine dashboard).
* **Documentation:** See `/docs/phase-6b-macro-releases.md` (framework complete; detailed implementation deferred to Q3).

**Status: Deferred to Q3 2026 pending Phase 6A stabilization and CPI data accumulation.**

### Post-Phase-6: Snapshot Deprecation

After Phase 6A and Phase 6B are stable for 8+ weeks (target: Q4 2026):
* Remove Oil Shock snapshot-backed `/api/state` route (was deprecated in Phase 6A Week 4)
* Archived data remains in `signal_snapshots_archive_oil_shock` for historical query
* Clients migrated to `/api/v1/energy/state` and `/api/v1/macro_releases/state`

## Risks and considerations

1. **Schema drift:** Introducing new tables and dual writes increases complexity.  Mitigate by automating migrations and using integration tests.
2. **Over-engineering:** The rule engine should remain simple at first.  Avoid building a full DSL until there is a clear need.
3. **Data consistency:** Ensure collectors write data atomically and that scoring jobs see consistent snapshots of feed data.
4. **Incremental adoption:** Resist the temptation to rewrite everything at once.  Always maintain a working system during migration.

## Acceptance criteria

* The rule engine reproduces current scoring for Oil Shock when configured with equivalent thresholds.
* New engines can be added via configuration and rules without modifying core code.
* Guardrails downgrade or suppress signals when data is stale or incomplete.
* Operators can modify rules and backfill historical data without code changes.

## References

* `macro-signals-design.md` – detailed description of the target architecture
* `docs/architecture.md` – description of the current Oil Shock implementation
* `docs/current-priorities.md` – active priorities and near-term work
* `docs/phase-6a-energy.md` – Phase 6A energy engine implementation (3-4 weeks)
* `docs/phase-6b-macro-releases.md` – Phase 6B macro releases engine (Q3 2026, deferred)
* `docs/validation-strategy.md` – What we validate and why (engine-independent, not snapshot comparison)
* `docs/pre-deploy-gates.md` – Enforced pre-deployment gate system
* `docs/energy-rollout-strategy.md` – Gradual rollout procedure (0% → 10% → 50% → 100%)
* `docs/failure-handling.md` – Per-component graceful degradation
* `docs/phase-6-rollback-procedures.md` – Safe rollback post-migration-0013
* `PRE_DEPLOY_CHECKLIST.md` – Living checklist tracking gate sign-offs

This plan is a guide, not a contract.  As work progresses and the team learns more, stages may be re-ordered, merged or elaborated.  Update this file as those decisions are made.
