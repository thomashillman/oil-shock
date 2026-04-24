# Implementation plan: Macro Rules Engine completion

This plan describes the work required to move the current `main` branch from its present Oil Shock plus Energy transition state to a complete Macro Rules Engine.

Current baseline reviewed: `main` at `b74c561661a77e35919c06f96413a3a5fee38ed0`.

## Current position

The repository is no longer just the original Oil Shock proof of concept, but it is not yet the Macro Rules Engine.

Implemented or partially implemented today:

- Cloudflare Worker backend with D1 persistence.
- Vite and React frontend.
- Existing snapshot API for the older Oil Shock flow.
- Energy collection and scoring path.
- `scores` based Energy state endpoint at `/api/v1/energy/state`.
- Persisted rules with admin list, create, update, dry-run, compare, and backfill-rescore routes.
- A small rule evaluator over `physicalStress`, `priceSignal`, and `marketResponse`.
- Operator shell with dashboard, rule editor, and backfill panels.
- Health, rollout, validation, and gate-related admin plumbing.

Not complete yet:

- No target multi-engine schema as the primary model.
- No first-class `feed_registry`, `feed_checks`, `observations`, `rule_state`, `trigger_events`, `action_log`, or `rendered_outputs` runtime path.
- No registry-driven collector runner.
- No generic rule lifecycle that persists state, detects transitions, emits trigger events, and dispatches action intents.
- No full action manager for portfolio guardrails.
- No generic engine-scoped API surface.
- No Macro Signals frontend built from backend engine/feed registries.
- No CPI, Fed pivot, UK macro, valuation, or momentum engines.

Working estimate:

- Macro Rules Engine slice: roughly 30 to 35 percent complete.
- Full Macro Signals platform: roughly 20 to 25 percent complete.

The next work should be additive and staged. Do not delete old Oil Shock or snapshot behaviour until the new engine path is proven, tested, and consumed by the frontend.

## Definition of complete

The Macro Rules Engine is complete when all of the following are true.

A new engine can be registered without editing the Worker route switch or pipeline control flow.

A feed can be registered with metadata, freshness expectations, collection behaviour, and health tracking.

Collectors write idempotent observations with `release_key`, `latency_tag`, provenance metadata, optional artefact references, and feed health results.

Rules can read observations and prior rule state, update persistent state, detect threshold or transition events, and emit `trigger_events`.

Action decisions are handled by a shared action manager and recorded in `action_log` as `allowed`, `blocked`, `ignored`, or `error`.

Guardrails are centralised, deterministic, and tested. They must cover monthly allocation caps, cooling-off periods, no stacking on the same release, target allocation ceilings, and fail-closed behaviour when guardrail data is unavailable.

Engine-scoped APIs expose current state, history, observations, trigger events, actions, rendered outputs, and feed health.

The frontend gets engine and feed inventory from the backend, not from a hardcoded local catalogue.

The test suite covers migrations, collector fixtures, rule evaluation, rule state transitions, guardrail decisions, API contracts, and at least one end-to-end engine run.

## Guiding constraints

Keep the current Oil Shock and Energy paths working until an explicit cutover step replaces them.

Prefer additive migrations first. Do destructive clean-up only after new code paths are stable.

Use the current repo as source of truth. Planning material outside the repo should be moved into repo docs before it drives implementation.

Do not turn the rule engine into a large abstract DSL too early. Start with a small typed rule lifecycle that supports the known macro cases, then generalise only where repetition appears.

Do not connect any action manager to real trade execution. The first version logs decisions only.

Do not rely on live external APIs in unit tests. Use fixtures for collectors and deterministic synthetic data for rules.

## Phase 0: Baseline and contract lock

Goal: make completion measurable before more code is added.

Files to create or update:

- `implementation_plan.md`
- `docs/architecture.md`
- `docs/current-priorities.md`
- `docs/macro-rules-engine-contract.md`
- `specs/macro-rules-engine-acceptance.md`

Work required:

- Add a concise contract document defining required tables, routes, lifecycle events, guardrail behaviour, and acceptance tests.
- Make `docs/architecture.md` distinguish clearly between current runtime, bridge runtime, and target runtime.
- Keep `docs/current-priorities.md` aligned with the new phase sequence.
- Add an acceptance checklist that future Codex tasks can use without reading chat history.

Acceptance criteria:

- A reviewer can tell which parts exist now and which are planned.
- No doc says target-state structures exist before the code implements them.
- `corepack pnpm docs:check` passes.

Suggested tests:

```bash
corepack pnpm docs:check
```

## Phase 1: Add the target schema as an additive migration

Goal: create the persistence foundation without breaking the existing runtime.

Files to create or update:

- `db/migrations/00xx_macro_engine_core.sql`
- `worker/src/db/client.ts`
- `worker/src/db/macro.ts`
- `worker/src/types.ts`
- `worker/package.json`
- tests under `worker/src/db/` or `worker/src/__tests__/`

New tables:

- `engines`
- `feed_registry`
- `feed_checks`
- `observations`
- `rule_state`
- `trigger_events`
- `action_log`
- `rendered_outputs`

Minimum schema intent:

- `engines` stores `engine_key`, display name, status, description, and timestamps.
- `feed_registry` stores feed metadata, source, endpoint, parser type, cadence, expected freshness, status, schedule, notes, and optional R2 prefix.
- `feed_checks` stores per-feed check results, check step, result, detail JSON, latency, and timestamp.
- `observations` stores normalised data points with `engine_key`, `feed_key`, `series_key`, `release_key`, `as_of_date`, `observed_at`, `value`, optional revised value, unit, latency tag, metadata JSON, source hash, optional R2 artefact key, and timestamps.
- `rule_state` stores persistent per-engine state by `engine_key`, `rule_key`, and `state_key`.
- `trigger_events` stores rule transitions, computed values, prior state, new state, status, reason, release key, and run key.
- `action_log` stores guardrail decisions linked to trigger events.
- `rendered_outputs` stores Markdown and structured properties for UI and future Notion outputs.

Important detail:

The current Worker package local migration command appears to run only `0001_init.sql`. Update local migration workflow so a fresh local D1 database can apply the full migration chain. This is critical before adding more migrations.

Acceptance criteria:

- Existing tables remain intact.
- Fresh local migration creates old and new tables.
- New tables have unique constraints for idempotency where needed.
- No existing route or frontend path breaks.

Suggested tests:

```bash
corepack pnpm db:migrate:local
corepack pnpm -C worker test
corepack pnpm typecheck
```

## Phase 2: Introduce feed registry and observation writes

Goal: move from hardcoded collection output to registry-backed feed ingestion while preserving old reads.

Files to create or update:

- `worker/src/feeds/registry.ts`
- `worker/src/collectors/types.ts`
- `worker/src/jobs/collect.ts`
- `worker/src/jobs/collectors/energy.ts`
- `worker/src/db/macro.ts`
- `worker/src/routes/feed-health.ts`
- tests for collector fixtures and idempotency

Work required:

- Define a small `Collector` interface with `fetch`, `parse`, and `save` boundaries.
- Add feed registry seed rows for the current Energy feeds.
- Make the collection runner load enabled feeds from `feed_registry`.
- Dual-write Energy output to both `series_points` and `observations` during transition.
- Record every collector attempt in `feed_checks`.
- Update feed status in `feed_registry` based on latest check result and freshness.
- Add `/api/feed-health` returning aggregate health across registered feeds.

Do not yet migrate all old Oil Shock feeds. Prove the model first with Energy.

Acceptance criteria:

- Running the pipeline writes Energy data to `series_points` and `observations`.
- Re-running the same release does not duplicate observations.
- Feed failures create `feed_checks` rows and do not halt unrelated feeds.
- `/api/feed-health` returns current status for registered feeds.

Suggested tests:

```bash
corepack pnpm -C worker test
corepack pnpm typecheck
```

## Phase 3: Build Rule Engine v2 lifecycle

Goal: replace score-only rule adjustment with a full stateful rule lifecycle.

Files to create or update:

- `worker/src/core/rules/engine-v2.ts`
- `worker/src/core/rules/types.ts`
- `worker/src/core/rules/state.ts`
- `worker/src/core/rules/trigger-events.ts`
- `worker/src/jobs/score.ts`
- `worker/src/db/macro.ts`
- tests under `worker/src/core/rules/`

Work required:

- Define a `RuleContext` with engine key, run key, release key, observations, prior state, and evaluation timestamp.
- Define `RuleResult` with status, computed values, state updates, optional trigger event, and optional action intent.
- Keep existing simple threshold predicates as one supported rule type.
- Add minimal helpers for known macro needs: consecutive release count, consecutive daily close count, delta from prior release, and rolling z-score.
- Persist rule state into `rule_state`.
- Persist trigger transitions into `trigger_events`.
- Port the current Energy score rule path into Rule Engine v2, but keep the old `scores` write as a compatibility bridge.

Avoid a large open-ended DSL. The first target is a typed lifecycle that can support the known engines.

Acceptance criteria:

- Energy can be evaluated through Rule Engine v2.
- A rule can update persistent state.
- A transition creates exactly one idempotent trigger event per release.
- Old `/api/v1/energy/state` keeps working.

Suggested tests:

```bash
corepack pnpm -C worker test
corepack pnpm replay:validate
corepack pnpm typecheck
```

## Phase 4: Add Action Manager and portfolio guardrails

Goal: centralise action decisions and persist every allowed or blocked decision.

Files to create or update:

- `worker/src/core/actions/action-manager.ts`
- `worker/src/core/actions/guardrails.ts`
- `worker/src/core/actions/types.ts`
- `worker/src/db/macro.ts`
- `worker/src/routes/admin-guardrails.ts`
- tests under `worker/src/core/actions/`

Guardrails to implement first:

- 15 percent monthly cap.
- Cooling-off period after confirmed trigger.
- No stacking on the same release or print.
- Target allocation ceiling.
- Fail closed if required portfolio or prior action state cannot be read.

Work required:

- Define `ActionIntent` from rule results.
- Define `GuardrailDecision` as `allowed`, `blocked`, `ignored`, or `error`.
- Evaluate guardrails using `action_log` and relevant state.
- Write every decision to `action_log`.
- Expose guardrail failures and recent decisions through admin routes.

Acceptance criteria:

- Confirmed trigger events produce action decisions.
- Blocked decisions include a concrete reason.
- Missing guardrail data blocks action rather than allowing it.
- No real trade execution exists.

Suggested tests:

```bash
corepack pnpm -C worker test
corepack pnpm typecheck
```

## Phase 5: Introduce generic engine-scoped APIs

Goal: expose the new engine model without immediately removing old routes.

Files to create or update:

- `worker/src/routes/engines.ts`
- `worker/src/routes/observations.ts`
- `worker/src/routes/trigger-events.ts`
- `worker/src/routes/actions.ts`
- `worker/src/routes/outputs.ts`
- `worker/src/index.ts`
- API tests

Routes to add:

- `GET /api/engines`
- `GET /api/engines/:engine_key/state`
- `GET /api/engines/:engine_key/state/history`
- `GET /api/engines/:engine_key/observations`
- `GET /api/engines/:engine_key/trigger-events`
- `GET /api/engines/:engine_key/actions`
- `GET /api/engines/:engine_key/outputs`
- `GET /api/feed-health`

Work required:

- Add pagination with `limit` and cursor or offset.
- Add consistent JSON error bodies.
- Keep old `/api/state`, `/api/evidence`, `/api/coverage`, and `/api/v1/energy/state` routes during transition.
- Add API contract tests for success and failure cases.

Acceptance criteria:

- Generic engine APIs work for Energy.
- Old routes still work.
- Frontend can switch to generic APIs without losing current state.

Suggested tests:

```bash
corepack pnpm -C worker test
corepack pnpm typecheck
```

## Phase 6: Make the frontend registry-driven

Goal: move the UI from a single-engine Oil Shock app with local catalogues to a Macro Signals operator console.

Files to create or update:

- `app/src/api/engines.ts`
- `app/src/components/OperatorShell.tsx`
- `app/src/components/operator-shell/catalog.ts`
- `app/src/components/operator-shell/useOperatorShellData.ts`
- `app/src/pages/OverviewPage.tsx`
- `app/src/pages/EnginePage.tsx`
- `app/src/pages/FeedHealthPage.tsx`
- frontend tests

Work required:

- Replace hardcoded `ENGINE_CATALOG` and `FEED_CATALOG` with backend data.
- Add Overview, Engine, Macro Signals, and Feed Health navigation.
- Keep the current Oil Shock display as a compatibility view until retired.
- Display trigger events and action decisions clearly.
- Add loading, empty, degraded, and error states.
- Keep the design dense, operator-facing, and accessible.

Acceptance criteria:

- UI can show all engines returned by `/api/engines`.
- Feed Health page renders registered feeds and check results.
- Rule editor and backfill tooling remain usable.
- App tests cover basic tab navigation and API error handling.

Suggested tests:

```bash
corepack pnpm -C app test
corepack pnpm -C app typecheck
corepack pnpm build
```

## Phase 7: Add macro engines one at a time

Goal: add real Macro Signals coverage without destabilising the platform.

Order:

1. Harden Energy as the reference engine.
2. Add US CPI engine.
3. Add Fed pivot engine.
4. Add valuation and momentum engine.
5. Add UK macro shock engine.

For each engine, add:

- Engine registry row.
- Feed registry rows.
- Collector fixtures.
- Collector implementation.
- Rule definitions.
- Rule state tests.
- Trigger event tests.
- Guardrail tests if it can produce action intents.
- Rendered output template.
- End-to-end engine run test.

Engine notes:

Energy should remain the proving ground for runtime mechanics. It should validate feed checks, observations, rule state, trigger events, score compatibility, and UI rendering.

US CPI should support release-based idempotency, prior-release comparison, two-release confirmation rules, and no-stacking behaviour.

Fed pivot should support daily probability observations, consecutive close counts, confirmation thresholds, and priced-versus-confirmed distinctions.

Valuation and momentum should support closing-data-only evaluation, Friday valuation logic, weekday momentum logic, breadth thresholds, and two-consecutive-close confirmation.

UK macro shock should support official-source feeds, independent confirmation across at least two series, z-score or deterioration rules, and Notion-ready rendered outputs.

Acceptance criteria:

- Each engine can run independently.
- Each engine emits observations, state, events, and rendered outputs.
- Guardrail decisions are shared across engines.
- Adding one engine does not require duplicating pipeline control flow.

Suggested tests:

```bash
corepack pnpm -C worker test
corepack pnpm replay:validate
corepack pnpm typecheck
corepack pnpm docs:check
```

## Phase 8: Cutover and retire old structures

Goal: move from bridge runtime to target runtime safely.

Do this only after the new runtime is stable.

Work required:

- Switch frontend reads to generic engine APIs.
- Keep old APIs as aliases for one release window.
- Add migration scripts to backfill old `series_points` into `observations` where valuable.
- Add migration scripts to archive or map old `signal_snapshots` into rendered or historical output tables if needed.
- Mark old Oil Shock snapshot path as retired in docs.
- Remove old read paths only after tests and consumers are updated.

Acceptance criteria:

- Fresh deploy works from empty local D1 using full migration chain.
- Existing production data remains readable or intentionally archived.
- No frontend consumer depends on old snapshot-only routes.
- Documentation reflects the new runtime accurately.

Suggested tests:

```bash
corepack pnpm ci:preflight
```

## Phase 9: Operational hardening

Goal: make the engine reliable enough to trust for scheduled macro monitoring.

Files to create or update:

- `docs/runbook.md`
- `docs/feed-registry.md`
- `docs/guardrails.md`
- `docs/release-process.md`
- observability and admin route tests

Work required:

- Add runbook entries for failed collectors, stale feeds, blocked guardrails, and failed notifications.
- Add feed freshness and schema drift checks.
- Add admin view or route for recent runs and failed steps.
- Add deterministic fixtures for known macro release scenarios.
- Add release checklist for new engine rollout.
- Add rollback steps for bad migrations, bad rules, bad feed parsers, and bad frontend contract changes.

Acceptance criteria:

- Failed feeds are visible without reading logs.
- Bad rules can be disabled quickly.
- Guardrail blocks are explainable.
- New engine rollout has a repeatable checklist.

Suggested tests:

```bash
corepack pnpm ci:preflight
```

## TDD sequence for the next Codex tasks

Use these as the next small implementation slices.

### Task 1: Add macro core schema

Create additive migrations and DB helper tests for `engines`, `feed_registry`, `feed_checks`, `observations`, `rule_state`, `trigger_events`, `action_log`, and `rendered_outputs`.

Do not change existing runtime behaviour.

Acceptance:

- Fresh local migration creates all tables.
- Existing tests pass.
- DB helper tests prove idempotent observation insert behaviour.

### Task 2: Dual-write Energy observations

Update the Energy collector path so it writes old `series_points` and new `observations`.

Acceptance:

- Existing Energy score still works.
- Observation rows are idempotent.
- Feed checks are recorded.

### Task 3: Add feed health API

Implement `/api/feed-health` from `feed_registry` and `feed_checks`.

Acceptance:

- Healthy, stale, and error feeds return predictable payloads.
- Frontend can consume it without hardcoded feed state.

### Task 4: Implement Rule Engine v2 state writes

Add the typed rule lifecycle and port Energy as the first user.

Acceptance:

- Rule state writes are deterministic.
- Trigger events are emitted idempotently.
- Existing score endpoint remains compatible.

### Task 5: Add Action Manager logging

Implement guardrail decision logging from trigger events.

Acceptance:

- Allowed and blocked actions are persisted.
- Missing guardrail data blocks action.
- No real trade execution exists.

### Task 6: Add generic engine APIs

Expose `/api/engines` and `/api/engines/:engine_key/*` routes.

Acceptance:

- Energy works through generic routes.
- Old routes still pass tests.

### Task 7: Convert frontend catalogues to backend-driven data

Remove local-only engine/feed inventory and consume generic APIs.

Acceptance:

- The app shows registered engines and feeds.
- Oil Shock compatibility view still renders.

## Key risks

The biggest risk is creating a second half-platform beside the old one. Avoid that by dual-writing, then gradually switching reads, then retiring old paths only after tests and consumers move.

The second risk is over-generalising the rule DSL before the known engines exist. Use typed helpers and concrete rule modules first. Generalise only when the second or third engine repeats a pattern.

The third risk is guardrail ambiguity. Guardrails should fail closed, write clear reasons, and never imply a real trade was executed.

The fourth risk is docs drifting from implementation. Any change to routes, schema, scoring, collector behaviour, or guardrails should update docs in the same PR where practical.

## Recommended immediate next move

Start with Phase 1 and Task 1: additive macro core schema plus DB helper tests.

This gives the rest of the work a stable foundation and avoids bolting CPI, Fed, UK macro, valuation, and momentum logic onto the old `series_points` and snapshot model.
