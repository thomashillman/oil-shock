# Macro Signals Target Architecture

## Overview

Macro Signals is a planned evolution of the existing Oil Shock system into a flexible, multi-engine architecture.  The current implementation is a single engine that collects, scores and publishes volatility indicators for oil prices; Macro Signals extends this model to support multiple feed engines (for example energy, commodities, macroeconomic releases or volatility indices) with a unified registry, rule engine and guardrails.  This document records the intended target architecture so that future work can be aligned with it; it is **not** a description of the current codebase.

## Design goals

1. **Multiple engines:** Allow the platform to run several independent data-collection and scoring engines concurrently.  Each engine defines its own data collection tasks, rules and thresholds but shares the same infrastructure for scheduling, storage and serving.  The design must support adding or removing engines without impacting others.
2. **Unified feed registry:** Maintain a single source of truth for all feeds and metrics across engines.  A `feeds` table defines each feed, its type, its default freshness expectations and any engine-specific metadata.  Downstream rules and APIs refer to feeds via this registry instead of hard-coding keys.
3. **Rule engine:** Replace hand-coded threshold logic with a configurable rules system.  Rules are stored in a `rules` table with predicates, weights and actions.  During scoring, the engine evaluates applicable rules to compute a signal score and decide whether to emit a signal, downgrade it, or flag it as inconclusive.  Rules can express cross-feed dependencies (for example requiring confirmation from a related feed).
4. **Guardrails:** Provide conservative defaults for missing or stale data.  If a critical feed is missing or older than its freshness threshold, the engine should downgrade the signal, avoid overconfidence and annotate the result.  Guardrails help avoid false positives when data quality is poor.
5. **Engine-scoped APIs:** Expose precomputed state and live signals via endpoints that are namespaced by engine (for example `/api/v1/energy/state` or `/api/v1/macro/state`).  Clients can query a specific engine or aggregate across engines.  Internal APIs (used by cron tasks) remain engine-agnostic.
6. **Operator shell:** Include an administrative UI to inspect feed health, view rule definitions and trigger backfills.  The shell should allow adding new feeds and rules without code changes and provide diagnostics when guardrails suppress a signal.
7. **Extensibility and migration:** The architecture must allow the existing Oil Shock engine to run unchanged while new engines are added.  Migration to Macro Signals is incremental; there is no “big bang” cut-over.  The design accommodates new table versions and features via additive migrations.

## Entities and schema

| Entity | Purpose |
|---|---|
| **Engine** | A logical grouping of feeds, rules and schedules.  Each engine has a unique key, a description and configuration such as default scoring weights. |
| **Feed** | A source of raw data (e.g. price ticks, API responses or scraped pages).  The `feeds` table holds metadata: name, engine key, expected frequency, freshness threshold and measurement units. |
| **Metric** | A derived quantity computed from one or more feeds (for example “30-minute moving average of oil price”).  Metrics are defined in a `metrics` table with transformation expressions. |
| **Rule** | A condition that influences scoring.  Rules include predicates (for example “if price change > threshold”), a weight or effect, and a target outcome (e.g. upgrade, downgrade or ignore). |
| **Score** | A computed signal value resulting from applying rules to metrics.  Scores are stored in a `scores` table keyed by engine, feed and timestamp. |
| **Guardrail** | A policy controlling how to handle missing or stale data.  Guardrails define fallback behaviours (e.g. return `null` score, degrade to lower confidence) when inputs are unavailable. |

The schema uses engine keys to partition data.  For example, `scores` has columns `engine_key`, `feed_key`, `timestamp`, `score_value`, `confidence` and `flags`.  A feed record includes `engine_key`, `feed_key`, `name`, `refresh_interval_seconds`, `freshness_threshold_seconds`, and any additional metadata required by the specific collector.

## Data flow

1. **Collection:** Each engine defines one or more collectors that fetch raw data from external sources.  A collector writes new feed entries to the `feed_data` table and updates last-seen timestamps in `feeds`.
2. **Derivation:** When new feed data arrives, a derivation worker computes derived metrics (moving averages, spreads, etc.) according to definitions in the `metrics` table.
3. **Scoring:** A scoring worker runs periodically (or on demand) to evaluate rules for all feeds in an engine.  It reads current metrics, applies guardrails to handle missing data and computes a `score` with associated confidence and flags.  Scores are persisted to `scores` and optionally emitted as events.
4. **Serving:** The API layer reads precomputed scores and returns them via engine-scoped endpoints.  It can also return raw feed data and metric histories for debugging.
5. **Monitoring and operator actions:** Operators can use the shell to view feed freshness, adjust rules and guardrails and trigger backfills.  Alerts are sent when feeds go stale or scores fail guardrails.

## Guardrails

Guardrails enforce conservative behaviour when inputs are questionable.  They operate at multiple levels:

* **Freshness:** If a feed’s last-updated time exceeds its freshness threshold, scores dependent on that feed are downgraded to low confidence or omitted entirely.
* **Completeness:** If required related feeds are missing (for example a confirmation feed), rules that depend on them are deferred.
* **Downgrades:** When guardrails fire, the engine records the reason (stale data, missing confirmation, etc.) in the `flags` column of the `scores` table so clients can understand why a signal was muted.

## User interface

The UI is intentionally minimal in the target architecture, focusing on clarity and operator control.  Key features:

* A dashboard showing engines, feeds and their health (freshness, error rates, etc.).
* A rules editor to view and modify rule definitions safely.  Changes are staged and can be previewed before being applied.
* A backfill and re-score tool to recompute historical scores after rule changes.
* Documentation links to this design document and to the implementation-plan document.

## Cautions

* **Not implemented yet.**  As of this writing (April 2026), the main branch still implements the Oil Shock engine only.  This document describes a **target** state.  Do not assume classes, tables or endpoints described here already exist.
* **Separate current and future:** Refer to `docs/architecture.md` for the current implementation and to `docs/implementation-plan.md` for the sequencing and roadmap.
* **Incremental migration:** The Macro Signals design is meant to be adopted gradually.  Avoid rewriting everything at once; instead, extract common components and build new engines alongside the old one.
