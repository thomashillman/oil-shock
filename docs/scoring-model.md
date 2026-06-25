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
| `physicalStress` | Evidence the physical energy system is tightening/dislocating. Higher = more physical constraint. Anchored WTI-Brent basis plus a per-feed seasonal-baseline penalty. | `energy_spread.wti_brent_spread` (+ `physical_stress.*.seasonal_breach`) |
| `marketRecognition` | How much current pricing already reflects that physical stress. Higher = market recognises stress; lower = pricing may be lagging. `null` when the price feed is missing. Derived as `1 - curve_slope` so **backwardation raises** recognition. | `price_signal.curve_slope` (inverted) |
| `transmissionStress` | How much stress is transmitting into downstream products/margins. A **secondary** signal; must not dominate the score on its own. | `energy_spread.diesel_wti_crack` |

## Formula

```text
physicalStress = clamp01(
  basisStress                                              // anchored WTI-Brent basis (see below)
  + physical_baseline_penalty_weight * seasonalBreachCount // default 0.1, from config_thresholds
)

hiddenMismatch = physicalStress^2 * (1 - marketRecognition)

scoreValue = clamp01(
  hiddenMismatch
  + transmissionStress * mismatch_market_response_weight   // default 0.15, from config_thresholds
  + ruleAdjustment                                          // sum of active energy rule weights
)
```

- `physicalStress` enters the mismatch **quadratically**. Risk does not grow smoothly with physical
  tightness; it accelerates as the system approaches a genuine shortage. Squaring keeps low/moderate
  stress muted while letting extreme physical stress dominate.
- `hiddenMismatch` is the unrecognised portion of physical stress. When the market already prices
  in the stress (`marketRecognition` near 1), the hidden mismatch shrinks toward 0 even if physical
  stress is high.
- `seasonalBreachCount` is the number of physical-supply feeds (`physical_stress.inventory_draw`,
  `physical_stress.refinery_utilization`, `physical_stress.eu_gas_storage`) whose recent reading is
  below its 5-year seasonal baseline. Each adds `physical_baseline_penalty_weight` to physical
  stress before the clamp. Missing breach feeds contribute nothing (conservative).
- `transmissionStress` contributes only a small, bounded amount (weighted by
  `mismatch_market_response_weight`). It cannot push the score to watch/actionable on its own.
- `ruleAdjustment` is the sum of `adjust_mismatch` weights for active `energy` rules that match.
- `clamp01` keeps the final score in `[0, 1]`.

### Input normalisation and anchors

The `[0, 1]` inputs are no longer bare divisors; they are anchored to USD/bbl boundaries seeded in
`config_thresholds` and applied in `worker/src/jobs/collectors/energy.ts`:

- **WTI-Brent basis** (`basisStress`): the spread **magnitude** `|brent - wti|` is mapped so
  `wti_brent_floor_usd` (3.50) → 0 and `wti_brent_ceiling_usd` (15) → 1. When **WTI trades at a
  premium** to Brent (a domestic pipeline constraint rather than a global crude shock) the result is
  multiplied by `wti_premium_discount` (0.5). A Brent premium keeps full weight.
- **Diesel-WTI crack** (`transmissionStress`): the crack `diesel*42 - wti` is mapped so
  `diesel_crack_floor_usd` (10) → 0 and `diesel_crack_ceiling_usd` (40) → 1.

## Missing data

When the price/recognition feed is unavailable, `marketRecognition` is `null` and we treat it as
**unknown** — neither "the market is ignoring the shock" nor "the market fully recognises it":

```text
hiddenMismatch = physicalStress^2 * 0.5    // when marketRecognition is null
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

The live Energy score is driven by the basis/crack/curve series plus the physical-supply baseline:

- `energy_spread.wti_brent_spread` → `basisStress` (the base of `physicalStress`)
- `price_signal.curve_slope` → `marketRecognition` (inverted: `1 - curve_slope`)
- `energy_spread.diesel_wti_crack` → `transmissionStress`
- `physical_stress.inventory_draw` (weekly EIA crude inventory) → seasonal-breach penalty
- `physical_stress.refinery_utilization` (monthly EIA refinery utilisation) → seasonal-breach penalty
- `physical_stress.eu_gas_storage` (EU gas storage) → seasonal-breach penalty

### Seasonal baselines

Each physical-supply feed has a strong seasonal shape, so a "low" reading only matters relative to
the same period in prior years. Collectors fetch ~5 years of raw history
(`seasonal_baseline_years`), compute per-period averages (ISO week for weekly/daily feeds, month for
monthly refinery), exclude the current year, and upsert them into the `seasonal_baselines` table.
The recent reading (a `physical_rolling_weeks`-wide rolling average) is compared against that
baseline; falling below it emits a derived `physical_stress.<feed>.seasonal_breach` series point
(`1`/`0`). Scoring reads those flags and adds `physical_baseline_penalty_weight` per breach to
`physicalStress`. Helpers live in `worker/src/jobs/collectors/seasonal-baseline.ts`.

> **Monthly asymmetry.** Refinery utilisation is monthly, so its "rolling reading" is the latest
> month compared against that month's seasonal average, not a multi-week window.

## Known modelling risks

- **Interim model.** The boundaries, weights, and the squared hidden-mismatch shape are
  empirically motivated but **not yet backtested** against realised oil-shock episodes (see issue
  #119). Treat the score as a safer interim signal, not a validated production model.
- **Anchor calibration.** The USD/bbl anchors (3.50/15 basis, 10/40 crack) and the 0.1 per-feed
  penalty are reasoned defaults seeded in `config_thresholds`, adjustable without code changes.

### Resolved in this iteration

- **Futures curve sign.** `marketRecognition` is now `1 - curve_slope`, so **backwardation raises**
  recognition (the market actively pricing near-term tightness) and contango lowers it. The
  collector series remains the raw slope; the inversion is applied at the consumption point in
  `worker/src/jobs/score.ts`.
- **WTI–Brent basis direction.** The basis magnitude is now discounted (`wti_premium_discount`) when
  WTI trades at a premium to Brent, distinguishing a US-domestic constraint from a global crude shock.

## Scenario examples

All examples use `mismatch_market_response_weight = 0.15` and `ruleAdjustment = 0` unless noted.

1. **Transmission stress alone is not a dislocation.**
   `physicalStress = 0.02`, `transmissionStress = 1.00`, `marketRecognition = 0.50`.
   `hiddenMismatch = 0.02^2 * 0.50 = 0.0002`; `+ 1.00 * 0.15 = 0.15` → **0.1502**.
   The squared physical term mutes weak stress even harder than the old linear shape.

2. **High physical stress the market is not pricing in.**
   `physicalStress = 0.70`, `transmissionStress = 0.60`, `marketRecognition = 0.20`.
   `hiddenMismatch = 0.70^2 * 0.80 = 0.392`; `+ 0.60 * 0.15 = 0.09` → **0.482**.

3. **High physical stress the market already recognises.**
   `physicalStress = 0.70`, `transmissionStress = 0.60`, `marketRecognition = 0.90`.
   `hiddenMismatch = 0.70^2 * 0.10 = 0.049`; `+ 0.09` → **0.139**. The model distinguishes
   "stress exists" from "stress is unrecognised".

4. **Missing recognition is provisional.**
   `physicalStress = 0.70`, `transmissionStress = 1.00`, `marketRecognition` missing.
   `hiddenMismatch = 0.70^2 * 0.5 = 0.245`; `+ 1.00 * 0.15 = 0.15` → **0.395**, with
   `missing_price_confirmation` and confidence `0.6`.

5. **Physical-supply baseline penalty.**
   `basisStress = 0.50`, two physical feeds below their seasonal baseline, `marketRecognition = 0`.
   `physicalStress = clamp01(0.50 + 0.1*2) = 0.70`; `hiddenMismatch = 0.70^2 * 1 = 0.49` → **0.49**.

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
