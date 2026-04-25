# Phase 6B BLS CPI Readiness Task

## Goal

Add a disabled-by-default Phase 6B readiness slice for the future Macro Releases engine by adding:
- BLS CPI parser fixtures (realistic API response shapes)
- Deterministic parser tests
- A minimal parser implementation
- An optional disabled collector shell
- Documentation clarifying the readiness state

This is readiness work only. No Phase 6B implementation.

## Hard Constraints

- ❌ Do not add CPI scoring
- ❌ Do not add portfolio actions
- ❌ Do not add UI work
- ❌ Do not change existing Energy, Oil Shock, or admin route behaviour
- ❌ Do not call the live BLS API in tests
- ✅ Use fixture-based tests only
- ❌ Do not introduce a broad generic collector framework
- ❌ Do not wire the collector into scheduled execution
- ❌ Do not edit unrelated files
- ✅ If equivalent code already exists, stop and report it instead of duplicating

## Commit Sequence

1. **Task Brief** — Create `docs/phase-6b-bls-cpi-readiness-task.md`
2. **Tests & Fixtures** — Add BLS CPI fixtures and failing tests
3. **Parser Implementation** — Minimal BLS CPI parser to make tests pass
4. **Disabled Collector Shell** — Optional disabled-by-default collector
5. **Documentation** — Update Phase 6B readiness status, run final validation

## Files Changed (Final)

- `docs/phase-6b-bls-cpi-readiness-task.md` (this file — readiness task tracker)
- `docs/phase-6b-macro-releases.md` (added readiness status section)
- `docs/current-priorities.md` (updated Phase 6B status summary)
- `worker/test/fixtures/bls-cpi-responses.json` (BLS API response fixtures)
- `worker/test/collectors/macro-releases.test.ts` (parser tests + integration tests)
- `worker/src/jobs/collectors/macro-releases.ts` (minimal parser + disabled collector)

## Validation Results (Final)

✅ **Commit 1**: Task brief created
✅ **Commit 2**: Fixtures and parser tests created
✅ **Commit 3**: Parser implementation + disabled collector shell
✅ **Commit 4**: Documentation updates and final validation

**Final Validation**:
- ✅ `corepack pnpm -C worker test -- collectors` — 85 total tests, 9 new CPI tests pass
- ✅ `corepack pnpm -C worker typecheck` — No type errors
- ✅ `corepack pnpm docs:check` — All documentation checks pass
- ✅ `corepack pnpm -C worker test` — Full suite (85 tests) passes
- ✅ Integration test confirms `collectMacroReleases` is not wired into `runCollection`
- ✅ No existing Energy, Oil Shock, or admin routes modified
- ✅ No live BLS API calls in tests (fixtures only)

## Status

**COMPLETE**: Phase 6B readiness slice ready for PR. CPI parsing infrastructure in place, disabled by default, with documentation clarifying the readiness state and implementation constraints.

## Out of Scope

- Live BLS API fetch (disabled)
- CPI observation write path
- Macro scoring rules
- Multi-engine scheduling changes
- UI changes or dashboards
- Schema migrations
