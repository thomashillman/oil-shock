# Phase 6A Live Endpoint Readiness Sync Task

**Owner**: Platform  
**Status**: In Progress  
**Date**: 2026-04-26

---

## Goal

Synchronize Phase 6A documentation to reflect actual current state and defer Grafana setup to a later stage while diagnosing HTTP 503 endpoint failures blocking readiness evidence.

---

## Hard Constraints

- ❌ Do NOT change `ENERGY_ROLLOUT_PERCENT` (remains 0%)
- ❌ Do NOT start 10% canary
- ❌ Do NOT sign gates or call `/api/admin/gate-sign-off`
- ❌ Do NOT commit secrets or plaintext API keys
- ❌ Do NOT make production migrations
- ❌ Do NOT mark Grafana complete (defer to later stage)
- ❌ Do NOT claim readiness if evidence is incomplete
- ❌ Do NOT touch Phase 6B

---

## Known Current State

### Completed ✅
- **PR #83 merged**: Plaintext API keys removed from `wrangler.jsonc`, keys configured as Cloudflare secrets
- **PR #81 merged**: D1 separation complete, preview D1 isolated, all migrations applied (0001-0016)
- **Staging telemetry**: Energy collector working, three Phase 6A feeds collecting data with live metrics
- **API health endpoint**: Returns HTTP 200 with live feed data (eia_wti, eia_brent, eia_diesel_wti_crack all OK)
- **Validation gates**: All 6 gates signed and passed by phase6a-poc
- **Pre-deploy gates**: 6/6 signed off
- **Feed status**: 
  - eia_wti: 7.69% error rate (OK, below 10% threshold)
  - eia_brent: 7.14% error rate (OK)
  - eia_diesel_wti_crack: 7.14% error rate (OK)

### Incomplete / Blocked ❌
- **Evidence capture**: Incomplete due to three endpoints returning HTTP 503 with non-JSON body
  - `/health`: HTTP 503, "DNS cache overflow"
  - `/api/admin/rollout-readiness`: HTTP 503, "DNS cache overflow"
  - `/api/admin/rollout-status`: HTTP 503, "DNS cache overflow"
  - `/api/admin/api-health`: HTTP 200 ✅ (only working endpoint)
- **Grafana dashboard**: Not started (deliberately deferred)
- **Alert routing**: Not started (deliberately deferred)
- **Team comms**: Not sent
- **Rollback rehearsal**: Not executed

---

## Grafana Deferral Decision

**Grafana dashboard import and alert routing are deferred to a later stage.**

Rationale:
- API health data is being collected and populated live
- The first critical blocker is restoring readiness evidence (three endpoints returning 503)
- Once readiness evidence is complete, Grafana can be imported in a separate phase
- Grafana is required before wider rollout, but not the immediate next task for unblocking 10% canary

Impact: Step 1 (Grafana) is moved from "immediate blocking path" to "pre-wider-rollout requirement". Does not block 10% canary readiness.

---

## Endpoint Failure Summary

### Observed Failures
Three endpoints return HTTP 503 with non-JSON body "DNS cache overflow":

```
GET /health → HTTP 503, "DNS cache overflow"
GET /api/admin/rollout-status → HTTP 503, "DNS cache overflow"
GET /api/admin/rollout-readiness → HTTP 503, "DNS cache overflow"
GET /api/admin/api-health → HTTP 200 ✅
```

### Diagnosis
The error "DNS cache overflow" is a **Cloudflare platform-level error**, not application JSON error handling. This indicates:
- Preview worker DNS misconfiguration, OR
- Cloudflare DNS resolver overload/issue, OR
- Preview deployment configuration issue

This is infrastructure/platform-level, not repo code issue. Requires Cloudflare dashboard inspection or support.

### Evidence Impact
Evidence capture tool correctly marks report as "INCOMPLETE EVIDENCE COLLECTION" and does not claim readiness when endpoints fail. This is correct conservative behavior.

---

## Intended Commits (This Branch)

1. **docs: add Phase 6A live endpoint readiness sync task** ← This file, task brief
2. **docs: defer Grafana and update Phase 6A readiness sequence** — Update `docs/current-priorities.md`
3. **docs: clarify incomplete evidence blocks canary** — Update evidence and runbook docs to prevent operators from jumping to canary
4. **docs: record Phase 6A endpoint failure diagnosis** — Add diagnostic notes to task brief after investigation

---

## Files Changed So Far

(Task brief only, no changes yet)

---

## Validation Run So Far

Not yet. Will run:
```bash
corepack pnpm docs:check
```

---

## Deliberately Out of Scope

- Code changes to `/health`, `/api/admin/rollout-status`, `/api/admin/rollout-readiness` (diagnosis suggests platform issue, not app code)
- Grafana setup or alert routing
- Key rotation or secrets reconfiguration
- Gate sign-off or reopening
- Canary execution or ENERGY_ROLLOUT_PERCENT changes
- Phase 6B work

---

## Current Status

- Readiness evidence: **INCOMPLETE** (three endpoints returning platform 503)
- API health: **GREEN** (feeds healthy, metrics flowing)
- 10% canary: **BLOCKED** (incomplete evidence, unresolved HTTP 503 failures)
- Documentation sync: **IN PROGRESS** (this task)

---

## Next Step

1. Update `docs/current-priorities.md` to defer Grafana and clarify blocking issues
2. Investigate endpoint failures via Cloudflare dashboard or diagnostics
3. Update evidence and runbook docs to clarify incomplete evidence blocks canary
4. Record diagnosis findings

