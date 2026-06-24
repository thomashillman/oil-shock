#!/bin/bash
# Security guard: Ensure no plaintext API keys are committed to wrangler.jsonc or other config files

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

echo "Checking for plaintext provider API keys in configuration files..."

# Files to check
CONFIG_FILES=(
  "wrangler.jsonc"
  ".env.local"
  ".env.preview"
  ".env.production"
)

# Provider API key patterns (names that should ONLY appear as secrets, not vars)
KEY_PATTERNS=(
  "EIA_API_KEY"
  "GIE_API_KEY"
  "ENTSOG_API_KEY"
  "SEC_API_KEY"
  "FRED_API_KEY"
  "BLS_API_KEY"
)

FOUND_ISSUES=0

for file in "${CONFIG_FILES[@]}"; do
  filepath="$REPO_ROOT/$file"

  # Skip if file doesn't exist
  [[ ! -f "$filepath" ]] && continue

  for pattern in "${KEY_PATTERNS[@]}"; do
    # Look for patterns like: "EIA_API_KEY": "xxxx" or EIA_API_KEY=xxxx
    # Match quotes followed by non-empty string value (not a placeholder)
    if grep -E "\"$pattern\"\s*:\s*\"[^\"]{5,}" "$filepath" >/dev/null 2>&1; then
      echo "❌ ERROR: Found plaintext '$pattern' in $file"
      echo "   API keys must be configured as Cloudflare secrets, not in config files."
      echo "   See docs/PROVIDER_SECRETS_SETUP.md for instructions."
      FOUND_ISSUES=1
    fi

    if grep -E "$pattern\s*=\s*[A-Za-z0-9]{5,}" "$filepath" >/dev/null 2>&1; then
      echo "❌ ERROR: Found plaintext '$pattern' in $file"
      echo "   API keys must be configured as Cloudflare secrets, not in config files."
      echo "   See docs/PROVIDER_SECRETS_SETUP.md for instructions."
      FOUND_ISSUES=1
    fi
  done
done

if [[ $FOUND_ISSUES -eq 1 ]]; then
  exit 1
fi

echo "✅ No plaintext provider API keys found in configuration files."
exit 0
