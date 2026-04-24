# Grafana Cloud Setup Guide

This document describes how to set up OpenTelemetry trace export to Grafana Cloud for Oil Shock Worker observability.

## Prerequisites

- Grafana Cloud free hobby account (or higher tier)
- Access to your Grafana Cloud instance dashboard
- Oil Shock repository cloned locally

## Step 1: Obtain OTLP Credentials from Grafana Cloud

1. Log in to your Grafana Cloud instance at https://grafana.com
2. Navigate to **Connections → Data Sources** (or use the sidebar)
3. Search for and open **OTLP (OpenTelemetry Protocol)**
4. Under **Configuration**, select **OpenTelemetry Protocol** and click **Create API Token**
5. In the token creation dialog:
   - Give the token a name (e.g., `oil-shock-worker`)
   - Select scopes: `traces:write`
   - Click **Create**
6. You'll see two values:
   - **OTLP Endpoint** (URL like `https://your-instance-url/otlp/v1/traces`)
   - **API Key** (long string starting with `glc_`)

## Step 2: Configure Environment Variables

### For Local Development

Edit `wrangler.jsonc` and add your credentials to the `vars` section:

```jsonc
"vars": {
  // ... existing vars
  "GRAFANA_OTLP_ENDPOINT": "https://your-instance-url/otlp/v1/traces",
  "GRAFANA_OTLP_API_KEY": "glc_your_api_key_here"
}
```

### For Preview & Production

Edit the `env.preview` and `env.production` sections in `wrangler.jsonc`:

```jsonc
"preview": {
  "vars": {
    // ... existing vars
    "GRAFANA_OTLP_ENDPOINT": "https://your-instance-url/otlp/v1/traces",
    "GRAFANA_OTLP_API_KEY": "glc_your_api_key_here"
  }
},
"production": {
  "vars": {
    // ... existing vars
    "GRAFANA_OTLP_ENDPOINT": "https://your-instance-url/otlp/v1/traces",
    "GRAFANA_OTLP_API_KEY": "glc_your_api_key_here"
  }
}
```

### For Cloud Deployment (Cloudflare Wrangler)

Use `wrangler secret` to securely store the API key:

```bash
wrangler secret put GRAFANA_OTLP_API_KEY --env preview
wrangler secret put GRAFANA_OTLP_API_KEY --env production
```

Then set the endpoint in wrangler.jsonc (not sensitive):

```bash
wrangler secret put GRAFANA_OTLP_ENDPOINT --env preview
wrangler secret put GRAFANA_OTLP_ENDPOINT --env production
```

Or add to `wrangler.jsonc` as non-secret vars if the URL is not sensitive.

## Step 3: Deploy and Verify

1. Deploy the worker:
   ```bash
   corepack pnpm -C worker deploy --env preview
   ```

2. Make a test request to trigger trace export:
   ```bash
   curl https://your-preview-domain/health
   ```

3. In Grafana Cloud, go to **Explore → Traces** and search for traces from your worker
4. Filter by service name `oil-shock-worker` to see traces from your deployment

## Step 4: Build Dashboards (Phase 5)

Once traces are flowing, create Grafana dashboards to visualize:
- Request counts and error rates
- Latency percentiles (p50, p95, p99)
- Database query performance
- Collector job health

See `docs/observability-plan.md` for full dashboard specifications.

## Troubleshooting

### No traces appearing in Grafana Cloud

- Verify `GRAFANA_OTLP_ENDPOINT` and `GRAFANA_OTLP_API_KEY` are correct
- Check worker logs: `wrangler tail --env preview`
- Ensure the worker is making actual requests (not just deployment verification)
- Allow 1-2 minutes for traces to appear in Grafana Cloud UI

### "Unauthorized" errors in worker logs

- Verify the API key format (should start with `glc_`)
- Regenerate the API token in Grafana Cloud and update wrangler config
- Check that the token has `traces:write` scope

### Slow response times after enabling tracing

- OTLP export should add <5ms latency per request
- Check Grafana Cloud network latency from your Cloudflare Worker location
- Consider reducing sample rate in production if needed

## Rollback

To disable OpenTelemetry export:

1. Set `GRAFANA_OTLP_ENDPOINT` and `GRAFANA_OTLP_API_KEY` to empty strings in wrangler.jsonc
2. Redeploy: `corepack pnpm -C worker deploy`
3. Existing logs and data in Grafana Cloud are retained; no cleanup needed

## Cost Considerations

Grafana Cloud free hobby tier includes:
- 50 GB traces/month
- 1 dashboard
- Basic alerting (limited)

At Oil Shock's current request volume (~50-100/minute during collection), you'll use roughly:
- ~700 MB/day = ~20 GB/month of traces

This fits comfortably in the free tier. Monitor usage in Grafana Cloud → **Usage** dashboard.

When approaching limits, consider:
- Reducing trace sample rate (currently 100%)
- Filtering which endpoints are traced
- Upgrading to a paid tier for unlimited dashboards and alerting
