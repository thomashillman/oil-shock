# Provider API Secrets Configuration

**CRITICAL**: Provider API keys (EIA, GIE, ENTSOG, SEC, etc.) must be configured as **Cloudflare Secrets**, not `vars` in `wrangler.jsonc`.

## Why Secrets, Not Vars?

- **`vars`**: Visible in `wrangler.jsonc` (checked into git) — **DO NOT USE FOR SECRETS**
- **`secrets`**: Encrypted and stored by Cloudflare, bound at deploy time — **USE FOR API KEYS**

## Setup Instructions

### 1. Remove from wrangler.jsonc

Do not commit plaintext API keys to `wrangler.jsonc`. The file should NOT contain:
```jsonc
"vars": {
  "EIA_API_KEY": "xxx",    // ❌ WRONG
  "GIE_API_KEY": "yyy"     // ❌ WRONG
}
```

### 2. Configure Cloudflare Secrets

For each provider API key, use Wrangler CLI to store as a secret:

```bash
# Preview environment
wrangler secret put EIA_API_KEY --env preview
# Paste the key value when prompted (it will not echo)

wrangler secret put GIE_API_KEY --env preview
wrangler secret put ENTSOG_API_KEY --env preview

# Production environment
wrangler secret put EIA_API_KEY --env production
wrangler secret put GIE_API_KEY --env production
# ... etc
```

### 3. Access Secrets in Code

Secrets are available via the standard `Env` binding:

```typescript
export async function fetchEiaData(env: Env, url: string) {
  const apiKey = env.EIA_API_KEY; // Cloudflare injects at runtime
  const response = await fetch(url, {
    headers: { "X-API-Key": apiKey }
  });
  return response.json();
}
```

No changes needed to code — just use `env.EIA_API_KEY` as before.

### 4. Verify Secrets Are Set

```bash
# List secrets in preview
wrangler secret list --env preview

# List secrets in production
wrangler secret list --env production
```

Expected output should show `EIA_API_KEY`, `GIE_API_KEY`, etc. without revealing values.

## Security Checklist

- ✅ API keys removed from `wrangler.jsonc`
- ✅ API keys removed from `.env.local` or `.env.preview`
- ✅ Exposed keys rotated/revoked
- ✅ New keys stored as Cloudflare secrets
- ✅ No secret values in commit messages, PR bodies, or logs
- ✅ Code uses `env.PROVIDER_API_KEY` (same as before)

## Automated Guard (Optional CI Check)

Consider adding a pre-commit hook or CI step to prevent accidental key commits:

```bash
# scripts/check-secrets.sh
if grep -E '"(EIA|GIE|ENTSOG|SEC)_API_KEY"\s*:\s*"[^"]+' wrangler.jsonc; then
  echo "ERROR: Plaintext API keys found in wrangler.jsonc"
  exit 1
fi
```

Run in CI or as a pre-commit hook to catch accidental commits.

## References

- Cloudflare Secrets: https://developers.cloudflare.com/workers/configuration/secrets/
- Wrangler Secret Command: https://developers.cloudflare.com/workers/wrangler/commands/#secret
