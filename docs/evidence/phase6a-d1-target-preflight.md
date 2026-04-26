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

## Next Steps

Once all operator confirmations are complete:

```bash
# CRITICAL: Do not run until D1 target is confirmed
# Apply migrations to Cloudflare D1 preview environment:
# wrangler d1 migrations apply energy_dislocation --env preview

# Production migrations are intentionally out of scope for this pre-canary verification step.
```

## Summary

⚠️  This environment is ready for operator review.

Before applying migrations:
1. Review blockers and warnings above
2. Confirm all required migration files are present
3. Verify D1 target configuration is correct
4. Apply Cloudflare D1 migrations only after explicit operator confirmation
