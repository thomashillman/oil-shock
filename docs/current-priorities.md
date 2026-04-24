# Current Priorities

This document captures the current sequencing and decision constraints for work in this repository.

## Current status

- **Phase 6A (Energy Engine) is in progress** — May 2026, 3-4 week timeline
  - Energy engine validation and gradual rollout to production (0% → 100%)
  - Pre-deploy gates framework being implemented
  - Oil Shock snapshots remain archived and readable as fallback
- **Phase 6B (Macro Releases) is deferred to Q3 2026** — Requires 8-12 weeks of CPI data + energy stabilization
- The repo currently implements Oil Shock (retired, snapshots archived) + Energy engine (active, being validated)
- Macro Signals is the intended direction of travel, but target-state ideas must not be assumed to already exist in code
- `main` is the canonical branch and the implementation source of truth

## Phase 6A (May 2026): Energy Engine Validation and Rollout

**Timeline**: 3-4 weeks (Days 1-28)
**Owner**: Energy + Platform teams

### Phase 6A Work Streams

**Stream 1: Gate Infrastructure and Validation (Days 4-21)**
- [ ] Days 4-7: Implement `/api/admin/gate-status` endpoint (enforced pre-deploy gates)
- [ ] Days 4-7: Update `/api/health` with `runtimeMode` and `degradedComponents` fields
- [ ] Days 8-14: Implement energy determinism and data freshness tests
- [ ] Days 8-14: Implement `/api/admin/rules-compare` endpoint (rule consistency validation)
- [ ] Days 15-21: Implement per-component error tracking and graceful degradation

**Stream 2: Feature Flags and Monitoring (Days 8-21)**
- [ ] Add `ENERGY_ROLLOUT_PERCENT` feature flag (0-100 traffic split)
- [ ] Implement `/api/admin/rollout-status` endpoint
- [ ] Implement `/api/admin/rollback-status` endpoint
- [ ] Create observability dashboard (collector rate, scorer latency, guardrails, divergence)

**Stream 3: Production Rollout (Days 22-52)**
- [ ] Week 1 (Days 22-26): Internal canary at 10% (5-day monitoring)
- [ ] Week 2 (Days 27-35): Gradual public rollout 10% → 20% → 35% → 50%
- [ ] Week 3 (Days 36-42): Expand to 100% (7-day stability monitoring)
- [ ] Week 4 (Days 43-52): Stabilization, prepare Phase 6B (Q3)

### Pre-Phase-6A: Documentation (COMPLETE)

- [x] Phase 6A/6B planning docs (8 documents created)
- [x] Validation strategy clarified (engine-independent, not snapshot comparison)
- [x] Pre-deploy gate system design documented
- [x] Failure handling per component documented
- [x] Rollout strategy (0% → 100%) documented
- [x] Rollback procedures documented
- [x] Implementation plan updated (main docs)

See: `/docs/phase-6a-energy.md`, `/docs/validation-strategy.md`, `/docs/pre-deploy-gates.md`, `/docs/energy-rollout-strategy.md`, `/docs/failure-handling.md`, `/docs/phase-6-rollback-procedures.md`, `/docs/phase-6b-macro-releases.md`, `PRE_DEPLOY_CHECKLIST.md`

## Immediate priorities

### 1. Preserve the current Oil Shock path

Keep collection, scoring, snapshot writing, and the current API surface working while making changes. The existing path should remain operational during transition unless a task explicitly says to replace it.

### 2. Stage Macro Signals changes, do not jump there conceptually

Prefer additive, foundational changes over large rewrites that assume a finished multi-engine design. Build the bridge before crossing it.

### 3. Keep durable context in the repo

If an instruction, rule, or design constraint should guide future work, put it in repository docs rather than leaving it only in chat or project memory.

### 4. Keep documentation and implementation in sync

When routes, formulas, thresholds, collector behaviour, or UI contracts change, update the relevant docs in the same change set where practical.

### 5. Match validation to blast radius

Run the closest appropriate checks for the change. Scoring and migration work need stronger validation than isolated UI tweaks.

## Working assumptions

- The API should remain snapshot-based rather than computing heavy scoring work at request time.
- `config_thresholds` remains the source of truth for runtime scoring constants.
- Missing and stale data handling should remain explicit and conservative.
- Frontend changes should stay aligned with backend contracts.
- Schema work should prefer additive migrations before destructive clean-up.

## Recommended order for Macro Signals work

1. Move durable context into repo docs first.
2. Introduce shared abstractions behind the current Oil Shock path.
3. Add additive schema and configuration changes.
4. Introduce engine-scoped logic only when compatibility is preserved or intentionally replaced.
5. Retire old structures only after tests, docs, and consumers are updated.

## Current risks to watch

- Route and contract drift between Worker and app
- Docs drifting from the codebase
- Hardcoded scoring constants slipping back into code
- Refactors that assume multi-engine support exists before the data model and runtime support are ready
- Migration changes that update schema without updating dependent queries, types, and tests

## Documentation checklist

Update these files when relevant:

- `README.md`: top-level orientation and entry points
- `docs/architecture.md`: current implemented architecture and detailed behaviour
- `docs/current-priorities.md`: current sequencing, transition constraints, and non-goals
- `AGENTS.md`: durable agent operating rules
- `CLAUDE.md`: durable Claude-specific operating rules

## Change checklist

Before finishing a non-trivial change, check:

- Is the implementation still aligned with the current Oil Shock path?
- Did the work avoid assuming target-state Macro Signals structures already exist?
- Are code, tests, migrations, frontend contracts, and docs consistent?
- Were the right validation commands run for the blast radius?
