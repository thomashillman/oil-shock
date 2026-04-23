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

## Stage 2 – Data schema migration

* **Create new tables:** Add `engines`, `feeds`, `metrics`, `rules` and `scores` tables as described in the design.  Each table is additive: they can be present without affecting the current code.
* **Seed minimal metadata:** Populate the `engines` table with an entry for Oil Shock.  Populate the `feeds` table with existing feed keys and freshness thresholds.  Defer populating `rules` until the rule engine is in place.
* **Dual writes (optional):** Consider writing Oil Shock scores into the new `scores` table in parallel to the existing tables.  This will surface schema issues early.
* **Migration scripts:** Add migration code to create the new tables and to backfill historical data if dual writes are enabled.  Document how to roll back.

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
