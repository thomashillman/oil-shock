# Action Manager (current bridge)

## Purpose

The current Action Manager bridge provides an audit-friendly logging link from Rule Engine v2 transition events into `action_log`.

Current runtime link:

`observations -> rule_state -> trigger_events -> action_log`

## Lifecycle

For Energy scoring runs:

1. Legacy Energy score write succeeds.
2. Energy Rule Engine v2 lifecycle succeeds.
3. If v2 produced trigger transitions, Action Manager reads confirmed, unlogged Energy trigger events.
4. Action Manager maps each event to a logging-only decision and inserts an idempotent `action_log` row.

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
- implement generic multi-engine action policy.

## Future direction

Future guardrail work should build on this bridge by introducing explicit policy evaluation over trigger events and prior action history, while preserving deterministic idempotent logging.
