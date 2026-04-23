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
* **Implement guardrails:** Add a guardrail subsystem that checks feed freshness and completeness before scoring.  Integrate guardrail flags into the score output.
* **Define initial rules:** For Oil Shock, translate existing hard-coded thresholds into rule definitions.  Validate that the rule engine reproduces the current scoring behaviour.
* **Operator tooling:** Provide a basic UI or CLI to list rules, modify them and review guardrail failures.  Include a dry-run mode for testing rule changes.

## Stage 4 – Add new engines

* **Identify candidate engines:** Determine which new markets or signals (e.g. energy price spreads, macroeconomic releases) should be added next.  For each, define required feeds and metrics and add them to the `feeds` table.
* **Implement collectors:** Write collectors for each new feed.  Use the pluggable collector interfaces introduced in Stage 1.  Ensure they respect back-off and error-handling policies.
* **Define rules:** Write rule definitions for each new engine, referencing both new and existing feeds as needed.  Validate them against historical data.
* **Add engine-scoped APIs:** Expose new endpoints (e.g. `/api/v1/energy/state`) that return precomputed scores for the new engine.

## Stage 5 – User interface and operator shell

* **Dashboard:** Build a dashboard showing engines, feeds, their freshness and current scores.  Provide drill-down into rule details and guardrail statuses.
* **Rule editor:** Implement a form or code editor that allows operators to add or modify rules.  Validate rule syntax and provide previews of how rule changes would affect scoring.
* **Backfill and testing:** Implement a tool to re-score historical data using the new rule engine.  Use this to compare new engines’ outputs against expectations.

## Stage 6 – Cut-over and decommissioning

* **Parallel running:** Run the Oil Shock engine and the new Macro Signals engines side by side in production.  Compare outputs and ensure there are no regressions.
* **Switch default APIs:** Once the new engines are stable, update public API endpoints to serve from Macro Signals.  Provide compatibility shims for old clients if needed.
* **Retire legacy code:** Remove Oil Shock-specific collectors, scoring functions and routes once all clients have migrated.  Keep legacy data available through archival endpoints or backups.

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

* `macro-signals-design.md` – detailed description of the target architecture.
* `docs/architecture.md` – description of the current Oil Shock implementation.
* `docs/current-priorities.md` – active priorities and near-term work.

This plan is a guide, not a contract.  As work progresses and the team learns more, stages may be re-ordered, merged or elaborated.  Update this file as those decisions are made.
