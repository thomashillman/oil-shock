# AGENTS.md

Instructions for coding agents working in this repository.

## Repository identity

- Repository: `thomashillman/oil-shock`
- Canonical branch: `main`
- Current implementation source of truth: the code on `main`
- Current product shape: Oil Shock, a Cloudflare Worker plus D1 backend with a Vite and React frontend
- Planned direction: Macro Signals, but do not assume the multi-engine design already exists in code

Read `README.md`, `docs/architecture.md`, `docs/current-priorities.md`, and `CLAUDE.md` before making non-trivial changes. Use them to understand the current runtime, detailed implementation, current transition priorities, and commands.

## Working defaults

- Prefer small, reversible changes.
- Keep current Oil Shock behaviour working while introducing abstractions.
- Separate planning from execution in your own notes, commit message, or PR summary.
- When guidance should persist, add it to the repository rather than relying on chat memory.
- If a task depends on product direction that is not yet encoded in the repo, add or update repo docs first.
- Default to `main` unless the user explicitly asks for a different branch.

## Priority order for decisions

1. Explicit user request
2. Current repository code and tests
3. Repository docs such as `README.md`, `AGENTS.md`, `CLAUDE.md`, and docs under `docs/`
4. Planning material that has not yet been moved into the repo

## Current architecture, do not hand-wave past it

Today this repo is still a single-engine Oil Shock system. The current flow is:

1. Collect source signals into `series_points`
2. Score mismatch and write `signal_snapshots` plus supporting evidence
3. Serve precomputed API responses to the frontend

Do not assume target-state Macro Signals structures such as multi-engine tables, feed registries, rule engines, or engine-scoped endpoints already exist. If you introduce them, stage them deliberately and keep the existing Oil Shock path working unless the task explicitly says otherwise.

## Landmines and Change Order

- The manual refresh button is not a local state toggle. It must trigger the backend cycle first, then reload the dashboard state.
- `series_points` is idempotent by design. Any refresh or replay path must tolerate repeated writes for the same logical point set.
- `UNKNOWN` feed health usually means the worker never wrote a failed `feed_checks` row. Check collection paths before changing the UI.
- Old refresh or branch-specific assumptions can be stale. Re-read the current `main` implementation before copying a fix forward.

When a change touches both backend and frontend, use this order unless there is a stronger reason not to:

1. Update the backend contract, data model, or worker behavior first.
2. Add or adjust worker/db tests for the new behavior.
3. Update docs if the contract, routes, or runtime behavior changed.
4. Wire the frontend to the updated backend behavior.
5. Add or update frontend tests for the user-visible path.
6. Deploy or verify the backend before relying on the refreshed frontend behavior.

If a backend change and frontend change must ship together, keep them in the same branch and verify the backend path directly before checking the UI.

## High-value paths

- `worker/src/core/`: scoring, freshness, normalisation, ledger logic
- `worker/src/jobs/`: collection pipeline and scoring pipeline
- `worker/src/routes/`: HTTP API routes
- `worker/src/db/`: D1 access layer
- `worker/src/lib/`: shared runtime helpers
- `worker/src/types.ts`: shared TypeScript contracts
- `db/migrations/`: schema and seed migrations
- `app/`: React and Vite frontend
- `scripts/`: validation and CI support scripts
- `docs/`: deployment and supporting docs
- `specs/`: planning artefacts

## Commands

Use Corepack and the pinned pnpm version.

```bash
corepack enable
corepack pnpm install
corepack pnpm dev:worker
corepack pnpm dev:web
corepack pnpm db:migrate:local
corepack pnpm test
corepack pnpm -C worker test
corepack pnpm -C app test
corepack pnpm typecheck
corepack pnpm build
corepack pnpm replay:validate
corepack pnpm docs:check
corepack pnpm ci:preflight
```

## Rules for backend and scoring work

- Treat `config_thresholds` as the source of truth for scoring constants. Do not hardcode thresholds, weights, penalties, or dwell windows in code.
- Keep API routes read-only against precomputed snapshots unless the task explicitly changes that contract.
- Preserve deterministic scoring behaviour. If scoring logic changes, run `corepack pnpm replay:validate`.
- Prefer upstream observation timestamps over wall-clock ingestion time when upstream timestamps are available.
- Do not silently change collector normalisation, freshness windows, or score composition without tests and docs updates.
- Keep missing and stale data handling explicit. Conservative downgrade behaviour should remain intentional, not accidental.
- Update `docs/architecture.md` when routes, formulas, collector behaviour, or threshold handling materially change.

## Rules for schema and migration work

- Prefer additive migrations first, destructive clean-up later.
- Keep migrations explicit and reviewable.
- When changing D1 schema, update both migration files and any dependent queries, types, and tests.
- If you seed new configuration required at runtime, make sure startup does not fail due to missing rows.
- Call out data migration risks and rollback steps in your summary or PR.

### Migrations are NOT auto-applied on deploy

Cloudflare's Workers Git integration deploys the worker code on merge to `main`, but it does
**not** run D1 migrations — that is a separate manual step against the remote database. Code and
schema therefore deploy on different tracks. Merging code that depends on an un-applied migration
breaks production as soon as the new worker goes live.

Concrete failure (PR #120): the code added `config_thresholds` keys (`0025`) and the
`seasonal_baselines` table (`0026`) and deployed, but those migrations never ran on production D1.
`loadThresholds()` throws `MISSING_THRESHOLD` on any missing mapped key and runs in both
`runCollection` and `runEnergyScore`, so the next collect+score cycle would have 500'd and frozen
the pipeline while the dashboard kept serving the last good snapshot.

To avoid it:

- Apply migrations to the target **remote** D1 *before* (or atomically with) merging the code that
  depends on them. Schema/seed first, code second.
- Treat a new `config_thresholds` key, table, or runtime-read series as a hard deploy dependency —
  `loadThresholds()` is fail-closed and takes down collection + scoring, not just one feature.
- Apply per environment, then verify against the remote DB (not just local):

  ```bash
  corepack pnpm wrangler d1 migrations apply energy_dislocation --remote --env preview
  corepack pnpm wrangler d1 migrations apply energy_dislocation --remote --env production
  ```

  Then confirm `d1_migrations` is current, `/health` shows the expected `threshold_count`, and one
  collect+score cycle succeeds. If you apply DDL/seed out of band, keep it idempotent and also
  write the `d1_migrations` tracking rows.

## Rules for Macro Signals expansion

- Treat the current repo as the implementation source of truth, not off-repo planning notes.
- The Macro Signals documents describe a target architecture, not a licence to bypass current structure.
- Prefer foundational abstractions over one-off branching logic when the task genuinely moves toward multi-engine support.
- Keep backward compatibility where practical, especially for current Oil Shock collection, scoring, and API surfaces.
- Before a large refactor, move durable context into repository docs, especially `docs/architecture.md` and `docs/current-priorities.md`.
- If introducing engine-scoped data models, collectors, or rule definitions, do it in a way that keeps the Oil Shock path operational during transition.

## Rules for frontend work

- Prefer reusable components over page-specific one-offs.
- Keep operator-facing UI clear, dense, and explicit.
- Avoid coupling the app to unstable API shapes without updating docs, tests, and any affected mock data.
- When backend contracts change, update the frontend in the same change set where practical.

## Testing expectations

Match test depth to blast radius.

- Small localised change: run the closest package tests.
- Scoring, collectors, or migrations: run worker tests and `corepack pnpm replay:validate`.
- Docs or operational contract changes: run `corepack pnpm docs:check`.
- Broad or cross-package changes: run `corepack pnpm ci:preflight`.

Do not leave behaviour changes untested.

## Repo hygiene

- Never commit secrets, tokens, or real API keys.
- Prefer typed interfaces and small patches over broad rewrites.
- Keep commit messages precise.
- Call out assumptions, risks, and manual verification steps in the final handoff.
- If something should guide future agents, keep it in the repo, not only in chat.
