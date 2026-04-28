# Phase 6A Preview Endpoint Reliability Diagnostics

**Purpose**: Formal repeatable evidence capture for intermittent HTTP 503 `DNS cache overflow`
failures on the Phase 6A preview Worker endpoints. Replaces ad-hoc manual `curl` checks with
structured, multi-attempt, machine-readable output that includes counts, Ray IDs, and colo
distribution.

**Status**: Diagnostic tool — does not change rollout state or mark canary readiness.

---

## Why This Exists

The single-pass evidence capture (`scripts/phase6a/capture-canary-evidence.ts`) records one
snapshot per run. When endpoints are intermittently failing, a single clean run does not prove
reliability. Three required endpoints — `/health`, `/api/admin/rollout-readiness`, and
`/api/admin/rollout-status` — have been observed returning HTTP 503 `DNS cache overflow`
from Cloudflare's edge infrastructure, while `/api/admin/api-health` returns HTTP 200.

Without repeatable, counted evidence, this failure is "vibes plus screenshots." This probe
turns it into:

- failure counts per endpoint
- failure counts per HTTP status
- failure counts per Cloudflare colo (from `cf-ray` header)
- total DNS cache overflow events
- Ray IDs for each failure, usable in a Cloudflare support ticket

**10% canary remains blocked until all four required endpoints consistently return HTTP 200
with valid JSON across a full probe run.**

---

## How to Run

```bash
ADMIN_TOKEN=<your-admin-token> node scripts/phase6a/probe-preview-endpoints.mjs \
  --base-url https://energy-dislocation-engine-preview-preview.tj-hillman.workers.dev \
  --attempts 30 \
  --delay-ms 1000 \
  --out docs/evidence/phase6a-preview-endpoint-probe.json
```

Or via the package script (equivalent):

```bash
ADMIN_TOKEN=<your-admin-token> corepack pnpm phase6a:probe-preview-endpoints -- \
  --base-url https://energy-dislocation-engine-preview-preview.tj-hillman.workers.dev \
  --attempts 30 \
  --delay-ms 1000 \
  --out docs/evidence/phase6a-preview-endpoint-probe.json
```

**`ADMIN_TOKEN` is never logged.** The token is used only in the `Authorization: Bearer` header
for the three admin endpoints. It does not appear in the JSON output.

### CLI Flags

| Flag | Default | Description |
|------|---------|-------------|
| `--base-url` | `https://energy-dislocation-engine-preview-preview.tj-hillman.workers.dev` | Worker base URL |
| `--attempts` | `30` | How many probe rounds to run |
| `--delay-ms` | `1000` | Milliseconds between rounds |
| `--out` | `docs/evidence/phase6a-preview-endpoint-probe.json` | Output file path |

### Probed Endpoints

| Endpoint | Auth Required |
|----------|--------------|
| `GET /health` | No |
| `GET /api/admin/rollout-readiness` | Yes (ADMIN_TOKEN) |
| `GET /api/admin/rollout-status` | Yes (ADMIN_TOKEN) |
| `GET /api/admin/api-health` | Yes (ADMIN_TOKEN) |

---

## How to Interpret Results

The output is a JSON file at `--out`. Key fields:

### Top-level

```json
{
  "probe_version": "1.0.0",
  "generated_at": "...",
  "base_url": "...",
  "attempts_requested": 30,
  "diagnostic_only": true,
  "results": [...],
  "summary": {...}
}
```

### `summary` object

```json
{
  "total_attempts_per_endpoint": 30,
  "failures_by_endpoint": {
    "/health": 5,
    "/api/admin/rollout-readiness": 4,
    "/api/admin/rollout-status": 3,
    "/api/admin/api-health": 0
  },
  "failures_by_status": {
    "503": 12
  },
  "failures_by_colo": {
    "IAD": 7,
    "DFW": 5
  },
  "dns_cache_overflow_count": 12,
  "all_required_endpoints_passed": false
}
```

### Per-result record

```json
{
  "timestamp": "2026-04-27T12:00:01.234Z",
  "endpoint": "/health",
  "attempt": 1,
  "http_status": 503,
  "content_type": "text/plain",
  "json_parse_succeeded": false,
  "body_excerpt": "DNS cache overflow",
  "cf_ray": "87b8c4d8bc6d7f6c-IAD",
  "colo": "IAD",
  "duration_ms": 43,
  "is_success": false,
  "is_dns_cache_overflow": true
}
```

- **`body_excerpt`**: Only populated when `is_success` is false or response is non-JSON. First 160 characters of the raw response body. Useful for confirming the exact error text.
- **`cf_ray`**: Cloudflare Ray ID. Use these in support tickets.
- **`colo`**: Parsed from `cf-ray` suffix. Identifies the edge datacenter that returned the error.
- **`is_dns_cache_overflow`**: True when HTTP status is non-200 and body contains `"dns cache overflow"` (case-insensitive).

---

## What Counts as a Blocker

A blocker exists if **any** of the following appear in the summary:

- `all_required_endpoints_passed: false`
- `dns_cache_overflow_count > 0`
- Any `failures_by_endpoint` value > 0
- Any `failures_by_status` key other than `"200"`

A blocker exists even if failures are intermittent. One failure in 30 attempts is still a failure
for the purpose of Phase 6A canary readiness.

---

## What to Include in a Cloudflare Support Ticket

If the probe confirms DNS cache overflow errors, collect the following before opening a ticket:

1. **Ray IDs**: All `cf_ray` values from failed results where `is_dns_cache_overflow: true`
2. **Colo distribution**: The `failures_by_colo` summary (which edge DCs are affected)
3. **Time window**: `generated_at` and last result `timestamp`
4. **Error rate**: `dns_cache_overflow_count / (total_attempts_per_endpoint * 4)` expressed as a percentage
5. **Worker name**: `energy-dislocation-engine-preview-preview` (preview environment)
6. **Account**: tj-hillman Cloudflare account
7. **Reproduction**: "GET /health returns HTTP 503 with body `DNS cache overflow` intermittently from specific colos"

---

## Manual `curl` Does Not Override This

A clean manual `curl` on a single request does not demonstrate endpoint reliability. It samples
one attempt from one colo at one instant. This probe exists precisely because manual checks
have returned both HTTP 200 and HTTP 503 within the same investigation window.

**Formal readiness requires this probe to complete with `all_required_endpoints_passed: true`.**

---

## This Probe Does Not Change Rollout State

This script:
- Calls only `GET` endpoints (read-only)
- Does not call `/api/admin/gate-sign-off`
- Does not modify `ENERGY_ROLLOUT_PERCENT`
- Does not deploy, restart, or delete Workers
- Does not mark any gate as signed
- Does not write to D1

A clean probe run does not override the formal evidence report. Formal readiness still requires
Phase 6A evidence capture (`corepack pnpm phase6a:evidence`) to complete successfully.

---

## References

- Probe script: `scripts/phase6a/probe-preview-endpoints.mjs`
- Probe output: `docs/evidence/phase6a-preview-endpoint-probe.json` (generated at runtime)
- Evidence capture tool: `scripts/phase6a/capture-canary-evidence.ts`
- Readiness index: `docs/evidence/phase6a-readiness-index.md`
- Current priorities: `docs/current-priorities.md`
