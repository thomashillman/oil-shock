# Phase 6A D1 Target Preflight Report

**Status**: ⚠️  OPERATOR REVIEW REQUIRED

Generated: 2026-04-26T12:53:56.665Z

## D1 Bindings

### root
- Database: energy_dislocation
- ID: `9db64b68-6ffc-4be2-a2c6-667691a5801f`

### preview
- Database: energy_dislocation
- ID: `f9e3848e-20e6-43f0-8b0f-4fb652572d16`

### production
- Database: energy_dislocation
- ID: `9db64b68-6ffc-4be2-a2c6-667691a5801f`

## Warnings

- shared D1 target: root and production both use database_id 9db64b68-6ffc-4be2-a2c6-667691a5801f. Local and production environments share the same database.

## Required Migrations

✅ 0014_phase6_pre_deploy_gates.sql
✅ 0015_api_health_tracking.sql
✅ 0016_add_diesel_crack_feed.sql

## Status

✅ **CONFIGURATION & MIGRATIONS COMPLETE** — All migrations applied and tables verified in preview database.

This report was generated at the configuration stage. For migration application results and live staging telemetry, see `docs/evidence/phase6a-staging-telemetry-verification.md`.

## Completion Status

**Configuration & Migration (Completed in PR #81):**
- ✅ Preview D1 database created and bound in `wrangler.jsonc`
- ✅ Preview and production have separate database IDs
- ✅ All 16 migrations applied to preview database
- ✅ Required tables verified in preview:
  - `pre_deploy_gates`
  - `gate_sign_off_history`
  - `api_health_metrics`
  - `api_feed_registry`
- ✅ No CRITICAL blockers
- ⚠️ Root and production share a database (expected for this phase)

**Live Verification & Canary Readiness:**
- See `docs/evidence/phase6a-staging-telemetry-verification.md` for staging telemetry results and current readiness status
