# Phase 6A D1 Target Preflight Task Brief

**Status**: In Progress  
**Branch**: `claude/phase-6a-d1-preflight-Oy7ZU`  
**Date**: April 26, 2026

## Goal

Add a read-only Phase 6A D1 migration target preflight guardrail so operators can safely confirm the D1 target before applying migrations 0014, 0015, and 0016.

This follows PR #79, which identified that:
- Preview Worker is reachable and responding
- D1 migrations 0014, 0015, 0016 are missing from the bound database, blocking Phase 6A readiness
- **Critical blocker**: root, preview, and production share the same D1 database ID in `wrangler.jsonc`

## Hard Constraints

- Do not apply migrations
- Do not deploy
- Do not change Energy scoring
- Do not change collection logic
- Do not change scheduled execution
- Do not change `ENERGY_ROLLOUT_PERCENT`
- Do not sign gates
- Do not start canary rollout
- Do not call Cloudflare APIs in tests
- Do not make real network calls in tests
- Do not add Phase 6B functionality
- Keep this as a preflight/reporting guardrail only

## Blocker Summary (PR #79)

### What Happened

The preview Worker deployment in PR #79 confirmed that:
1. Cloudflare Worker reaches the correct endpoint
2. The app is responsive
3. `/health` endpoint returns status

### Why Phase 6A Is Blocked

1. **Missing D1 tables**: The bound D1 database lacks the schema from migrations 0014, 0015, 0016
   - This causes API health tracking to fail
   - Readiness checks cannot pass without the tables

2. **Shared D1 ID Risk**: `wrangler.jsonc` shows the same database ID for root, preview, AND production:
   ```jsonc
   "database_id": "9db64b68-6ffc-4be2-a2c6-667691a5801f"  // Same for all envs
   ```
   - Applying migrations without confirmation could corrupt the wrong database
   - Requires explicit operator confirmation of intended target before running any migrations

### Intended Solution

This preflight tool:
- Parses `wrangler.jsonc` and detects shared D1 IDs
- Verifies migration files exist (0014, 0015, 0016)
- Reports status and required actions in Markdown
- Provides gated migration commands (commented, not executed)
- Exits non-zero when blockers are present
- Never applies migrations or calls Cloudflare

## Intended Commits

1. **Commit 1**: Task brief (`docs/phase-6a-d1-target-preflight-task.md`)
2. **Commit 2**: Failing tests for pure D1 target analyser
   - `scripts/phase6a/d1-target-preflight.ts` (pure module)
   - `worker/test/phase6a/d1-target-preflight.test.ts` (tests)
3. **Commit 3**: Implement pure analyser
4. **Commit 4**: CLI wrapper (`scripts/phase6a/check-d1-target.ts`)
5. **Commit 5**: Documentation updates

## Files Changed So Far

### Commit 1
- `docs/phase-6a-d1-target-preflight-task.md` (new)

### Commit 2
- `scripts/phase6a/d1-target-preflight.ts` (new, pure module)
- `worker/test/phase6a/d1-target-preflight.test.ts` (new, tests)

### Commit 3
- `scripts/phase6a/d1-target-preflight.ts` (implementation)

### Commit 4
- `scripts/phase6a/check-d1-target.ts` (new, CLI wrapper)
- `package.json` (add `phase6a:d1:preflight` script)

### Commit 5
- `docs/TELEMETRY_SETUP_GUIDE.md` (update)
- `docs/phase-6a-canary-evidence-capture.md` (update)
- `docs/current-priorities.md` (update)
- `docs/phase-6a-d1-target-preflight-task.md` (update status and final summary)

## Validation Run So Far

None yet (task brief only).

## Deliberately Out of Scope

- Migration application or execution
- Cloudflare API calls or deployment
- Changes to Energy scoring, rollout percent, or collection logic
- Phase 6B functionality (Macro Signals)
- Operator confirmation UI or automation
- Remediation of shared D1 IDs (operator decision only)
- Changes to gate signing or canary procedures

## Current Status

1. ✅ Branch created: `claude/phase-6a-d1-preflight-Oy7ZU`
2. ✅ Context reviewed: wrangler.jsonc confirms shared D1 ID blocker
3. ✅ Migrations exist: 0014, 0015, 0016 all present
4. ⏳ Commit 1: Task brief (current)
5. ⏳ Commit 2: Tests
6. ⏳ Commit 3: Pure analyser
7. ⏳ Commit 4: CLI wrapper
8. ⏳ Commit 5: Docs update

## Next Step

Commit 1 (this document) to establish task boundaries, then move to Commit 2 (failing tests).
