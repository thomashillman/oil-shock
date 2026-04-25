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

## Files Changed So Far

- `docs/phase-6b-bls-cpi-readiness-task.md` (this file)
- `worker/test/fixtures/bls-cpi-responses.json` (BLS API response fixtures)
- `worker/test/collectors/macro-releases.test.ts` (parser tests)
- `worker/src/jobs/collectors/macro-releases.ts` (minimal parser)

## Validation Run So Far

✅ `corepack pnpm -C worker test -- collectors` — All 7 new tests pass, 83 total tests pass
✅ `corepack pnpm -C worker typecheck` — No type errors

## Next Step

Add optional disabled-by-default collector shell and prove it's not wired into scheduled execution.

## Out of Scope

- Live BLS API fetch (disabled)
- CPI observation write path
- Macro scoring rules
- Multi-engine scheduling changes
- UI changes or dashboards
- Schema migrations
