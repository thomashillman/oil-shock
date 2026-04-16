# Tasks: Oil Shock MVP

## Overview

Total tasks: 19  
POC-first workflow with 5 phases:
1. Phase 1: Make It Work (POC)
2. Phase 2: Refactoring
3. Phase 3: Testing
4. Phase 4: Quality Gates
5. Phase 5: PR Lifecycle

## Completion Criteria (Autonomous Execution Standard)

This spec is complete only when all are true:
- Existing checks still pass (or baseline constraints are documented).
- Core MVP flow works end-to-end: ingest -> score -> snapshot API -> frontend render.
- API contracts are stable and typed.
- Replay and quality checks run in CI.
- PR is open with green checks and addressed review feedback.

## Phase 1: Make It Work (POC)

- [x] 1.1 Initialize monorepo scaffolding for Worker + app
  - **Do**: Set up project folders, package manager scripts, and baseline TypeScript configs.
  - **Files**: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `worker/`, `app/`
  - **Done when**: `pnpm install` and `pnpm -r build` succeed with scaffold code.
  - **Verify**: `pnpm install && pnpm -r build`
  - **Commit**: `feat(scaffold): initialize worker and app workspaces`
  - _Requirements: FR-1, FR-7_
  - _Design: File Structure_

- [x] 1.2 Create Cloudflare Worker and D1 baseline
  - **Do**: Add Worker entrypoint, `wrangler.jsonc`, D1 binding placeholder, and env blocks for preview/production.
  - **Files**: `wrangler.jsonc`, `worker/src/index.ts`, `worker/src/env.ts`
  - **Done when**: `wrangler dev` boots and exposes placeholder API route.
  - **Verify**: `pnpm dev:worker`
  - **Commit**: `feat(worker): add wrangler config and worker bootstrap`
  - _Requirements: AC-4.1, FR-4_
  - _Design: API Layer, Technical Decisions_

- [x] 1.3 Add initial D1 schema and migration workflow
  - **Do**: Create first migration with core tables and indexes for time series and snapshots.
  - **Files**: `db/migrations/0001_init.sql`, `worker/src/db/schema.ts`
  - **Done when**: Local migration applies successfully and tables exist.
  - **Verify**: `pnpm db:migrate:local`
  - **Commit**: `feat(db): add initial d1 schema and migration scripts`
  - _Requirements: FR-1, FR-6, NFR-5_
  - _Design: Data Model Priorities_

- [x] 1.4 [P] Implement source collector stubs with normalized writes
  - **Do**: Add EIA/gas/filings collector modules with shared normalization interface and write path to `series_points`.
  - **Files**: `worker/src/jobs/collectors/eia.ts`, `worker/src/jobs/collectors/gas.ts`, `worker/src/jobs/collectors/sec.ts`, `worker/src/core/normalize.ts`
  - **Done when**: Collectors can run against fixtures and persist normalized points.
  - **Verify**: `pnpm test worker -- --runInBand collectors`
  - **Commit**: `feat(ingest): add collector stubs and normalization pipeline`
  - _Requirements: FR-1_
  - _Design: Ingestion Jobs, Normalizer + Freshness Evaluator_

- [x] 1.5 Implement scoring job that writes snapshots
  - **Do**: Build mismatch score combiner and actionability gate, then persist `runs`, `run_evidence`, and `signal_snapshots`.
  - **Files**: `worker/src/jobs/score.ts`, `worker/src/core/scoring/*.ts`, `worker/src/core/freshness/*.ts`
  - **Done when**: Scheduled scoring path produces a coherent snapshot record.
  - **Verify**: `pnpm test worker -- --runInBand score`
  - **Commit**: `feat(score): compute mismatch state and persist snapshots`
  - _Requirements: FR-2, FR-3, FR-6, AC-1.2_
  - _Design: Mismatch Scorer_

- [x] 1.6 Expose API endpoints backed by snapshot storage
  - **Do**: Implement `/api/state`, `/api/evidence`, `/api/coverage`, ledger read/write endpoints, plus request validation.
  - **Files**: `worker/src/index.ts`, `worker/src/routes/*.ts`, `worker/src/core/ledger/*.ts`
  - **Done when**: Endpoints return typed responses from D1 snapshots, not live recomputation.
  - **Verify**: `pnpm test worker -- --runInBand api`
  - **Commit**: `feat(api): add state evidence coverage and ledger endpoints`
  - _Requirements: FR-4, FR-5, AC-1.1, AC-2.1, AC-3.1_
  - _Design: API Layer, Interfaces_

- [x] 1.7 [VERIFY] POC end-to-end checkpoint
  - **Do**: Run local flow: migrate DB -> ingest fixture data -> score -> query API.
  - **Done when**: API returns a non-empty snapshot with state, freshness, and confidence fields.
  - **Verify**: `pnpm poc:run`
  - **Commit**: `feat(poc): validate end-to-end state engine flow`

## Phase 2: Refactoring

- [x] 2.1 Refactor Worker into explicit domain modules
  - **Do**: Separate ingest, scoring, ledger, and API adapters into bounded modules with clear interfaces.
  - **Files**: `worker/src/core/**`, `worker/src/routes/**`, `worker/src/db/**`
  - **Done when**: No route handler directly contains scoring or SQL business logic.
  - **Verify**: `pnpm -C worker typecheck`
  - **Commit**: `refactor(worker): separate domain modules and boundaries`
  - _Requirements: NFR-5_
  - _Design: Components_

- [x] 2.2 Add robust error and run-diagnostics handling
  - **Do**: Standardize errors, request IDs, run status logging, and fallback behavior when sources are stale/unavailable.
  - **Files**: `worker/src/lib/errors.ts`, `worker/src/lib/logging.ts`, `worker/src/jobs/*.ts`
  - **Done when**: Failures are recorded with actionable context and no partial snapshot writes occur.
  - **Verify**: `pnpm test worker -- --runInBand errors`
  - **Commit**: `refactor(worker): add structured errors and run diagnostics`
  - _Requirements: FR-6, NFR-2_
  - _Design: Error Handling_

- [x] 2.3 Enforce CORS and environment-safe config boundaries
  - **Do**: Implement strict origin allowlist and ensure frontend uses only public API base URL.
  - **Files**: `worker/src/lib/cors.ts`, `app/src/config.ts`, `.env.example`
  - **Done when**: Unauthorized origins are rejected and no backend secrets are exposed to app bundle.
  - **Verify**: `pnpm test worker -- --runInBand cors && pnpm -C app build`
  - **Commit**: `refactor(security): enforce cors and safe env boundaries`
  - _Requirements: AC-4.3, NFR-4_
  - _Design: Security Considerations_

- [x] 2.4 [VERIFY] Midpoint quality checkpoint
  - **Do**: Run lint, typecheck, and tests across workspaces.
  - **Done when**: All configured checks pass.
  - **Verify**: `pnpm lint && pnpm -r typecheck && pnpm test`
  - **Commit**: `chore(quality): pass midpoint quality checkpoint`

## Phase 3: Testing

- [x] 3.1 Add unit tests for scoring and freshness logic
  - **Do**: Cover thresholding, cross-confirmation rules, and stale-data gating.
  - **Files**: `worker/test/scoring/*.test.ts`, `worker/test/freshness/*.test.ts`
  - **Done when**: Branches for `none/watch/actionable` and stale conditions are covered.
  - **Verify**: `pnpm -C worker test -- scoring freshness`
  - **Commit**: `test(score): cover actionability and freshness logic`
  - _Requirements: FR-2, FR-3, AC-1.2_
  - _Design: Test Strategy_

- [x] 3.2 Add integration tests for collector->DB->score flow
  - **Do**: Use fixture payloads to test ingestion and resulting snapshot writes.
  - **Files**: `worker/test/integration/pipeline.test.ts`, `worker/test/fixtures/**`
  - **Done when**: Pipeline test validates `runs`, `run_evidence`, and `signal_snapshots` coherence.
  - **Verify**: `pnpm -C worker test -- integration`
  - **Commit**: `test(pipeline): add integration coverage for ingest to snapshot flow`
  - _Requirements: FR-1, FR-6_
  - _Design: Integration Tests_

- [x] 3.3 [P] Add API contract tests for state/evidence/ledger
  - **Do**: Validate response schema, required fields, and status codes for all MVP endpoints.
  - **Files**: `worker/test/contracts/*.test.ts`, `worker/src/contracts/*.ts`
  - **Done when**: Contract tests enforce fields from ACs and reject invalid payloads.
  - **Verify**: `pnpm -C worker test -- contracts`
  - **Commit**: `test(api): enforce response contracts and validation behavior`
  - _Requirements: AC-1.1, AC-2.2, AC-3.2, AC-3.3_
  - _Design: Interfaces_

- [x] 3.4 Add frontend integration tests for dashboard and evidence views
  - **Do**: Mock API client and verify rendering of state, confidence, freshness, and evidence groups.
  - **Files**: `app/src/pages/*.test.tsx`, `app/src/api/client.test.ts`
  - **Done when**: UI tests pass for normal and stale-data states.
  - **Verify**: `pnpm -C app test`
  - **Commit**: `test(app): add dashboard and evidence integration tests`
  - _Requirements: FR-7_
  - _Design: E2E/UI Strategy_

- [x] 3.5 [VERIFY] Replay validation checkpoint
  - **Do**: Run deterministic replay against selected historical stress fixtures and report hit/false-positive behavior.
  - **Done when**: Replay output is reproducible and summary is captured in repo docs.
  - **Verify**: `pnpm replay:validate`
  - **Commit**: `test(replay): validate historical replay behavior`
  - _Requirements: FR-8_

## Phase 4: Quality Gates

- [x] 4.1 [VERIFY] Full local quality gate
  - **Do**: Run final local checks for lint, typecheck, tests, and build.
  - **Done when**: All checks pass with no unresolved regressions.
  - **Verify**: `pnpm lint && pnpm -r typecheck && pnpm test && pnpm -r build`
  - **Commit**: `chore(quality): pass full local quality gate`

- [x] 4.2 Prepare deployment configs for preview and production
  - **Do**: Finalize Worker env blocks, frontend env mapping, and deployment docs.
  - **Files**: `wrangler.jsonc`, `app/README.md`, `docs/deploy.md`
  - **Done when**: Preview/prod variables and deploy commands are documented and consistent.
  - **Verify**: `pnpm docs:check`
  - **Commit**: `chore(deploy): finalize preview and production configuration`
  - _Requirements: AC-4.1, AC-4.2_

- [x] 4.3 [VERIFY] Branch readiness and CI preflight
  - **Do**: Run branch-readiness autofix workflow and resolve deterministic failures before push.
  - **Done when**: Branch is locally green and ready for PR.
  - **Verify**: `pnpm ci:preflight`
  - **Commit**: `chore(ci): ensure branch readiness before pr`

## Phase 5: PR Lifecycle

- [x] 5.1 Open PR with implementation summary
  - **Do**: Push branch and create PR with architecture, scope, and verification notes.
  - **Done when**: PR URL exists and description is complete.
  - **Verify**: `gh pr create --fill`
  - **Commit**: `chore(pr): prepare pr metadata`

- [x] 5.2 [VERIFY] Monitor CI and resolve deterministic failures
  - **Do**: Triage failing checks, apply minimal fixes, and re-run until CI is green.
  - **Done when**: Required checks pass.
  - **Verify**: `gh pr checks --watch`
  - **Commit**: `fix(ci): resolve deterministic check failures`

- [x] 5.3 Address review feedback and re-validate
  - **Do**: Resolve review comments with focused commits and rerun relevant validation.
  - **Done when**: No unresolved critical review comments remain.
  - **Verify**: `pnpm test && gh pr view --comments`
  - **Commit**: `fix(review): address pull request feedback`

## Dependencies

```text
1.1 -> 1.2 -> 1.3 -> 1.4,1.5 -> 1.6 -> 1.7
1.7 -> 2.1 -> 2.2,2.3 -> 2.4
2.4 -> 3.1,3.2,3.3,3.4 -> 3.5
3.5 -> 4.1 -> 4.2 -> 4.3
4.3 -> 5.1 -> 5.2 -> 5.3
```
