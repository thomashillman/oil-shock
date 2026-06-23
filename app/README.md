# Oil Shock App

This frontend is deployed on Vercel and consumes the Cloudflare Worker API.

## Local Development

- Install dependencies from repo root:
  - `corepack pnpm install`
- Start frontend:
  - `corepack pnpm dev:web`

## Configuration

- `VITE_API_BASE_URL` points to the Worker API.
- Non-production builds fall back to `http://127.0.0.1:8787` for local development.
- Production builds require `VITE_API_BASE_URL` at startup and throw an error if it is missing.

## Deployment

- Preview deployments are generated for branch and PR updates and must set `VITE_API_BASE_URL`.
- Production deployments must set `VITE_API_BASE_URL` to the production Worker API base URL.
