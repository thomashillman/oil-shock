# Rule Engine v2 (Energy bridge slice)

This document describes the currently implemented Rule Engine v2 bridge lifecycle.

## Current scope

- Engine support: **Energy only**.
- Inputs: latest Energy rows from `observations`.
- Outputs:
  - persistent rule lifecycle state in `rule_state`
  - idempotent transition events in `trigger_events`
- Invocation point: scoring job bridge step (`runEnergyScore`) after legacy Energy `scores` write.

## Lifecycle

1. Load latest required Energy observations.
2. Load prior rule state (`rule_state`) for the rule's `state_key`.
3. Evaluate typed rule logic with `RuleContext`.
4. Upsert lifecycle state (`rule_state`).
5. Insert idempotent trigger event only on configured transition conditions.

## Energy rules currently implemented

- `energy.confirmation.spread_widening`
  - Requires both:
    - `energy_spread.wti_brent_spread`
    - `energy_spread.diesel_wti_crack`
  - Marks state:
    - `active` when both thresholds are crossed
    - `inactive` when below threshold
    - `no_data` when required observations are missing
  - Emits trigger event only for `inactive -> active` transition.
  - Current thresholds are **temporary bridge constants** in code for this slice only; they are not final rule-threshold contracts.

## Idempotency

Trigger event insertion is idempotent through the existing `trigger_events` uniqueness constraint on:

- `engine_key`
- `rule_key`
- `release_key`
- `transition_key`

Replaying the same release transition does not duplicate events.

## Non-goals in this slice

- No CPI enablement.
- No macro release collector enablement.
- No action intent dispatch.
- No Action Manager decisioning.
- No portfolio guardrail execution.
- No generic `/api/engines` style APIs.
- No frontend contract changes.
