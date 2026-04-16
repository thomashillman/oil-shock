# Deployment Guide

## Cloudflare

- Runtime: Cloudflare Workers (`worker/src/index.ts`)
- Storage: D1 (`energy_dislocation`) bound as `DB`
- Config: `wrangler.jsonc`
- Local migration:
  - `corepack pnpm db:migrate:local`
- Deploy:
  - Preview: `wrangler deploy --env preview --config wrangler.jsonc`
  - Production: `wrangler deploy --env production --config wrangler.jsonc`

## Vercel

- Frontend root: `app/`
- Build command: `corepack pnpm --filter @oil-shock/app build`
- Output: `app/dist`
- Deploy:
  - Preview deployments on branch/PR push
  - Production deployment on merge to main

## Environment Variables

### Worker (Cloudflare vars/secrets)

- `APP_ENV`: `local` | `preview` | `production`
- `PRODUCTION_ORIGIN`: production frontend origin used in CORS checks
- Additional upstream keys should be configured as Worker secrets.

### Frontend (Vercel)

- `VITE_API_BASE_URL`: public API base URL for browser requests

## Preview vs Production

- Preview frontend must target preview Worker URL.
- Production frontend must target production Worker URL.
- CORS policy allows:
  - local dev origins (`http://localhost:5173`, `http://127.0.0.1:5173`)
  - preview `*.vercel.app` origins
  - production origin via `PRODUCTION_ORIGIN`
