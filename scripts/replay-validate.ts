import fs from "node:fs/promises";
import path from "node:path";
import { computeSnapshot } from "../worker/src/core/scoring/compute";
import { computeDislocationState } from "../worker/src/core/scoring/state-labels";
import { applyLedgerAdjustments } from "../worker/src/core/ledger/impact";
import type { ScoringThresholds, FreshnessSummary, DislocationState, ActionabilityState } from "../worker/src/types";

const root = path.resolve(__dirname, "..");
const fixturePath = path.join(root, "worker", "test", "fixtures", "replay-windows.json");
const reportPath = path.join(root, "docs", "replay-validation.md");

// Fixture thresholds mirror 0004 + 0006 migrations so the script runs without D1
const FIXTURE_THRESHOLDS: ScoringThresholds = {
  stateAlignedMax: 0.3,
  stateMildMin: 0.3,
  stateMildMax: 0.5,
  statePersistentMin: 0.5,
  statePersistentMax: 0.75,
  stateDeepMin: 0.75,
  shockAgeThresholdHours: 72,
  dislocationPersistenceHours: 72,
  ledgerAdjustmentMagnitude: 0.1,
  mismatchMarketResponseWeight: 0.15,
  confirmationPhysicalStressMin: 0.6,
  confirmationPriceSignalMax: 0.45,
  confirmationMarketResponseMin: 0.5,
  coverageMissingPenalty: 0.34,
  coverageStalePenalty: 0.16,
  coverageMaxPenalty: 1.0,
  stateDeepPersistenceHours: 120,
  statePersistentPersistenceHours: 72,
  ledgerStaleThresholdDays: 30
};

interface FixtureEntry {
  window: string;
  physicalStress: number;
  priceSignal: number;
  marketResponse: number;
  freshness: FreshnessSummary;
  durationHours: number | null;
  ledgerEntries?: Array<{ entryKey: string; impactDirection: "increase" | "decrease"; createdAt: string; retiredAt: null; reviewDueAt: string }>;
  expectedDislocationState: DislocationState;
  expectedActionabilityState: ActionabilityState;
}

function runFixture(entry: FixtureEntry, nowIso: string) {
  const { snapshot } = computeSnapshot({
    nowIso,
    physicalStress: entry.physicalStress,
    priceSignal: entry.priceSignal,
    marketResponse: entry.marketResponse,
    physicalStressObservedAt: nowIso,
    priceSignalObservedAt: nowIso,
    marketResponseObservedAt: nowIso,
    freshness: entry.freshness,
    thresholds: FIXTURE_THRESHOLDS
  });

  const { adjustedMismatchScore, ledgerImpact } = applyLedgerAdjustments({
    mismatchScore: snapshot.mismatchScore,
    physicalStress: snapshot.subscores.physicalStress,
    ledgerEntries: entry.ledgerEntries ?? [],
    nowIso,
    thresholds: FIXTURE_THRESHOLDS
  });

  const durationSeconds = entry.durationHours !== null ? entry.durationHours * 3600 : null;

  const { state: dislocationState } = computeDislocationState(
    adjustedMismatchScore,
    snapshot.subscores,
    entry.freshness,
    durationSeconds,
    FIXTURE_THRESHOLDS
  );

  return {
    mismatchScore: Number(adjustedMismatchScore.toFixed(6)),
    actionabilityState: snapshot.actionabilityState,
    dislocationState,
    subscores: snapshot.subscores,
    ledgerImpact
  };
}

async function main() {
  const fixtureRaw = await fs.readFile(fixturePath, "utf8");
  const fixtures = JSON.parse(fixtureRaw) as FixtureEntry[];
  const nowIso = new Date().toISOString();

  const results = fixtures.map((entry) => {
    const first = runFixture(entry, nowIso);
    const second = runFixture(entry, nowIso);

    const deterministic =
      first.actionabilityState === second.actionabilityState &&
      first.dislocationState === second.dislocationState &&
      first.mismatchScore === second.mismatchScore &&
      first.subscores.physicalStress === second.subscores.physicalStress &&
      first.subscores.priceSignal === second.subscores.priceSignal &&
      first.subscores.marketResponse === second.subscores.marketResponse;

    const dislocationMatch = first.dislocationState === entry.expectedDislocationState;
    const actionabilityMatch = first.actionabilityState === entry.expectedActionabilityState;

    return {
      window: entry.window,
      mismatchScore: first.mismatchScore,
      actionabilityState: first.actionabilityState,
      dislocationState: first.dislocationState,
      expectedDislocationState: entry.expectedDislocationState,
      expectedActionabilityState: entry.expectedActionabilityState,
      deterministic,
      dislocationMatch,
      actionabilityMatch
    };
  });

  const allDeterministic = results.every((r) => r.deterministic);
  const dislocationMatches = results.filter((r) => r.dislocationMatch).length;
  const actionabilityMatches = results.filter((r) => r.actionabilityMatch).length;
  const failures = results.filter((r) => !r.dislocationMatch || !r.actionabilityMatch || !r.deterministic);

  await fs.mkdir(path.dirname(reportPath), { recursive: true });

  const report = [
    "# Replay Validation",
    "",
    `Generated: ${nowIso}`,
    "",
    `Deterministic: ${allDeterministic ? "yes" : "no"}`,
    `Dislocation-state matches: ${dislocationMatches}/${results.length}`,
    `Actionability-state matches: ${actionabilityMatches}/${results.length}`,
    "",
    "| Window | Mismatch | Dislocation State | Expected Dislocation | Actionability | Expected Actionability | Deterministic |",
    "|--------|----------|-------------------|----------------------|---------------|------------------------|---------------|",
    ...results.map(
      (r) =>
        `| ${r.window} | ${r.mismatchScore} | ${r.dislocationState} | ${r.expectedDislocationState} | ${r.actionabilityState} | ${r.expectedActionabilityState} | ${r.deterministic ? "yes" : "no"} |`
    ),
    ""
  ].join("\n");

  await fs.writeFile(reportPath, report, "utf8");

  if (failures.length > 0) {
    console.error("Replay validation failed:");
    for (const f of failures) {
      if (!f.deterministic) console.error(`  NON-DETERMINISTIC: ${f.window}`);
      if (!f.dislocationMatch) console.error(`  DISLOCATION MISMATCH: ${f.window} — got ${f.dislocationState}, expected ${f.expectedDislocationState}`);
      if (!f.actionabilityMatch) console.error(`  ACTIONABILITY MISMATCH: ${f.window} — got ${f.actionabilityState}, expected ${f.expectedActionabilityState}`);
    }
    process.exit(1);
  }

  console.log(`Replay validation passed (${results.length} windows). Report: ${reportPath}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
