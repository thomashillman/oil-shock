# Phase 6A Canary Evidence Capture Task

**Status**: Complete  
**Branch**: `phase-6a/canary-evidence-capture`  
**Timeline**: Before Day 22 (Phase 1 Canary execution)
**Completed**: 2026-04-25

## Goal

Add a small, read-only Phase 6A canary evidence capture tool and runbook. This helps operators collect evidence before moving Energy rollout from 0% to 10% canary. It must not deploy anything, flip any flags, sign any gates, alter D1 data, or claim manual verification happened.

## Hard Constraints

- ✅ Do not change Energy scoring behaviour
- ✅ Do not change collection behaviour
- ✅ Do not change scheduled pipeline execution
- ✅ Do not change `ENERGY_ROLLOUT_PERCENT`
- ✅ Do not add Phase 6B functionality
- ✅ Do not enable live BLS collection
- ✅ Do not add write calls to admin gate sign-off endpoints
- ✅ Do not make network calls in tests
- ✅ Do not require live Cloudflare, Grafana, Slack, PagerDuty, or D1 in tests
- ✅ Keep this as a read-only evidence and operator-support increment
- ✅ If equivalent evidence-capture tooling already exists, report it instead of duplicating

## Implementation Plan

### Commit 1: Task Brief
- **File**: `docs/phase-6a-canary-evidence-capture-task.md`
- **Action**: Create this task brief
- **Validation**: `corepack pnpm docs:check` (if available)

### Commit 2: Report Formatter Tests
- **Files**:
  - `scripts/phase6a/evidence-report.ts`
  - `scripts/phase6a/evidence-report.test.ts`
- **Action**: Add tests for a pure Markdown report formatter
- **Inputs**: Mocked endpoint payloads for `/health`, `/api/admin/rollout-readiness`, `/api/admin/rollout-status`, `/api/admin/api-health`
- **Test coverage**:
  - Ready evidence produces a clear "ready for 10% canary" section
  - Blocked readiness produces a clear "do not proceed" section
  - Warning readiness produces a clear "explicit sign-off required" section
  - Manual checks from rollout-readiness are preserved
  - Endpoint timestamps and generatedAt values are included
  - Missing endpoint data is conservative and marked incomplete
  - Formatter is deterministic for identical input
- **Validation**: Run the test suite

### Commit 3: Report Formatter Implementation
- **File**: `scripts/phase6a/evidence-report.ts`
- **Action**: Implement the formatter to satisfy tests
- **Constraints**:
  - Pure function, independent from live HTTP
  - No Worker route handler imports
  - Local types only (no shared repo contracts)
  - Plain Markdown output
  - Conservative language:
    - "This report does not deploy."
    - "This report does not change rollout percentage."
    - "Manual checks remain manual."
    - "Proceed only if status is ready and manual checks are signed off."
- **Validation**: Run formatter tests, typecheck

### Commit 4: Read-Only CLI Wrapper
- **File**: `scripts/phase6a/capture-canary-evidence.ts` (and optional test)
- **Action**: Add CLI that fetches read-only endpoints and writes evidence report
- **CLI Behaviour**:
  - Accept `--base-url` or use `PHASE6A_BASE_URL` env var
  - Accept bearer token from `ADMIN_TOKEN` or `ADMIN_API_BEARER_TOKEN`
  - Fetch only read-only endpoints:
    - `/health`
    - `/api/admin/rollout-readiness`
    - `/api/admin/rollout-status`
    - `/api/admin/api-health`
  - Do NOT call:
    - `/api/admin/gate-sign-off`
    - any POST endpoint
    - any deployment or flag-changing command
  - Default output: print Markdown to stdout
  - Optional `--out <path>`: write to file
  - Partial endpoint failure: include in report and mark incomplete
  - Do not throw away partial evidence
- **Tests**:
  - Mock fetch
  - Prove only GET endpoints called
  - Prove bearer token included
  - Prove partial failure handled
  - Prove no POST calls made
- **Validation**: Run CLI tests, typecheck

### Commit 5: Package Scripts and Operator Docs
- **Files**:
  - `docs/phase-6a-canary-evidence-capture.md` (operator runbook)
  - Update `docs/phase-6a-rollout-readiness.md` (reference the script)
  - Update `docs/current-priorities.md` (reference the tool)
  - Update `package.json` (add script if simple)
- **Docs should explain**:
  - When to run the script
  - Required env vars
  - Exact command examples
  - What endpoints it calls
  - How to interpret ready/warning/blocked
  - Where to store the generated report
  - That the script does NOT deploy or flip rollout percentage
  - That Grafana import, alert routing, staging telemetry, rollback rehearsal, and team communication still require manual sign-off
- **Validation**: `corepack pnpm docs:check`, run full test suite

## Files Changed

**Created**:
- `docs/phase-6a-canary-evidence-capture-task.md`
- `scripts/phase6a/evidence-report.ts`
- `scripts/phase6a/evidence-report.test.ts`
- `scripts/phase6a/capture-canary-evidence.ts`
- `scripts/phase6a/capture-canary-evidence.test.ts`
- `docs/phase-6a-canary-evidence-capture.md`

**Modified**:
- `docs/phase-6a-rollout-readiness.md` (added evidence capture tool section)
- `docs/current-priorities.md` (added Step 2: Evidence Capture)
- `package.json` (added `phase6a:evidence` script)

## Validation Run Summary

✅ **All tests pass**:
- `corepack pnpm docs:check` — Documentation checks passed
- `corepack pnpm -C worker test -- readiness` — 111 passed, 2 skipped
- `corepack pnpm -C worker test -- routes` — 111 passed, 2 skipped
- `corepack pnpm -C worker typecheck` — No type errors
- `corepack pnpm -C worker test` — Full worker suite: 111 passed, 2 skipped

## Current Status

- ✅ Task brief created and finalized
- ✅ Report formatter tests (9 tests, all passing)
- ✅ Report formatter implementation (deterministic, handles all statuses)
- ✅ CLI wrapper (read-only, no network calls in tests)
- ✅ Operator docs and package scripts
- ✅ All validation tests green
- ✅ 5 commits created on feature branch

## Ready for PR

All work complete. Branch ready for pull request.

## Deliberately Out Of Scope

- Deployment changes
- Rollout percentage changes
- Gate sign-off writes
- Energy scoring changes
- Collection pipeline changes
- Phase 6B functionality
- Live Grafana, Slack, PagerDuty, Cloudflare, or D1 verification in tests
- Automatic rollout execution
- Manual verification claims
- Evidence storage or database changes
