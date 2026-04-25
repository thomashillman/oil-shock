# Phase 6A Canary Evidence Capture

**Purpose**: Collect read-only evidence before moving Energy rollout from 0% to 10% canary.

**Tool location**: `scripts/phase6a/capture-canary-evidence.ts`  
**Report formatter**: `scripts/phase6a/evidence-report.ts`  
**Timeline**: Run before Day 22 Phase 1 canary execution

---

## What This Does

This tool is a **read-only evidence collector** that:
- ✅ Fetches existing readiness, rollout, health, and API health endpoint outputs
- ✅ Renders a Markdown evidence report for operators
- ✅ Helps verify all prerequisites before canary start
- ✅ No network calls in tests (safe for CI/CD)

This tool does **NOT**:
- ❌ Deploy code
- ❌ Change `ENERGY_ROLLOUT_PERCENT`
- ❌ Sign or modify pre-deploy gates
- ❌ Alter D1 or any database
- ❌ Make external API calls beyond worker endpoints
- ❌ Claim manual verification is complete

---

## Installation

No separate installation needed. The tool uses Node.js `fetch` (available in Node 18+) and TypeScript standard library.

```bash
# If running locally with tsx:
corepack pnpm install
```

---

## Usage

### Basic: Print report to stdout (recommended)

```bash
corepack pnpm phase6a:evidence \
  --base-url https://staging-worker.example.com
```

Output is printed directly to the terminal.

### With authentication token

```bash
# Option 1: Token as env var
ADMIN_TOKEN=your-bearer-token \
  corepack pnpm phase6a:evidence \
  --base-url https://staging-worker.example.com

# Option 2: Alternative env var
ADMIN_API_BEARER_TOKEN=your-bearer-token \
  corepack pnpm phase6a:evidence \
  --base-url https://staging-worker.example.com

# Option 3: Use PHASE6A_BASE_URL env var
PHASE6A_BASE_URL=https://staging-worker.example.com \
ADMIN_TOKEN=your-bearer-token \
  corepack pnpm phase6a:evidence
```

### Save report to file

```bash
corepack pnpm phase6a:evidence \
  --base-url https://staging-worker.example.com \
  --out docs/evidence/phase6a-canary-readiness-2026-04-25.md
```

Report is written to the specified file. Parent directories are created if needed.

### Using tsx for TypeScript execution (alternative)

```bash
corepack pnpm exec tsx scripts/phase6a/capture-canary-evidence.ts \
  --base-url https://staging-worker.example.com \
  --out evidence-report.md
```

**Note**: The package script (`corepack pnpm phase6a:evidence`) is the preferred operator path.

---

## Read-Only Endpoints Called

The tool makes GET requests only to these endpoints:

### 1. `/health`
**Purpose**: Service health and runtime mode  
**Headers**: Optional Bearer token  
**Checks**: Database connectivity, config availability, runtimeMode

### 2. `/api/admin/rollout-readiness`
**Purpose**: Comprehensive readiness assessment  
**Headers**: Required Bearer token (admin)  
**Returns**: Status (ready/warning/blocked), blockers, warnings, manual checks, evidence

### 3. `/api/admin/rollout-status`
**Purpose**: Current rollout phase and percentage  
**Headers**: Optional Bearer token  
**Checks**: Rollout percent (should be 0 before canary), phase (should be pre-rollout)

### 4. `/api/admin/api-health`
**Purpose**: Per-feed health metrics  
**Headers**: Optional Bearer token  
**Checks**: EIA WTI, Brent, and Diesel/WTI Crack Spread feed health

**None of these endpoints modify state or configuration.**

---

## Report Interpretation

### Status: ✅ READY

```
✅ **Ready for 10% canary, subject to manual sign-off**

All automatic checks pass. Proceed only if:
1. All manual checks (below) are signed off
2. Team is notified and synchronized
3. You have verified rollback procedures work
```

**Action**: Proceed to manual sign-off and deployment.

### Status: ⚠️ WARNING

```
⚠️ **Proceed only with explicit sign-off**

Some concerns exist but may be acceptable. Team lead must explicitly approve in writing before proceeding.
```

**Action**: Review warnings. Obtain written sign-off from team lead before proceeding.

### Status: ❌ BLOCKED

```
❌ **DO NOT PROCEED TO 10% CANARY**

Critical blockers must be resolved before rollout can proceed.
```

**Action**: Resolve all blockers listed in the report, then re-run the evidence capture tool.

---

## Manual Verification Checklist

The report includes these manual checks that require operator sign-off:

### Tier 1: Telemetry Setup (PREREQUISITE)
- [ ] Energy collector is wired to use `instrumentedFetch()`
- [ ] Metrics are being recorded to `api_health_metrics` table
- [ ] `/api/admin/api-health` returns data
- [ ] Metrics are flowing in staging environment

### Tier 2: Grafana Monitoring Setup
- [ ] Grafana dashboard from `docs/grafana-api-health-dashboard.json` is imported
- [ ] 5 alert rules from `docs/grafana-api-health-alerts.md` are configured
- [ ] Alerts route to correct channels (Slack, PagerDuty)

### Tier 3: Team Communication & Procedures
- [ ] Rollout schedule announced
- [ ] Success criteria shared with team
- [ ] Incident response runbook available

### Tier 4: Rollback Rehearsal
- [ ] Rollback procedure tested in staging
- [ ] All checks pass after rollback

**Reference**: `docs/phase-6a-rollout-readiness.md` for complete tier details.

---

## Workflow: Before Day 22 Canary

```
1. Run telemetry setup (Tier 1)
   └─ Ensure collector metrics are flowing
   
2. Configure Grafana monitoring (Tier 2)
   └─ Dashboard and alerts must be operational
   
3. Run this evidence capture tool
   node scripts/phase6a/capture-canary-evidence.ts \
     --base-url https://staging-worker.example.com \
     --out docs/evidence/phase6a-canary-readiness.md
   
4. Review the generated report
   └─ Check status (ready/warning/blocked)
   └─ Address any warnings or blockers
   
5. Obtain manual sign-offs (Tier 3-4)
   └─ Team communication checklist
   └─ Rollback rehearsal validation
   
6. Store evidence report
   └─ Save as ops record (e.g., docs/evidence/phase6a-canary-readiness-DATE.md)
   └─ Attach to incident ticket or deployment record
   
7. Deploy with ENERGY_ROLLOUT_PERCENT=10
   └─ This is a separate manual step (code change + deploy)
   
8. Verify rollout-status endpoint
   curl https://production-worker.example.com/api/admin/rollout-status
   └─ Should return phase="canary-internal", rolloutPercent=10
   
9. Begin monitoring per docs/rollout-monitoring-strategy.md
   └─ Daily checklist for Days 22-26
```

---

## Troubleshooting

### "base-url required" error

Set the worker URL either via `--base-url` or environment variable:

```bash
# Option 1
node scripts/phase6a/capture-canary-evidence.ts --base-url https://worker.example.com

# Option 2
PHASE6A_BASE_URL=https://worker.example.com node scripts/phase6a/capture-canary-evidence.ts
```

### "Endpoint unreachable" warnings

If endpoints fail to respond:
- Verify the base URL is correct
- Check network connectivity (firewalls, VPN)
- Verify bearer token is valid (if required)
- Run on a machine with access to the worker (may need staging environment)

The report will still be generated with partial data marked as incomplete.

### Missing authorization headers

If you see 401/403 responses:
- Set `ADMIN_TOKEN` or `ADMIN_API_BEARER_TOKEN` environment variable
- Ensure the token has admin permissions
- Token format should be just the token value (not `Bearer` prefix)

### Report says "INCOMPLETE EVIDENCE COLLECTION"

Some endpoints failed to respond. Check:
1. Worker is accessible from your location
2. Bearer token is valid
3. Worker `/health` endpoint is healthy
4. Try again or collect evidence from a location with network access

---

## Important Reminders

**This tool does NOT**:
- ✅ Deploy anything
- ✅ Change `ENERGY_ROLLOUT_PERCENT`
- ✅ Sign any gates
- ✅ Modify configuration
- ✅ Call write-enabled endpoints
- ✅ Claim live verification is complete

**Manual verification still required for**:
- Grafana dashboard import and alert routing
- Staging telemetry validation
- Team communication and schedule
- Rollback rehearsal
- Production deployment timing and coordination

---

## References

- **Readiness checklist**: `docs/phase-6a-rollout-readiness.md`
- **Monitoring strategy**: `docs/rollout-monitoring-strategy.md`
- **Rollback procedures**: `docs/phase-6-rollback-procedures.md`
- **Telemetry setup**: `docs/TELEMETRY_SETUP_GUIDE.md`
- **Grafana setup**: `docs/GRAFANA_SETUP_GUIDE.md`
- **Current priorities**: `docs/current-priorities.md`

---

## Questions?

Refer to:
- The generated report's "References" section
- `docs/phase-6a-rollout-readiness.md` for detailed requirements
- `docs/rollout-monitoring-strategy.md` for monitoring procedures
