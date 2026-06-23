# Pre-Deploy Gates: Enforced Feature Flag Protection

This document describes the pre-deployment gate system that prevents accidental feature flag flips without proper sign-offs.

## Overview

The pre-deploy gate system ensures that critical feature flags (like `ENABLE_MACRO_SIGNALS`) can only be flipped after documented validation gates have passed and been signed off by responsible teams.

## Gate System Design

### How It Works

1. **Gate Definition**: Document which conditions must be met before a flag can change
2. **Gate Tracking**: `/api/admin/gate-status` endpoint reports current gate status
3. **Sign-Off**: Responsible teams sign off each gate via the endpoint
4. **Enforcement**: Feature flag flip blocked if any gate is not signed off
5. **Expiration**: Sign-offs expire after 30 days (gates must be re-validated)

### Gate Status Endpoint

```bash
GET /api/admin/gate-status?flagName=ENABLE_MACRO_SIGNALS
```

Returns:
```json
{
  "flagName": "ENABLE_MACRO_SIGNALS",
  "canFlip": false,
  "blockingReasons": [
    "Gate 'energy_determinism' not signed off",
    "Gate 'energy_data_freshness' expires in 3 days"
  ],
  "gates": {
    "energy_determinism": {
      "name": "Energy determinism test passes",
      "status": "SIGNED_OFF",
      "signedOffBy": "energy-team",
      "signedOffAt": "2026-05-01T14:30:00Z",
      "expiresAt": "2026-06-01T14:30:00Z",
      "lastCheck": {
        "timestamp": "2026-05-01T14:30:00Z",
        "passed": true,
        "message": "100 tests passed"
      }
    },
    "energy_data_freshness": {
      "name": "Energy data freshness < 5%",
      "status": "PENDING",
      "signedOffBy": null,
      "message": "Requires 7+ days of monitoring. Current: 3 days.",
      "estimatedReady": "2026-05-08T14:30:00Z"
    },
    ...
  }
}
```

### Sign-Off Endpoint

```bash
POST /api/admin/gate-sign-off
{
  "flagName": "ENABLE_MACRO_SIGNALS",
  "gateName": "energy_determinism",
  "signOffTeam": "energy-team",
  "notes": "Determinism test passed. 100 tests, 100% success rate."
}
```

Returns:
```json
{
  "success": true,
  "gate": {
    "name": "energy_determinism",
    "signedOffAt": "2026-05-01T14:30:00Z",
    "expiresAt": "2026-06-01T14:30:00Z"
  }
}
```

## Gates for ENABLE_MACRO_SIGNALS Flag

### Phase 6A Gates (Energy Engine)

| Gate | Owner | Description | Duration |
|------|-------|-------------|----------|
| `energy_determinism` | Energy team | Energy scorer produces identical output for identical inputs | Pre-deployment |
| `energy_data_freshness` | Data quality | Collector produces consistent data (variance < 5%) | 7+ days |
| `energy_rule_consistency` | Rules team | Rules adjust scores correctly and deterministically | Per rule change |
| `energy_guardrail_correctness` | Data quality | Guardrails correctly flag stale/missing data | Pre-deployment |
| `health_endpoint_schema` | Platform | Health endpoint schema backward compatible | Pre-deployment |
| `rollout_monitoring_ready` | Observability | Observability dashboard configured and alerting active | Before Week 1 canary |

### Phase 6B Gates (Macro Engine) — Future

| Gate | Owner | Description | Duration |
|------|-------|-------------|----------|
| `macro_determinism` | Macro team | Macro scorer produces identical output for identical inputs | Pre-deployment |
| `macro_data_freshness` | Data quality | 8-12 weeks of CPI data accumulated | After 8 weeks |
| `bls_api_error_handling` | Macro team | API failures handled gracefully (no cascading) | Pre-deployment |
| `multi_engine_coordination` | Platform | Energy and macro engines run without interference | Pre-deployment |
| `macro_dashboard_ready` | Observability | Dashboard displays macro-specific metrics | Before Week 1 canary |

## Authorization Matrix

| Role | Can Sign Off | Can Override | Can Flip Flag |
|------|-------------|------------|---------------|
| Engineer (owner team) | Own gates | No | No (needs 2nd approval) |
| Engineering Lead | Any gate | With justification | Only if all gates signed |
| Operations Lead | Operational gates | With incident report | Only if all gates signed |
| Platform Lead | Platform gates | With approval | Only if all gates signed |

## Sign-Off Checklist (Pre-Deployment)

Before flipping `ENABLE_MACRO_SIGNALS=true`:

```markdown
## Phase 6A Energy Engine Sign-Off

- [ ] **Energy Determinism** — Energy team
  - Determinism test passes (100%)
  - All 50 test cases pass
  - Signed: [name] on [date]

- [ ] **Energy Data Freshness** — Data quality
  - Collector variance < 5% over 7+ days
  - No data loss observed
  - Signed: [name] on [date]

- [ ] **Energy Rule Consistency** — Rules team
  - All energy rules applied correctly
  - Rule deltas match expected values
  - Signed: [name] on [date]

- [ ] **Energy Guardrail Correctness** — Data quality
  - Guardrails correctly flag stale/missing data
  - 100% of test cases pass
  - Signed: [name] on [date]

- [ ] **Health Endpoint Schema** — Platform
  - Schema backward compatible
  - runtimeMode and degradedComponents fields present
  - Tests pass
  - Signed: [name] on [date]

- [ ] **Rollout Monitoring Ready** — Observability
  - Grafana dashboard configured
  - Alerts set up for error rates, latency, divergence
  - Team trained on monitoring
  - Signed: [name] on [date]

## Production Rollout Authorization

- [ ] **Engineering Lead** — All technical gates passing
  - Signed: [name] on [date]

- [ ] **Operations Lead** — Operational readiness confirmed
  - Runbooks reviewed and tested
  - On-call team briefed
  - Rollback procedure validated
  - Signed: [name] on [date]

- [ ] **Product Lead** — Business readiness
  - Stakeholders notified
  - Communication plan ready
  - Signed: [name] on [date]

**Approved for Production**: [date] [time]
**Approved by**: [engineering lead], [ops lead], [product lead]
```

## Gate Expiration and Re-Validation

Gates expire after 30 days. To re-validate:

```bash
POST /api/admin/gate-sign-off
{
  "flagName": "ENABLE_MACRO_SIGNALS",
  "gateName": "energy_determinism",
  "signOffTeam": "energy-team",
  "notes": "Re-validation: Determinism test passed (100/100). No code changes since 2026-05-01."
}
```

If a gate expires and no revalidation has occurred:
```json
{
  "canFlip": false,
  "blockingReasons": [
    "Gate 'energy_determinism' expired on 2026-06-01. Requires re-validation."
  ]
}
```

## Override Procedure (Emergency Only)

In an emergency, gates can be overridden by two senior engineers with incident justification:

```bash
POST /api/admin/gate-override
{
  "flagName": "ENABLE_MACRO_SIGNALS",
  "override": true,
  "reason": "INCIDENT: Production energy engine down, need rollback to snapshots",
  "approvers": ["senior-eng-1", "senior-eng-2"],
  "willRevalidate": "2026-05-08T14:30:00Z"
}
```

**Log entry**:
```
[2026-05-02 14:30:00] GATE OVERRIDE: ENABLE_MACRO_SIGNALS by [users]
Reason: Production incident
Revalidation deadline: 2026-05-08
Incident ticket: INCIDENT-123
```

After override, all gates must be re-validated before the next production change.

## Implementation Details

### Database Schema
```sql
CREATE TABLE IF NOT EXISTS pre_deploy_gates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flag_name TEXT NOT NULL,
  gate_name TEXT NOT NULL,
  status TEXT NOT NULL,  -- PENDING, SIGNED_OFF, EXPIRED
  signed_off_by TEXT,
  signed_off_at TEXT,
  expires_at TEXT,
  notes TEXT,
  last_validated_at TEXT,
  validation_result TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(flag_name, gate_name)
);

CREATE TABLE IF NOT EXISTS gate_sign_off_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  flag_name TEXT NOT NULL,
  gate_name TEXT NOT NULL,
  signed_off_by TEXT NOT NULL,
  signed_off_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
```

### API Implementation
- `/api/admin/gate-status` — GET gate status for a flag
- `/api/admin/gate-sign-off` — POST to sign off a gate
- `/api/admin/gate-override` — POST to override in emergency
- `/api/admin/gate-history` — GET historical sign-offs

### Feature Flag Check
```typescript
export async function canFlipFlag(env: Env, flagName: string): Promise<{
  canFlip: boolean;
  blockingReasons: string[];
}> {
  const gates = await getGateStatus(env, flagName);
  const unsignedGates = gates.filter(g => g.status !== "SIGNED_OFF");
  return {
    canFlip: unsignedGates.length === 0,
    blockingReasons: unsignedGates.map(g => `Gate '${g.name}' not signed off`)
  };
}
```

## References

- `/docs/phase-6a-energy.md` — Energy engine validation gates
- `/docs/phase-6b-macro-releases.md` — Macro engine validation gates
- `PRE_DEPLOY_CHECKLIST.md` — Sign-off tracking document
