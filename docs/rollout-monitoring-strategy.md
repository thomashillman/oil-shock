# Phase 6A Rollout Monitoring Strategy

**Timeline**: Days 22-52 (4 weeks)  
**Owner**: Operations + Observability team  
**Channels**: Alerts to #eng-alerts, dashboards in Grafana, daily reports to eng lead

---

## Monitoring Architecture

### Key Metrics by Component

#### Collector (EIA data pipeline)
- **Error rate**: % of collection runs failing (target: < 1%)
- **Latency**: P95, P99 duration of collection operation (target: < 2s)
- **Data freshness**: Days since last successful data point per feed
- **Feed availability**: % of required feeds producing data (target: 100%)

#### Scorer (Energy engine)
- **Error rate**: % of scoring runs failing (target: < 0.5%)
- **Latency**: P95, P99 duration of scoring operation (target: < 100ms)
- **Flag frequency**: % of scores with guardrail flags (target: < 5%)
- **Confidence distribution**: Histogram of confidence scores

#### Guardrails
- **Stale flag rate**: % of scores flagged as stale data (target: < 2%)
- **Missing flag rate**: % of scores flagged as missing feed (target: < 2%)
- **Degraded flag rate**: % of scores flagged as degraded collector (target: 0% before Day 22)

#### Service Health
- **Database latency**: P95, P99 query time (target: < 50ms)
- **Health endpoint response**: % returning 200 vs 503 (target: 100% at 200)
- **Config availability**: rows in config_thresholds table (target: > 0)

### Rollout Status Endpoint Queries

```bash
# Current rollout status
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://worker.example.com/api/admin/rollout-status

# Validation gate status
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://worker.example.com/api/admin/validation-status

# Scoring latency check
curl -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://worker.example.com/api/admin/gate-status?flagName=ENABLE_MACRO_SIGNALS
```

---

## Phase 1: Internal Canary (Days 22-26)

**Setting**: `ENERGY_ROLLOUT_PERCENT = 10`  
**Traffic**: Internal IPs only (dev, staging, QA)  
**Duration**: 5 days  
**Objective**: Verify basic functionality, catch configuration errors early

### Daily Checklist

**Day 22 (Monday) - Deployment**
- [ ] Set ENERGY_ROLLOUT_PERCENT = 10, deploy
- [ ] Verify /api/admin/rollout-status returns phase="canary-internal"
- [ ] Confirm health endpoint includes runtimeMode="macro-signals"
- [ ] Verify database has pre_deploy_gates table with 6 seeded gates
- [ ] Check logs for collector/scorer startup messages

**Days 23-26 (Tue-Fri) - Monitoring**
- [ ] **Hourly**: Check collector error rate (expect 0, alert if > 1%)
- [ ] **Hourly**: Check scorer error rate (expect 0, alert if > 0.5%)
- [ ] **Daily**: Review guardrail flag frequency (expect < 5%)
- [ ] **Daily**: Verify no degradation flags yet (expect 0 at 10%)
- [ ] **Daily**: Check database latency P95 (alert if > 100ms)
- [ ] **Daily**: Confirm 6 pre-deploy gates still seeded, status PENDING

### Canary Success Criteria

✓ **No collector errors** in 10% traffic  
✓ **No scorer errors** in 10% traffic  
✓ **Guardrail flags < 5%** of scores  
✓ **Database latency P95 < 50ms**  
✓ **Health endpoint always 200**, never 503  
✓ **Config thresholds available** (gate check passes)

### Canary Rollback Triggers

⚠ **Auto-rollback** if any of:
- Collector error rate > 5% for 30 minutes
- Scorer error rate > 2% for 30 minutes
- Database latency P95 > 200ms for 10 minutes
- Health endpoint returns 503 for > 10% of requests

---

## Phase 2: Public Expansion (Days 27-35)

**Setting**: `ENERGY_ROLLOUT_PERCENT = 50`  
**Traffic**: 50% of all requests (random split, logged per request)  
**Duration**: 9 days  
**Objective**: Validate stability under production load, compare oil_shock vs energy scores

### Daily Checklist

**Day 27 (Monday) - Expansion**
- [ ] Set ENERGY_ROLLOUT_PERCENT = 50, deploy
- [ ] Verify /api/admin/rollout-status returns phase="public-expansion", percent=50
- [ ] Confirm logs show 50/50 split starting (tag each request with engine)
- [ ] Check for request routing errors (should be 0)

**Days 28-35 (Tue-Fri+Mon-Wed) - Monitoring**
- [ ] **Every 2 hours**: Compare error rates oil_shock vs energy (expect similar ± 0.5%)
- [ ] **Daily**: Compare guardrail flag frequency oil_shock vs energy (expect similar ± 1%)
- [ ] **Daily**: Check score distribution (histogram: p50, p95, p99)
- [ ] **Daily**: Verify degradation flags remain < 1% (collector health maintained)
- [ ] **Daily**: Ensure no divergence spikes (> 0.1 score delta per percentile)
- [ ] **Daily**: Check for user-reported issues (email to eng lead)

### Expansion Success Criteria

✓ **Error rates stable**: collector/scorer errors unchanged from canary  
✓ **Score distributions match**: p50/p95/p99 within 2% between engines  
✓ **Flag frequencies stable**: guardrail flags unchanged from canary  
✓ **No user impact**: zero complaints, latency unchanged  
✓ **Degradation < 1%**: Collector health maintained  
✓ **Database performance stable**: P95 latency < 100ms

### Expansion Rollback Triggers

⚠ **Immediate rollback** if:
- Error rate divergence > 2% (oil_shock vs energy)
- Score distribution divergence > 5% (any percentile)
- Guardrail flag divergence > 3%
- User-reported issues affecting decisions

---

## Phase 3: Full Rollout (Days 36-42)

**Setting**: `ENERGY_ROLLOUT_PERCENT = 100`  
**Traffic**: 100% of requests  
**Duration**: 7 days  
**Objective**: Validate full production stability, finalize snapshot deprecation date

### Daily Checklist

**Day 36 (Thursday) - Full Rollout**
- [ ] Set ENERGY_ROLLOUT_PERCENT = 100, deploy
- [ ] Verify /api/admin/rollout-status returns phase="full-rollout", percent=100
- [ ] Confirm 100% energy scoring in logs (no oil_shock fallback)
- [ ] Verify all 6 gates have passed or been re-signed (30-day window)

**Days 37-42 (Fri + Mon-Wed) - Monitoring**
- [ ] **Every hour**: Verify energy scoring active for all traffic
- [ ] **Daily**: Check all-gates-passing status (gate-status endpoint)
- [ ] **Daily**: Monitor guardrail flag trends (should be stable from Phase 2)
- [ ] **Daily**: Review error rates (should be stable)
- [ ] **Daily**: Check for any regressions vs Phase 2 (none expected)
- [ ] **EOD Day 41**: Snapshot deprecation decision (commit to timeline)

### Full Rollout Success Criteria

✓ **All traffic on energy**: 100% of requests using energy scoring  
✓ **All gates passing or re-signed**: No blockers on ENABLE_MACRO_SIGNALS flip  
✓ **Error rates stable**: No increase from Phase 2  
✓ **Guardrail flags stable**: No increase from Phase 2  
✓ **Database performance stable**: P95 latency < 100ms  
✓ **No user impact**: Zero complaints for 7 days

---

## Phase 4: Stabilization (Days 43-52)

**Setting**: `ENERGY_ROLLOUT_PERCENT = 100` (persistent)  
**Traffic**: 100% of requests  
**Duration**: 10 days  
**Objective**: Long-term stability verification, deprecation timeline, Phase 6B prep

### Daily Checklist

**Days 43-52 (Ongoing)**
- [ ] **Twice daily**: Spot-check error rates (expect < 0.5% collector, < 0.2% scorer)
- [ ] **Weekly**: Review guardrail flag trends (expect stable < 5%)
- [ ] **Weekly**: Database performance review (expect P95 < 100ms)
- [ ] **EOW**: Share metrics summary with eng lead
- [ ] **Day 47 (Friday)**: Finalize snapshot deprecation timeline (commit in CLAUDE.md)
- [ ] **Day 50 (Monday)**: Begin Phase 6B planning (CPI data, macro engine)
- [ ] **Day 52 (Wednesday)**: Write lessons learned doc

### Stabilization Success Criteria

✓ **10+ days without incidents**: No errors, no rollbacks  
✓ **All metrics green**: < 1% error, < 5% guardrails, < 100ms latency  
✓ **Snapshot deprecation date set**: Clear timeline in docs  
✓ **Phase 6B planning underway**: CPI validation tests drafted

---

## Alert Configuration

### Critical Alerts (Page on-call)

```
# Collector error rate > 5% for 10 minutes
alert: CollectorErrorRateCritical
threshold: 5%
window: 10m
action: Page + auto-rollback to ENERGY_ROLLOUT_PERCENT=0

# Scorer error rate > 2% for 10 minutes
alert: ScorerErrorRateCritical
threshold: 2%
window: 10m
action: Page + auto-rollback to ENERGY_ROLLOUT_PERCENT=0

# Database latency P95 > 200ms for 5 minutes
alert: DatabaseLatencyCritical
threshold: 200ms
window: 5m
action: Page + investigate D1 cluster
```

### Warning Alerts (Slack #eng-alerts)

```
# Collector error rate > 1% for 5 minutes
alert: CollectorErrorRateWarning
threshold: 1%
window: 5m
action: Slack notification

# Guardrail flag frequency > 10% (unexpected spike)
alert: GuardrailFlagSpike
threshold: 10%
window: 1h
action: Slack notification

# Health endpoint returning 503 > 5% of requests
alert: HealthEndpointDegraded
threshold: 5%
window: 5m
action: Slack notification
```

---

## Grafana Dashboard Queries

```sql
-- Collector error rate by phase
SELECT phase, COUNT(CASE WHEN error THEN 1 END) * 100.0 / COUNT(*) as error_pct
FROM collector_runs
GROUP BY phase

-- Scorer error rate by phase
SELECT phase, COUNT(CASE WHEN error THEN 1 END) * 100.0 / COUNT(*) as error_pct
FROM scorer_runs
GROUP BY phase

-- Guardrail flag frequency by phase
SELECT phase, COUNT(CASE WHEN flags LIKE '%missing%' OR flags LIKE '%stale%' THEN 1 END) * 100.0 / COUNT(*) as flag_pct
FROM scores
GROUP BY phase

-- Database latency P95
SELECT phase, percentile_cont(0.95) within group (order by latency_ms) as p95
FROM db_queries
GROUP BY phase
```

---

## Rollback Procedure

### Automatic Rollback

If critical alerts fire, automated rollback to `ENERGY_ROLLOUT_PERCENT = 0`:

1. Monitoring detects threshold breach
2. Lambda function sets env var to 0
3. Worker deployments reflect change within 30s
4. Slack alert sent to #incidents
5. Incident commander notified

### Manual Rollback

```bash
# Set rollout to 0% (emergency only)
gcloud functions deploy set-energy-rollout --env-vars ENERGY_ROLLOUT_PERCENT=0

# Verify rollout status
curl -H "Authorization: Bearer $TOKEN" \
  https://worker.example.com/api/admin/rollout-status

# Expected response: phase="pre-rollout", percent=0
```

---

## Success Metrics Summary

| Phase | Duration | Key Metric | Target | Pass/Fail |
|-------|----------|-----------|--------|-----------|
| Canary | 5 days | Collector errors | < 1% | ✓ |
| Canary | 5 days | Scorer errors | < 0.5% | ✓ |
| Expansion | 9 days | Error stability | < 0.5% divergence | ✓ |
| Expansion | 9 days | Score match | p95 within 2% | ✓ |
| Full | 7 days | 100% traffic | on energy | ✓ |
| Full | 7 days | All gates pass | 6/6 signed off | ✓ |
| Stabilization | 10 days | No incidents | 10+ days clean | ✓ |

---

## References

- `docs/phase-6a-energy.md` — Full Phase 6A plan
- `docs/pre-deploy-gates.md` — Gate system and authorization
- `/api/admin/rollout-status` — Current rollout status
- `/api/admin/validation-status` — Validation gate results
- `/health` — Service health with degradedComponents tracking
