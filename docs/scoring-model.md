# Scoring model

This document describes the **live Energy score** and how it differs from the legacy **Oil Shock
compatibility snapshot**. It is the canonical reference for the scoring calculation; the code in
`worker/src/jobs/score.ts` is the source of truth, and this doc explains its intent.

> This is an **interim bridge scoring model** with explicit assumptions. It is not a
> market-validated production signal. Treat the assumptions in "Known modelling risks" as open.

## Thesis

The score estimates whether **physical energy stress is worsening faster than market pricing
recognises**. A high score means there is physical stress that the market does **not** appear to
have priced in yet — a hidden dislocation — not merely that stress exists.

## Live Energy score

- **Route:** `GET /api/v1/energy/state` (`worker/src/routes/engine-state.ts`)
- **Storage:** the latest row in the `scores` table for `engineKey = energy`, `feedKey = energy.state`
- **Writer:** `runEnergyScore` in `worker/src/jobs/score.ts`, via the pure helper
  `computeEnergyDislocationScore`

The route is read-only: it serves the precomputed score written by the scheduled scoring job.

## Variables

Each variable is normalised to `[0, 1]`.

| Variable | Meaning | Current source series |
| --- | --- | --- |
| `physicalStress` | Evidence the physical energy system is tightening/dislocating. Higher = more physical constraint. | `energy_spread.wti_brent_spread` |
| `marketRecognition` | How much current pricing already reflects that physical stress. Higher = market recognises stress; lower = pricing may be lagging. `null` when the price feed is missing. | `price_signal.curve_slope` |
| `transmissionStress` | How much stress is transmitting into downstream products/margins. A **secondary** signal; must not dominate the score on its own. | `energy_spread.diesel_wti_crack` |

## Formula

```text
hiddenMismatch = physicalStress * (1 - marketRecognition)

scoreValue = clamp01(
  hiddenMismatch
  + transmissionStress * mismatch_market_response_weight   // default 0.15, from config_thresholds
  + ruleAdjustment                                          // sum of active energy rule weights
)
```

- `hiddenMismatch` is the unrecognised portion of physical stress. When the market already prices
  in the stress (`marketRecognition` near 1), the hidden mismatch shrinks toward 0 even if physical
  stress is high.
- `transmissionStress` contributes only a small, bounded amount (weighted by
  `mismatch_market_response_weight`). It cannot push the score to watch/actionable on its own.
- `ruleAdjustment` is the sum of `adjust_mismatch` weights for active `energy` rules that match.
- `clamp01` keeps the final score in `[0, 1]`.

## Missing data

When the price/recognition feed is unavailable, `marketRecognition` is `null` and we treat it as
**unknown** — neither "the market is ignoring the shock" nor "the market fully recognises it":

```text
hiddenMismatch = physicalStress * 0.5    // when marketRecognition is null
```

A missing recognition signal also:

- adds the flag `missing_price_confirmation`,
- lowers `confidence` from `0.8` to `0.6`,
- is passed into the Oil Shock compatibility path as a neutral `0.5` (not `0`), so a missing feed
  does not falsely confirm the compatibility mismatch. The price observation point stays `null`, so
  freshness and guardrails still flag the gap.

This avoids two failure modes: missing data acting like `0` (a false positive, the old behaviour)
and missing data acting like `1` (an overly strong false negative).

## Current inputs

The live Energy score is currently driven by exactly three series:

- `energy_spread.wti_brent_spread` → `physicalStress`
- `price_signal.curve_slope` → `marketRecognition`
- `energy_spread.diesel_wti_crack` → `transmissionStress`

## Inputs shown but not yet scored

These observations are collected and visible in runtime diagnostics but do **not** currently feed
the live Energy score:

- `physical_stress.inventory_draw` (weekly EIA crude inventory)
- `physical_stress.refinery_utilization` (monthly EIA refinery utilisation)
- `physical_stress.eu_gas_storage` (EU gas storage)

Folding any of these into the score must come with scenario tests and a docs update (see
`CLAUDE.md`); do not let them silently affect the score.

## Known modelling risks

- **Futures curve sign.** `price_signal.curve_slope` is computed in
  `worker/src/jobs/collectors/eia-futures-curve.ts` as `clamp01(0.5 + (contract4 - contract1) / 20)`,
  so contango raises the value and backwardation lowers it. Used directly as `marketRecognition`,
  strong **backwardation** lowers recognition — yet backwardation often signals that the market is
  recognising near-term tightness. The provisional interpretation may therefore be inverted. The
  collector formula is intentionally left unchanged in this iteration; the risk is quarantined here
  and made explicit in tests rather than buried in arithmetic.
- **WTI–Brent basis direction.** `physicalStress` uses the **absolute** WTI–Brent spread
  (`Math.abs(brent - wti)` in `worker/src/jobs/collectors/energy.ts`), so it is direction-insensitive.
  A widening basis in either direction reads as stress; whether signed direction should matter is open.
- **Interim model.** The weights and the linear hidden-mismatch shape are assumptions, not
  calibrated against realised oil-shock episodes.

## Scenario examples

All examples use `mismatch_market_response_weight = 0.15` and `ruleAdjustment = 0` unless noted.

1. **Transmission stress alone is not a dislocation.**
   `physicalStress = 0.02`, `transmissionStress = 1.00`, `marketRecognition = 0.50`.
   `hiddenMismatch = 0.02 * 0.50 = 0.01`; `+ 1.00 * 0.15 = 0.15` → **0.16**.
   (The old `(physicalStress + transmissionStress) / 2` formula produced a false **0.51** here.)

2. **High physical stress the market is not pricing in.**
   `physicalStress = 0.70`, `transmissionStress = 0.60`, `marketRecognition = 0.20`.
   `hiddenMismatch = 0.70 * 0.80 = 0.56`; `+ 0.60 * 0.15 = 0.09` → **0.65**.

3. **High physical stress the market already recognises.**
   `physicalStress = 0.70`, `transmissionStress = 0.60`, `marketRecognition = 0.90`.
   `hiddenMismatch = 0.70 * 0.10 = 0.07`; `+ 0.09` → **0.16**. The model distinguishes
   "stress exists" from "stress is unrecognised".

4. **Missing recognition is provisional.**
   `physicalStress = 0.70`, `transmissionStress = 1.00`, `marketRecognition` missing.
   `hiddenMismatch = 0.70 * 0.5 = 0.35`; `+ 1.00 * 0.15 = 0.15` → **0.50**, with
   `missing_price_confirmation` and confidence `0.6`.

## Oil Shock compatibility snapshot

The legacy Oil Shock path (`worker/src/jobs/score-compatibility.ts` +
`worker/src/core/scoring/compute.ts`) still writes the `signal_snapshots` tables consumed by
`GET /api/state`. It uses a different, recognition-gap formula and is **not** changed by the live
Energy model:

```text
mismatchScore = clamp01(physicalStress - priceSignal + marketResponse * mismatch_market_response_weight)
```

Here `priceSignal` is the same `price_signal.curve_slope` observation. When the price feed is
missing, the live path now feeds a neutral `0.5` into this snapshot instead of `0`, so a missing
feed no longer maximises the compatibility mismatch.
