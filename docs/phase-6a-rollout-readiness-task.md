# Phase 6A Rollout Readiness Evidence Task

**Purpose**: Add a Phase 6A rollout readiness evidence layer that evaluates whether Energy rollout can move from preparation into the 10% canary phase.

**Goal**: Provide operators with a structured readiness assessment that:
- Checks existing telemetry (API health, validation gates, rollout controls)
- Reports which readiness criteria are met automatically
- Lists which manual checks remain (Grafana import, alert routing, staging verify, rollback rehearsal)
- Does NOT perform deployment, change rollout percentages, modify configuration, or claim live verification

---

## Hard Constraints

- ❌ Do not change Energy scoring behaviour
- ❌ Do not change collection behaviour  
- ❌ Do not change scheduled pipeline execution
- ❌ Do not change `ENERGY_ROLLOUT_PERCENT`
- ❌ Do not add Phase 6B functionality
- ❌ Do not enable live BLS collection
- ❌ Do not make network calls in tests
- ❌ Do not require Grafana, Slack, PagerDuty, Cloudflare, or live D1 in tests
- ❌ Do not edit unrelated files
- ⚠️  If equivalent readiness code already exists, stop and report instead of duplicating

---

## Intended Commits

1. **Commit 1** (DONE): Task brief (`docs/phase-6a-rollout-readiness-task.md`)
2. **Commit 2**: Failing readiness evaluator tests (`worker/test/rollout/readiness.test.ts`)
3. **Commit 3**: Minimal readiness evaluator implementation (`worker/src/core/rollout/readiness.ts`)
4. **Commit 4** (optional): Admin endpoint only if small and safe (`GET /api/admin/rollout-readiness`)
5. **Commit 5**: Documentation and checklist (`docs/phase-6a-rollout-readiness.md`)

---

## Files Changed So Far

### Commit 1
- `docs/phase-6a-rollout-readiness-task.md` — This task brief

### Commit 2
- `worker/test/rollout/readiness.test.ts` — Readiness evaluator tests (failing as expected)

### Commit 3
- `worker/src/core/rollout/readiness.ts` — Readiness evaluator implementation (pure, no network calls)

### Commit 4
- `worker/src/routes/admin-rollout-readiness.ts` — Admin endpoint for rollout readiness (aggregates data and calls evaluator)
- Updated `worker/src/index.ts` to wire the new endpoint into the router

### Commit 5
- `docs/phase-6a-rollout-readiness.md` — Comprehensive rollout readiness checklist (automatic + manual steps)

---

## Validation Run So Far

**Commit 1**:
- ✅ `corepack pnpm docs:check` (to verify docs)

**Commit 2**:
- ✅ `corepack pnpm -C worker test -- readiness` (fails as expected: module not found)

**Commit 3**:
- ✅ `corepack pnpm -C worker test -- readiness` (9 tests pass)
- ✅ `corepack pnpm -C worker typecheck` (no errors)

**Commit 4**:
- ✅ `corepack pnpm -C worker test -- readiness` (9 tests pass)
- ✅ `corepack pnpm -C worker typecheck` (no errors)
- ✅ Admin endpoint wired and accessible via GET /api/admin/rollout-readiness

**Commit 5**:
- ✅ `corepack pnpm docs:check` (documentation validation passes)
- ✅ `corepack pnpm -C worker test -- readiness` (9 tests pass)
- ✅ `corepack pnpm -C worker typecheck` (no errors)

---

## Review Findings Fixed

**Commit 1 (fix: make rollout readiness conservative)**:
- ✅ Added rollout percent checks: 0=ready, 10=warning, >10=blocked
- ✅ Added empty data validation: totalFeeds=0, totalGates=0, empty validation gates all block
- ✅ Added 7 pure evaluator tests covering new logic

**Commit 2 (fix: scope rollout readiness to Phase 6A feeds)**:
- ✅ Phase 6A required feeds constant: `eia_wti`, `eia_brent`, `eia_diesel_wti_crack`
- ✅ Endpoint filters to only Phase 6A feeds, seeded but inactive feeds don't block readiness
- ✅ Missing required feed blocks, unhealthy required feed blocks
- ✅ Added 5 route-level tests for endpoint authorization and feed filtering

**Commit 3 (docs: clarify Phase 6A readiness feed scope)**:
- ✅ Fixed wording: "Blockers" → "Warnings" in decision criteria
- ✅ Added prominent clarification that endpoint evaluates only Phase 6A required feeds
- ✅ Documented that non-required seeded feeds do not block readiness

## Current Status

**Phase**: All review findings fixed, ready for final validation

**Next Step**: Run validation and confirm all tests pass

---

## Deliberately Out of Scope

- No deployment or config changes
- No live API calls or network requests in tests
- No Grafana, Slack, PagerDuty, Cloudflare verification in code
- No Phase 6B infrastructure
- No BLS integration
- No changes to Energy scoring, collection, or pipeline
- No endpoints that flip rollout percentage or configuration
- No claim that staging, Grafana, or production verification has been completed (only operator checklist items)

---

## References

- `docs/current-priorities.md` — Phase 6A rollout phases and readiness prerequisites
- `docs/phase-6a-energy.md` — Phase 6A detailed plan including validation gates
- `docs/rollout-monitoring-strategy.md` — Monitoring strategy and phases
- `docs/TELEMETRY_SETUP_GUIDE.md` — API health telemetry setup
- `docs/GRAFANA_SETUP_GUIDE.md` — Grafana dashboard and alerts
- `worker/src/routes/admin-api-health.ts` — API health endpoint pattern
- `worker/src/routes/admin-rollout.ts` — Rollout status endpoint
- `worker/src/routes/admin-validation.ts` — Validation gate status
- `worker/src/routes/admin-gates.ts` — Pre-deploy gate system
