# Phase 6A D1 Target Preflight Report

**Status**: ❌ BLOCKED

Generated: 2026-04-26T11:09:04.320Z

## D1 Bindings

### root
- Database: energy_dislocation
- ID: `9db64b68-6ffc-4be2-a2c6-667691a5801f`

### preview
- Database: energy_dislocation
- ID: `9db64b68-6ffc-4be2-a2c6-667691a5801f`

### production
- Database: energy_dislocation
- ID: `9db64b68-6ffc-4be2-a2c6-667691a5801f`

## Blockers

- shared D1 target (CRITICAL): preview and production both use database_id 9db64b68-6ffc-4be2-a2c6-667691a5801f. Migrations would affect both environments. Operator must confirm intended target and reconfigure D1 bindings before proceeding.

## Warnings

- shared D1 target: root and preview both use database_id 9db64b68-6ffc-4be2-a2c6-667691a5801f. Local and preview environments share the same database.
- shared D1 target: root and production both use database_id 9db64b68-6ffc-4be2-a2c6-667691a5801f. Local and production environments share the same database.

## Required Migrations

✅ 0014_phase6_pre_deploy_gates.sql
✅ 0015_api_health_tracking.sql
✅ 0016_add_diesel_crack_feed.sql

## Next Steps

**Status: BLOCKED** — Do not apply migrations until all blockers are resolved.

```bash
# Migration commands withheld: resolve blockers above before attempting to apply migrations.
```

## Summary

❌ This environment is **not ready** for migrations.

Blockers must be resolved before proceeding:
- shared D1 target (CRITICAL): preview and production both use database_id 9db64b68-6ffc-4be2-a2c6-667691a5801f. Migrations would affect both environments. Operator must confirm intended target and reconfigure D1 bindings before proceeding.
