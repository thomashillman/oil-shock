# Current Priorities

This document captures the current sequencing and decision constraints for work in this repository.

## Current status

- The repo currently implements Oil Shock, not a completed Macro Signals platform.
- `main` is the canonical branch and the implementation source of truth.
- Macro Signals is the intended direction of travel, but target-state ideas must not be assumed to already exist in code.

## Immediate priorities

### 1. Preserve the current Oil Shock path

Keep collection, scoring, snapshot writing, and the current API surface working while making changes. The existing path should remain operational during transition unless a task explicitly says to replace it.

### 2. Stage Macro Signals changes, do not jump there conceptually

Prefer additive, foundational changes over large rewrites that assume a finished multi-engine design. Build the bridge before crossing it.

### 3. Keep durable context in the repo

If an instruction, rule, or design constraint should guide future work, put it in repository docs rather than leaving it only in chat or project memory.

### 4. Keep documentation and implementation in sync

When routes, formulas, thresholds, collector behaviour, or UI contracts change, update the relevant docs in the same change set where practical.

### 5. Match validation to blast radius

Run the closest appropriate checks for the change. Scoring and migration work need stronger validation than isolated UI tweaks.

## Working assumptions

- The API should remain snapshot-based rather than computing heavy scoring work at request time.
- `config_thresholds` remains the source of truth for runtime scoring constants.
- Missing and stale data handling should remain explicit and conservative.
- Frontend changes should stay aligned with backend contracts.
- Schema work should prefer additive migrations before destructive clean-up.

## Recommended order for Macro Signals work

1. Move durable context into repo docs first.
2. Introduce shared abstractions behind the current Oil Shock path.
3. Add additive schema and configuration changes.
4. Introduce engine-scoped logic only when compatibility is preserved or intentionally replaced.
5. Retire old structures only after tests, docs, and consumers are updated.

## Current risks to watch

- Route and contract drift between Worker and app
- Docs drifting from the codebase
- Hardcoded scoring constants slipping back into code
- Refactors that assume multi-engine support exists before the data model and runtime support are ready
- Migration changes that update schema without updating dependent queries, types, and tests

## Documentation checklist

Update these files when relevant:

- `README.md`: top-level orientation and entry points
- `docs/architecture.md`: current implemented architecture and detailed behaviour
- `docs/current-priorities.md`: current sequencing, transition constraints, and non-goals
- `AGENTS.md`: durable agent operating rules
- `CLAUDE.md`: durable Claude-specific operating rules

## Change checklist

Before finishing a non-trivial change, check:

- Is the implementation still aligned with the current Oil Shock path?
- Did the work avoid assuming target-state Macro Signals structures already exist?
- Are code, tests, migrations, frontend contracts, and docs consistent?
- Were the right validation commands run for the blast radius?
