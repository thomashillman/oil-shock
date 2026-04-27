# Phase 6A Readiness Status Index

**Purpose**: Quick reference for current Phase 6A readiness state and where to find authoritative evidence.

**Last Updated**: 2026-04-27

---

## Current Status

🔴 **BLOCKED** — Evidence collection incomplete due to preview endpoint reliability instability

**Blocker**: Required preview endpoints intermittently return HTTP 503 `DNS cache overflow`

**Evidence Report Status**: **INCOMPLETE** (as of 2026-04-27T10:51:19Z)
- `/health`: HTTP 503 ❌
- `/api/admin/rollout-readiness`: HTTP 503 ❌
- `/api/admin/rollout-status`: HTTP 503 ❌
- `/api/admin/api-health`: HTTP 200 ✅

**Next Action**: Stabilize preview endpoint reliability, then rerun evidence capture

---

## Authoritative Evidence Files

### Latest Evidence Report
**File**: `docs/evidence/phase6a-staging-telemetry-verification.md`
**Generated**: 2026-04-27T10:51:19.314Z
**Status**: INCOMPLETE (endpoint failures prevent ready status)
**Key Finding**: 3 Energy feeds healthy (0% error rate), but HTTP 503 on required endpoints blocks canary approval

### D1 Configuration & Migration Status
**File**: `docs/evidence/phase6a-d1-target-preflight.md`
**Generated**: 2026-04-26T12:53:56.665Z
**Status**: ✅ COMPLETE
**Key Finding**: Preview/production D1 separation complete, all migrations applied and verified

---

## Completed Readiness Work

### Infrastructure (Completed)
- ✅ D1 preview/production separation (PR #81)
- ✅ Migrations 0014, 0015, 0016 applied to preview database
- ✅ API health tracking implemented and wired
- ✅ Pre-deploy gate system implemented
- ✅ Evidence capture tool implemented (PR #86)

### Worker Naming (Fixed PR #85)
- ✅ Preview environment targets: `energy-dislocation-engine-preview-preview` (canonical)
- ✅ Production environment targets: `energy-dislocation-engine-production` (canonical)
- ✅ Root deployment non-canonical and guarded (CI/scripts use explicit environments)

### Telemetry (Verified)
- ✅ Energy collector wired to `instrumentedFetch()` (PR #??)
- ✅ Metrics flowing to `api_health_metrics` table
- ✅ 3 Energy feeds healthy: EIA WTI, EIA Brent, EIA Diesel/WTI Crack Spread
- ✅ Feed health metrics: 0% error rate, P95 latency ~17s

### Evidence Safety (Fixed PR #86)
- ✅ Formatter blocks incomplete evidence (required endpoints must return HTTP 200)
- ✅ No longer claims READY when required endpoints fail
- ✅ Conservative reporting: any HTTP 503 or parse error marks evidence INCOMPLETE

### Vercel Preview Routing (Verified)
- ✅ Preview frontend routes to canonical preview Worker: `energy-dislocation-engine-preview-preview`
- ✅ Evidence recorded: `d874784` and PR #84 validation

---

## Immediate Blocker

### Preview Endpoint Reliability

**Affected Endpoints**:
1. `/health` — Intermittent HTTP 503 `DNS cache overflow`
2. `/api/admin/rollout-readiness` — Intermittent HTTP 503 `DNS cache overflow`
3. `/api/admin/rollout-status` — Intermittent HTTP 503 `DNS cache overflow`
4. `/api/admin/api-health` — HTTP 200 ✅ (operational)

**Impact**: Evidence report cannot be READY without stable HTTP 200 + valid JSON responses

**Required Before Canary**:
- All required endpoints must consistently return HTTP 200 with valid JSON
- Evidence capture tool must run and complete without endpoint failures
- No HTTP 503 or non-JSON responses during capture window

**See**: `docs/current-priorities.md` → "Immediate Blocker: Preview Endpoint Reliability"

---

## Deferred Items (Not Blocking Canary)

### Grafana Dashboard & Alerts
- **Status**: Deferred to post-canary stabilization (post-Day 26)
- **Reason**: Not required for 10% internal canary readiness
- **Timeline**: Implement before 50% public expansion (post-Day 26)
- **Documents**:
  - `docs/GRAFANA_SETUP_GUIDE.md`
  - `docs/grafana-api-health-dashboard.json`
  - `docs/grafana-api-health-alerts.md`

---

## Next Steps

### Step A (Immediate): Stabilise/Diagnose Preview Endpoint Reliability
- Investigate HTTP 503 `DNS cache overflow` root cause
- Determine if this is transient infrastructure issue or application problem
- Confirm that endpoints stabilize with HTTP 200 + valid JSON responses

### Step B: Rerun Evidence Capture
```bash
corepack pnpm phase6a:evidence -- \
  --base-url https://staging-worker.example.com \
  --out docs/evidence/phase6a-canary-readiness-YYYY-MM-DD.md
```
- Evidence report status must be READY or WARNING (not INCOMPLETE)
- Save report with date for ops records

### Step C: Rollback Rehearsal
- Test rollback procedure in staging environment
- Confirm ENERGY_ROLLOUT_PERCENT=0 fully reverts to snapshot serving

### Step D: Team Communication
- Notify team of readiness (once blocker resolved)
- Confirm schedule alignment (Days 22-26 for 10% canary)
- Distribute success criteria and monitoring checklist

### Step E: Accountable Owner Review
- Obtain explicit sign-off from accountable owner
- Record approval in deployment ticket

### Step F: 10% Canary Deployment
- Deploy with ENERGY_ROLLOUT_PERCENT=10
- Verify `GET /api/admin/rollout-status` returns phase="canary-internal"
- Begin 5-day monitoring period

---

## Quick Reference Commands

### Check Evidence Report Status
```bash
# Latest evidence status
cat docs/evidence/phase6a-staging-telemetry-verification.md | head -20

# Show current endpoint failures
grep -A 3 "Endpoint Collection Status" docs/evidence/phase6a-staging-telemetry-verification.md
```

### Rerun Evidence Capture
```bash
# Print report to stdout
corepack pnpm phase6a:evidence -- \
  --base-url https://staging-worker.example.com

# Save to file with timestamp
corepack pnpm phase6a:evidence -- \
  --base-url https://staging-worker.example.com \
  --out "docs/evidence/phase6a-canary-readiness-$(date +%Y-%m-%d).md"
```

### Check Worker Naming
```bash
# Verify canonical Worker names in wrangler.jsonc
grep -A 2 '"preview"' wrangler.jsonc | grep name
grep -A 2 '"production"' wrangler.jsonc | grep name
```

### Check Feed Health
```bash
# Check latest feed health from evidence
grep -A 5 "Feed Health Details" docs/evidence/phase6a-staging-telemetry-verification.md
```

---

## References

- **Current Priorities**: `docs/current-priorities.md`
- **Readiness Checklist**: `docs/phase-6a-rollout-readiness.md`
- **Evidence Capture Tool**: `docs/phase-6a-canary-evidence-capture.md`
- **Monitoring Strategy**: `docs/rollout-monitoring-strategy.md`
- **Rollback Procedures**: `docs/phase-6-rollback-procedures.md`
- **Architecture**: `docs/architecture.md`
- **Telemetry Setup**: `docs/TELEMETRY_SETUP_GUIDE.md`
- **Grafana Setup**: `docs/GRAFANA_SETUP_GUIDE.md` (deferred to post-canary)
