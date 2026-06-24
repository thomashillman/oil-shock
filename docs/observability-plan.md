# Observability Implementation Plan (Week 1-2): Grafana Cloud Integration

## Objective
Enable production visibility for Oil Shock Worker using Grafana Cloud free hobby account. Export OpenTelemetry traces and structured logs from Cloudflare Workers to Grafana Cloud, with request correlation and enhanced health checks.

## Prerequisites
- Grafana Cloud free hobby account (provided by user)
- Extract OTLP endpoint and API key from Grafana Cloud UI
- Add `GRAFANA_OTLP_ENDPOINT` and `GRAFANA_OTLP_API_KEY` to `wrangler.jsonc` env vars

## Implementation Steps

### Phase 1: Environment Configuration (Day 1)

**Files to modify:**
- `worker/src/env.ts` - Add Grafana OTLP credentials
- `wrangler.jsonc` - Add env vars and Grafana binding config

**Tasks:**
1. Add `GRAFANA_OTLP_ENDPOINT` and `GRAFANA_OTLP_API_KEY` to Env interface
2. Document how to obtain OTLP credentials from Grafana Cloud UI (Settings → API tokens → OTLP)
3. Add env vars to `wrangler.jsonc` for local, preview, production with example values
4. Create `.env.example` snippet for setup instructions

### Phase 2: Request Correlation & Enhanced Logging (Day 1-2)

**Files to create/modify:**
- `worker/src/lib/tracing.ts` (NEW) - Request ID generation and correlation
- `worker/src/lib/logging.ts` - Add request ID to all logs
- `worker/src/index.ts` - Initialize tracing in request handler

**Tasks:**
1. Create `tracing.ts` with:
   - `generateRequestId()` - Creates unique request IDs (UUID or snowflake-style)
   - `getTraceContext()` - Extracts trace context from request headers
   - `RequestContext` type with requestId, traceId, spanId
2. Update `logging.ts`:
   - Add `setRequestContext()` to store request ID in async context
   - Include `req_id` in all JSON log output
3. Update `index.ts`:
   - Generate request ID at handler entry
   - Set tracing context before routing
   - Attach request ID to error responses

**Expected outcome:**
- All logs include `req_id` field for correlation
- Request IDs correlate across job boundaries (collect → score)
- OpenTelemetry automatically captures trace context

### Phase 3: Health Check Enhancement (Day 2)

**Files to modify:**
- `worker/src/routes/health.ts` (NEW) - Enhanced health endpoint
- `worker/src/index.ts` - Route to new health handler

**Tasks:**
1. Create `health.ts` with:
   - Check D1 connectivity (simple SELECT 1 query)
   - Check config_thresholds table exists and has data
   - Include Worker metadata (version, env, mode)
   - Structured response with component health status
2. Return 503 if D1 unavailable (not 200)
3. Add health check metrics/flags

**Response shape:**
```json
{
  "ok": true,
  "service": "oil-shock-worker",
  "env": "production",
  "featureFlags": { "macroSignals": true },
  "dependencies": {
    "database": { "status": "healthy", "latency_ms": 5 },
    "config": { "status": "healthy", "threshold_count": 24 }
  },
  "version": "2026-04-24",
  "timestamp": "2026-04-24T12:00:00Z"
}
```

### Phase 4: OpenTelemetry Export Setup (Day 2-3)

**Files to modify:**
- `worker/src/index.ts` - OTLP export initialization
- `wrangler.jsonc` - Tail Worker configuration (if using log export)

**Tasks:**
1. Enable Workers Observability automatic tracing (no code changes needed—Cloudflare does this automatically)
2. Configure OpenTelemetry export to Grafana Cloud OTLP endpoint:
   - Use `@opentelemetry/sdk-node` or Grafana's `@grafana/faro-core` library
   - Export traces with 100% sampling for initial visibility
   - Attach resource labels (service name, env, version)
3. Verify traces appear in Grafana Cloud within 1 minute
4. Test trace correlation with request IDs

**Alternative (simpler):** Use Cloudflare's native log export to Grafana Cloud via Logpush (requires Enterprise/Pro plan) or Tail Workers (workaround for free tier)

### Phase 5: Grafana Dashboards (Day 3-4)

**Dashboards to create:**
1. **Overview Dashboard:**
   - Request count (per second trend)
   - Error rate (% of requests)
   - Latency (p50, p95, p99)
   - Worker invocation distribution

2. **Database Performance Dashboard:**
   - Query count (per second)
   - Query latency (p50, p95, p99)
   - D1 efficiency ratio (rows returned / rows scanned)
   - Failed queries by type

3. **Collector Health Dashboard:**
   - Collection job success rate
   - Collector duration (energy collector)
   - Collector error rates by source
   - Data points ingested per run

4. **Operational Dashboard:**
   - Worker cold start rate
   - Health check status (D1, config)
   - Feature flag status
   - Recent error logs with request IDs

**Tasks:**
1. Import Grafana dashboards via JSON (or build in UI)
2. Create alert thresholds (see Alerts section below)
3. Add links between dashboards for drill-down
4. Set dashboard refresh to 30s for real-time monitoring

### Phase 6: Documentation & Runbooks (Day 4)

**Files to create:**
- `docs/observability.md` - Setup guide and dashboard reference
- `docs/runbooks/` - Troubleshooting guides for common issues

**Content:**
1. Grafana Cloud setup instructions (obtaining OTLP credentials)
2. Dashboard guide (what each metric means)
3. Runbooks:
   - "Error rate spike: what to check"
   - "Database latency high: diagnose slow queries"
   - "Collector failures: debug missing data"
   - "Health check failing: D1 connectivity issues"

## Testing & Validation

**Week 1 validation:**
- [ ] Request IDs appear in all logs
- [ ] Traces export to Grafana Cloud within 1 minute
- [ ] Dashboard shows live request/error data
- [ ] Health endpoint returns 200 with D1 status
- [ ] Correlation between logs and traces works (filter by req_id)

**Week 2 validation:**
- [ ] Run full collection → scoring pipeline and verify in dashboard
- [ ] Simulate D1 failure and verify health check returns 503
- [ ] View latency percentiles across 24-hour period
- [ ] Check dashboard can drill-down from error rate to specific error logs

## Dependencies & Libraries

- `@opentelemetry/sdk-node` (or lightweight alternative for Workers)
- `@opentelemetry/sdk-trace-node`
- `@opentelemetry/exporter-trace-otlp-http`
- Grafana Cloud free hobby tier (already available)

## Rollout

**Phase 1-3 (setup):** Deploy to preview first, verify traces appear
**Phase 4 (export):** Deploy to production with 100% sampling (safe for free tier)
**Phase 5 (dashboards):** Build in parallel while metrics accumulate
**Phase 6 (docs):** Complete before handoff

## Success Criteria

- ✅ All requests logged with correlation IDs
- ✅ OpenTelemetry traces flowing to Grafana Cloud
- ✅ 4 operational dashboards created and populated with data
- ✅ Health check endpoint working and integrated into dashboard
- ✅ Documentation complete with runbooks for common issues
- ✅ Able to correlate logs → traces → metrics by request ID
- ✅ No performance regression (tracing overhead <5ms per request)

## Future Enhancements (Post-MVP)

- Alert rules configured in Grafana (when free tier allows)
- SLO tracking (99.9% uptime, <100ms p99 latency targets)
- Cost tracking dashboard
- Historical analysis (trend of error rate, latency over weeks)
- Integration with Slack/PagerDuty for alerts (when moving to paid tier)
