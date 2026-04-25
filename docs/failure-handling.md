# Failure Handling: Graceful Degradation per Component

This document specifies how each component fails gracefully without cascading failures to the entire system.

## Design Principle

**Single engine failure should not take down the entire system.** Each component (collector, scorer, API, database) has a defined fallback behavior.

---

## Component Failures and Recovery

### Scenario 1: Energy Collector Fails

**When**: `collectEnergy()` throws error or times out

**Handling**:
```
Log error with context (API down, auth failure, timeout)
↓
Skip writing series_points for this run
↓
Continue to scoring phase
↓
Energy scorer runs with STALE data from previous run
↓
Add flag: ["stale_energy_data"]
↓
Score emitted with low confidence (0.5)
↓
/api/health reports: degradedComponents: ["energy_collector"]
```

**Example response**:
```json
{
  "engineKey": "energy",
  "feedKey": "energy.state",
  "scoreValue": 0.48,
  "confidence": 0.5,
  "flags": {
    "stale_energy_data": true,
    "ageHours": 24,
    "rationale": "EIA API timeout, using previous day's data"
  }
}
```

**Recovery**:
- Next run: Try collecting again
- If 3+ consecutive failures: Alert operations
- If 24+ hours stale: Downgrade confidence further (0.3)

**Code pattern**:
```typescript
async function runCollection(env: Env, nowIso: string) {
  try {
    const energyPoints = await collectEnergy(env);
    await writeSeriesPoints(env, energyPoints);
  } catch (error) {
    logger.error("Energy collection failed", { error });
    // Don't rethrow; continue to scoring
    // Scorer will detect missing recent data and add stale flag
  }
}
```

---

### Scenario 2: Energy Scorer Fails

**When**: `runEnergyScore()` throws error or rule evaluation fails

**Handling**:
```
Log error with context (rule syntax error, DB error, etc.)
↓
Do NOT write score row
↓
Do NOT crash the job
↓
Continue to any remaining engines
↓
/api/health reports: degradedComponents: ["energy_scorer"]
↓
/api/state (if energy default) returns:
   - Most recent successful score + degradation flag
   - OR fallback to archived Oil Shock snapshot
```

**Example response**:
```json
{
  "engineKey": "energy",
  "feedKey": "energy.state",
  "scoreValue": 0.48,  // Last known good
  "confidence": 0.3,    // Degraded
  "flags": {
    "score_compute_failure": true,
    "failureReason": "Rule evaluation error in energy.confirmation.rule_xyz",
    "lastSuccessfulScore": "2026-05-01T14:00:00Z",
    "ageHours": 2,
    "fallbackNote": "Serving archived snapshot due to scorer failure"
  }
}
```

**Recovery**:
- Fix rule syntax or code
- Rerun scorer on next pipeline execution
- If recurring: Page on-call engineer

**Code pattern**:
```typescript
async function runEnergyScore(env: Env, nowIso: string) {
  try {
    const score = await scoreEnergyEngine(env, nowIso);
    await writeScore(env, score);
  } catch (error) {
    logger.error("Energy scoring failed", { error, engineKey: "energy" });
    // Record component failure but don't crash entire job
    trackComponentFailure(env, "energy_scorer", error);
    // Continue to any remaining engines
  }
}
```

---

### Scenario 3: D1 Database Unavailable

**When**: D1 returns connection error, 503, or timeout

**Handling**:
```
All runs fail immediately
↓
/api/health returns 503 Service Unavailable
↓
API returns graceful error:
   "service": "database_unavailable",
   "message": "Scoring data unavailable; try again in 5 minutes"
↓
Alert operations team
```

**Example response**:
```json
{
  "error": "database_unavailable",
  "service": "oil-shock-worker",
  "message": "Could not connect to D1 database",
  "statusCode": 503,
  "retryAfter": 300
}
```

**Recovery**:
- Database team investigates and restores connection
- Clients retry with exponential backoff
- No data loss (queries not partially executed)

**Code pattern**:
```typescript
async function getLatestScore(env: Env) {
  try {
    return await env.DB.prepare("SELECT ... FROM scores ...").first();
  } catch (error) {
    if (error.message.includes("database") || error.status === 503) {
      // Database is down, fail fast
      return { error: "database_unavailable" };
    }
    throw error;
  }
}
```

---

### Scenario 4: BLS API Unavailable (Phase 6B)

**When**: BLS API returns error or times out (future)

**Handling**:

**Transient errors (429 rate limit, 503 unavailable, timeout)**:
```
Log as warning
↓
Skip writing macro data
↓
Do NOT fail entire pipeline
↓
Continue to scoring with missing macro data
↓
Macro scorer adds flag: ["transient_bls_failure"]
↓
Retry on next run (1 hour later)
```

**Permanent errors (401 auth, 403 forbidden, 404 not found)**:
```
Log error
↓
Alert operations (API credentials or endpoint changed)
↓
Skip writing macro data
↓
Continue to scoring
↓
Macro scorer adds flag: ["bls_api_error"]
```

**Example scoring response with missing macro data**:
```json
{
  "engineKey": "macro_releases",
  "feedKey": "macro_release.us_cpi_surprise",
  "scoreValue": 0,
  "confidence": 0.4,
  "flags": {
    "missing_macro_data": true,
    "reason": "BLS API unavailable: HTTP 503",
    "nextRetry": "2026-05-02T15:00:00Z"
  }
}
```

**Recovery**:
- **Transient**: Automatic retry on next collection run
- **Permanent**: Operations fixes API credentials or configuration

**Code pattern**:
```typescript
async function collectMacroReleases(env: Env) {
  try {
    const cpiData = await fetchFromBLS(env);
    return [{ seriesKey: "macro_release.us_cpi_surprise", value: cpiData }];
  } catch (error) {
    if (error.status === 429 || error.status === 503 || error.timeout) {
      logger.warn("BLS API transient error, will retry next run", { error });
      return [];  // Skip this run, try again later
    } else {
      logger.error("BLS API permanent error, investigate credentials", { error });
      // Still skip this run, but alert team
      trackComponentFailure(env, "bls_api", error);
      return [];
    }
  }
}
```

---

## Health Endpoint Degradation

The `/health` endpoint reports per-component health:

```bash
GET /health
```

**Normal state**:
```json
{
  "ok": true,
  "status": "healthy",
  "degradedComponents": [],
  "dependencies": {
    "database": { "ok": true, "latency_ms": 5 },
    "energy_collector": { "ok": true, "lastRun": "2026-05-01T14:30:00Z" },
    "energy_scorer": { "ok": true, "lastRun": "2026-05-01T14:30:00Z" },
    "bls_api": { "ok": true, "lastRun": null }  // Not yet implemented
  }
}
```

**Degraded state** (energy collector failed):
```json
{
  "ok": true,
  "status": "degraded",
  "degradedComponents": ["energy_collector"],
  "dependencies": {
    "database": { "ok": true, "latency_ms": 5 },
    "energy_collector": { 
      "ok": false, 
      "lastError": "EIA API timeout",
      "failureCount": 2,
      "lastFailureAt": "2026-05-01T14:30:00Z"
    },
    "energy_scorer": { "ok": true, "lastRun": "2026-05-01T14:00:00Z" }
  }
}
```

**Unavailable state** (database down):
```json
{
  "ok": false,
  "status": "unavailable",
  "statusCode": 503,
  "degradedComponents": ["database"],
  "message": "Database unavailable; check D1 status"
}
```

**Client interpretation**:
- `ok=true, degraded`: Continue using the system; some features downgraded
- `ok=false`: Stop retrying; wait and try again later

---

## Observability

### Metrics to Track Per Component

| Component | Metric | Alert Threshold | Action |
|-----------|--------|-----------------|--------|
| Energy Collector | Error rate | > 1% per hour | Page on-call after 3 consecutive failures |
| Energy Scorer | Execution time | > 200ms | Investigate rule complexity |
| Energy Scorer | Failure rate | > 2% per hour | Page on-call; investigate rules/logic |
| Stale data flags | Frequency | > 10% of runs | Investigate collector; check API |
| Missing data flags | Frequency | > 5% of runs | Check feed sources; alert team |
| BLS API (future) | Error rate | > 5% per day | Alert operations; check credentials |

### Logging Pattern

```typescript
logger.error("Component failure", {
  component: "energy_collector",
  engineKey: "energy",
  errorType: "TIMEOUT",
  errorMessage: "EIA API request timed out after 30s",
  consecutiveFailures: 2,
  lastSuccessAt: "2026-05-01T14:00:00Z",
  timestamp: nowIso
});

// Later, when recovered:
logger.info("Component recovered", {
  component: "energy_collector",
  engineKey: "energy",
  downtime_minutes: 30,
  timestamp: nowIso
});
```

---

## Testing Failure Scenarios

Each failure scenario should have integration tests:

### Test: Energy Collector Failure
```typescript
test("scoring continues with stale data if collector fails", async () => {
  mockEiaApi.simulateTimeout();
  await runCollection(env, nowIso);
  
  // Collector failed, but scoring should continue
  const score = await runEnergyScore(env, nowIso);
  
  expect(score.flags).toContain({ stale_energy_data: true });
  expect(score.confidence).toBe(0.5);
  expect(health.degradedComponents).toContain("energy_collector");
});
```

### Test: Energy Scorer Failure
```typescript
test("score job continues if scorer fails", async () => {
  mockRuleEngine.simulateError("Rule syntax error");
  
  await runScore(env, nowIso);
  
  // Should not crash; should continue to next component
  expect(await getLatestScore(env, "energy")).toBeDefined();
  expect(health.degradedComponents).toContain("energy_scorer");
});
```

### Test: Database Failure
```typescript
test("health returns 503 if database unavailable", async () => {
  mockD1.simulateUnavailable();
  
  const response = await handleHealth(env);
  
  expect(response.status).toBe(503);
  expect(response.ok).toBe(false);
  expect(response.degradedComponents).toContain("database");
});
```

---

## Fallback Priority

When determining what to serve to clients:

1. **Best case**: Fresh score from active engine (confidence > 0.7)
2. **Degraded**: Score with flags (confidence 0.3-0.7)
3. **Fallback**: Archived snapshot (confidence 0.2, with degradation warning)
4. **Unavailable**: 503 error with retry guidance

**Code decision tree**:
```typescript
if (energyScore && energyScore.confidence > 0.7) {
  return energyScore;  // Fresh, trusted
} else if (energyScore && energyScore.confidence > 0.3) {
  return energyScore;  // Degraded but usable
} else if (archivedSnapshot) {
  return archivedSnapshot + degradationWarning;  // Fallback
} else {
  return 503 unavailable;  // No data available
}
```

---

## Summary

**Principle**: No single component failure brings down the entire system.

**Strategy**: 
- Collectors: Graceful skip; scoring continues with stale data
- Scorers: Graceful skip; return last-known-good score with flag
- Database: Fail fast; return 503; let clients retry
- External APIs (BLS): Transient retry; permanent alert

**Result**: System remains operational even during component failures.

---

## References

- `/docs/phase-6a-energy.md` — Energy engine implementation
- `/docs/phase-6b-macro-releases.md` — Macro engine (with BLS API)
- `/docs/energy-rollout-strategy.md` — Rollout phases and monitoring
