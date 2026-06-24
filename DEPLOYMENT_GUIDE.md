# Manual Deployment Guide for OTLP Observability

Since automatic API token authentication had permission issues, follow these manual steps on your local machine.

## Step 1: Store OTLP Secrets Locally

On your **local machine** with `oil-shock` repository cloned:

```bash
# Option A: Using API Token (most reliable)
export CLOUDFLARE_API_TOKEN='your_valid_cloudflare_api_token'
bash scripts/setup-otlp.sh

# Option B: Using wrangler login (interactive)
npx wrangler login
bash scripts/setup-otlp.sh
```

**If API token fails:**
1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Click "View" on your existing token
3. Verify it has these permissions:
   - `Workers Scripts:Write`
   - `Workers Secrets:Write`
4. Create a new token if needed
5. Retry with fresh token

## Step 2: Deploy to Preview

```bash
wrangler deploy --env preview
```

You should see:
```
✨ Uploading worker...
✓ Uploaded successfully
✨ Created preview environment
```

## Step 3: Generate Test Traffic

```bash
# Test the health endpoint (should return 200)
curl https://your-preview-domain.workers.dev/health | jq

# Generate traffic to populate dashboards (100 requests)
for i in {1..100}; do
  curl https://your-preview-domain.workers.dev/health > /dev/null 2>&1
  sleep 0.1
done

echo "✓ Test traffic sent"
```

## Step 4: Verify Traces in Grafana Cloud

1. Wait 2-3 minutes for traces to flow
2. Go to: https://grafana.com → Your Cloud Stack
3. **Explore → Traces**
4. Search for: `service.name="oil-shock-worker"`
5. You should see traces from your requests

## Step 5: Build Dashboards

Follow: `docs/phase5-dashboards.md`

Create these 4 dashboards in Grafana Cloud UI:
1. Overview Dashboard
2. Database Performance Dashboard
3. Collector Health Dashboard
4. Operational Dashboard

## Step 6: Deploy to Production

Once dashboards are working in preview:

```bash
wrangler deploy --env production
```

## Troubleshooting

**"Too many authentication failures"**
- Wait 15 minutes for rate limit reset
- Or use `wrangler login` instead of API token
- Or create a new API token

**"Workers Secrets:Write permission missing"**
- Create new token at: https://dash.cloudflare.com/profile/api-tokens
- Select "Workers" template
- Ensure permissions include secrets write

**Traces not appearing in Grafana Cloud**
- Verify worker deployed: `wrangler deployments list --env preview`
- Check OTEL_EXPORTER_OTLP_ENDPOINT in wrangler.jsonc is correct
- Check OTEL_EXPORTER_OTLP_HEADERS secret stored: `wrangler secret list --env preview`
- Wait 5+ minutes (first traces may be delayed)

**Health endpoint shows 503**
- Check D1 database is accessible: `wrangler d1 shell energy_dislocation`
- Run: `SELECT 1;` (should succeed)
- Check config_thresholds exist: `SELECT COUNT(*) FROM config_thresholds;` (should be >0)
