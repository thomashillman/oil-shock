# AGENTS.md

Instructions for coding agents working in this repository.

## Repository identity

- Repository: `thomashillman/oil-shock`
- Canonical branch: `main`
- Current implementation source of truth: the code on `main`
- Current product shape: Oil Shock, a Cloudflare Worker plus D1 backend with a Vite and React frontend
- Planned direction: Macro Signals, but do not assume the multi-engine design already exists in code

Read `README.md` and `CLAUDE.md` before making non-trivial changes. Use them to understand the current runtime, commands, and scoring model.

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
3. Repository docs such as `README.md`, `CLAUDE.md`, and docs under `docs/`
4. Planning material that has not yet been moved into the repo

## Current architecture, do not hand-wave past it

Today this repo is still a single-engine Oil Shock system. The current flow is:

1. Collect source signals into `series_points`
2. Score mismatch and write `signal_snapshots` plus supporting evidence
3. Serve precomputed API responses to the frontend

Do not assume target-state Macro Signals structures such as multi-engine tables, feed registries, rule engines, or engine-scoped endpoints already exist. If you introduce them, stage them deliberately and keep the existing Oil Shock path working unless the task explicitly says otherwise.

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

## Rules for schema and migration work

- Prefer additive migrations first, destructive clean-up later.
- Keep migrations explicit and reviewable.
- When changing D1 schema, update both migration files and any dependent queries, types, and tests.
- If you seed new configuration required at runtime, make sure startup does not fail due to missing rows.
- Call out data migration risks and rollback steps in your summary or PR.

## Rules for Macro Signals expansion

- Treat the current repo as the implementation source of truth, not off-repo planning notes.
- The Macro Signals documents describe a target architecture, not a licence to bypass current structure.
- Prefer foundational abstractions over one-off branching logic when the task genuinely moves toward multi-engine support.
- Keep backward compatibility where practical, especially for current Oil Shock collection, scoring, and API surfaces.
- Before a large refactor, move durable context into repository docs, ideally `docs/architecture.md` and `docs/current-priorities.md`.
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
