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

---

## Validation Run So Far

**Commit 1**:
- [ ] `corepack pnpm docs:check` (to verify docs)

---

## Current Status

**Phase**: Setup (Commit 1 in progress)

**Next Step**: Write failing tests for readiness evaluator

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
