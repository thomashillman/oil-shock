# Action Manager (current bridge)

## Purpose

The current Action Manager bridge provides an audit-friendly logging link from Rule Engine v2 transition events into `action_log`.

Current runtime link:

`observations -> rule_state -> trigger_events -> guardrail policy -> action_log`

## Lifecycle

For Energy scoring runs:

1. Legacy Energy score write succeeds.
2. Energy Rule Engine v2 lifecycle succeeds.
3. If v2 produced trigger transitions, Action Manager reads confirmed, unlogged Energy trigger events.
4. Action Manager evaluates each trigger event through Guardrail Policy v1 (Energy-only, logging-only).
5. Action Manager writes an idempotent `action_log` row using the policy decision and rationale.
   Supported Energy confirmation triggers remain `decision = "ignored"` with `action_type = "log_only"` because no execution policy is configured yet.

## Guardrail Policy v1 (current)

Guardrail Policy v1 is intentionally small and explicit:

- Duplicate trigger guardrail checks whether this deterministic decision key already has history.
- Same rule/release guardrail checks whether the same `engine + rule + release` already has a different decision.
- Execution policy guardrail explicitly records that Energy has no execution policy yet.
- Cooldown guardrail is a placeholder only (`not_configured`), not live enforcement.
- Every decision includes rationale and guardrail check details.

## Idempotency

- Trigger events are idempotent by `(engine_key, rule_key, release_key, transition_key)`.
- Action decisions are idempotent by deterministic decision key:
  `engine:rule:release:transition`.
- Action inserts use `INSERT OR IGNORE` into `action_log`.

## Current non-goals

The current bridge does **not**:

- execute trades,
- send notifications,
- change allocations,
- enforce live portfolio guardrails,
- execute guardrail-approved actions,
- implement generic multi-engine action policy.

## Future direction

Future guardrail work should build on this bridge by introducing explicit policy evaluation over trigger events and prior action history, while preserving deterministic idempotent logging.
