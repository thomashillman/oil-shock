#!/bin/bash
# Setup script for OTLP secrets in Cloudflare Workers

set -e

echo "🔐 Setting up OpenTelemetry OTLP secrets for Oil Shock Worker"
echo ""

# Check for Cloudflare API token
if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
  echo "❌ CLOUDFLARE_API_TOKEN environment variable not set"
  echo ""
  echo "To set it up:"
  echo "1. Go to: https://dash.cloudflare.com/profile/api-tokens"
  echo "2. Create a token with: 'Workers Secrets Write' permission"
  echo "3. Copy the token and run:"
  echo ""
  echo "   export CLOUDFLARE_API_TOKEN=your_token_here"
  echo "   bash scripts/setup-otlp.sh"
  echo ""
  exit 1
fi

echo "✓ CLOUDFLARE_API_TOKEN is set"
echo ""

# OTLP Header value
OTLP_HEADER='Authorization=Basic%20MTYwODQwNjpnbGNfZXlKdklqb2lNVGMwTkRRd09DSXNJbTRpT2lKamJHOTFaR1pzWVhKbElpd2lheUk2SWxaR2IyWTBOMncxTjBOS1V6aGtNazVPYm5SeU5UWXdPU0lzSW0waU9uc2ljaUk2SW5CeWIyUXRaMkl0YzI5MWRHZ3RNU0o5ZlE9PQ=='

echo "📝 Storing OTEL_EXPORTER_OTLP_HEADERS for preview environment..."
echo "$OTLP_HEADER" | npx wrangler secret put OTEL_EXPORTER_OTLP_HEADERS --env preview
echo "✓ Preview secret stored"
echo ""

echo "📝 Storing OTEL_EXPORTER_OTLP_HEADERS for production environment..."
echo "$OTLP_HEADER" | npx wrangler secret put OTEL_EXPORTER_OTLP_HEADERS --env production
echo "✓ Production secret stored"
echo ""

echo "✅ All secrets configured successfully!"
echo ""
echo "Next step: Deploy the worker"
echo "  wrangler deploy --env preview"
