/**
 * Cross-package type-alignment guard.
 *
 * The worker and app define their own `Subscores` / `FreshnessSummary` interfaces.
 * When the worker silently renames a key (e.g. `physical` -> `physicalStress`),
 * the app compiles fine but renders `undefined -> 0%` for two of three subscore
 * bars. This file fails `pnpm typecheck` on any such drift.
 *
 * Type-only — stripped from the bundle at build time.
 */

import type {
  Subscores as WorkerSubscores,
  FreshnessSummary as WorkerFreshness,
} from "../../../worker/src/types";
import type { Subscores as AppSubscores } from "../components/StateView";

type AssertEqual<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

// Compile error if app's Subscores drifts from worker's Subscores.
export const _subscoresContract: AssertEqual<AppSubscores, WorkerSubscores> = true;

// Key-set parity between subscores and the freshness summary that describes them.
export const _freshnessKeyContract: AssertEqual<
  keyof AppSubscores,
  keyof WorkerFreshness
> = true;
