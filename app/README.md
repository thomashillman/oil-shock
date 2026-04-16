# Oil Shock App

This frontend is deployed on Vercel and consumes the Cloudflare Worker API.

## Local Development

- Install dependencies from repo root:
  - `corepack pnpm install`
- Start frontend:
  - `corepack pnpm dev:web`

## Configuration

- `VITE_API_BASE_URL` points to the Worker API.
- Default fallback is `http://127.0.0.1:8787` for local development.

## Deployment

- Preview deployments are generated for branch and PR updates.
- Production deployment uses the production API base URL.
