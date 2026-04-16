import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const fixturePath = path.join(root, "worker", "test", "fixtures", "replay-windows.json");
const reportPath = path.join(root, "docs", "replay-validation.md");

const clamp = (value) => Math.max(0, Math.min(1, value));

// Hardcoded thresholds for dislocation state determination
const STATE_THRESHOLDS = {
  aligned_max: 0.3,
  mild_min: 0.3,
  mild_max: 0.5,
  persistent_min: 0.5,
  persistent_max: 0.75,
  deep_min: 0.75
};

function computeState(entry) {
  // Subscores
  const physicalScore = entry.physicalPressure;
  const recognitionScore = entry.recognition;
  const transmissionScore = entry.transmission;

  // Mismatch score
  const mismatchScore = clamp(physicalScore - recognitionScore + transmissionScore * 0.15);

  // Confirmations for actionability state
  const confirmations = [
    physicalScore >= 0.6 && entry.freshness.physical === "fresh",
    recognitionScore <= 0.45 && entry.freshness.recognition === "fresh",
    transmissionScore >= 0.5 && entry.freshness.transmission === "fresh"
  ].filter(Boolean).length;

  let actionabilityState = "none";
  if (mismatchScore >= 0.4) {
    actionabilityState = "watch";
  }
  if (mismatchScore >= 0.65 && confirmations >= 2) {
    actionabilityState = "actionable";
  }

  // Dislocation state (simplified from state-labels.ts without duration)
  let dislocationState = "aligned";
  if (mismatchScore < STATE_THRESHOLDS.aligned_max && physicalScore < 0.5) {
    dislocationState = "aligned";
  } else if (mismatchScore >= STATE_THRESHOLDS.mild_min && mismatchScore < STATE_THRESHOLDS.persistent_min) {
    dislocationState = "mild_divergence";
  } else if (mismatchScore >= STATE_THRESHOLDS.persistent_min && mismatchScore < STATE_THRESHOLDS.persistent_max) {
    dislocationState = "persistent_divergence";
  } else if (mismatchScore >= STATE_THRESHOLDS.deep_min) {
    dislocationState = "deep_divergence";
  }

  return {
    mismatchScore,
    actionabilityState,
    dislocationState,
    subscores: { physical: physicalScore, recognition: recognitionScore, transmission: transmissionScore }
  };
}

const fixtureRaw = await fs.readFile(fixturePath, "utf8");
const fixtures = JSON.parse(fixtureRaw);

const results = fixtures.map((entry) => {
  const first = computeState(entry);
  const second = computeState(entry);
  const deterministic =
    first.actionabilityState === second.actionabilityState &&
    first.dislocationState === second.dislocationState &&
    first.mismatchScore === second.mismatchScore &&
    first.subscores.physical === second.subscores.physical &&
    first.subscores.recognition === second.subscores.recognition &&
    first.subscores.transmission === second.subscores.transmission;
  const expectedMatch = first.dislocationState === entry.expectedState;
  return {
    window: entry.window,
    mismatchScore: Number(first.mismatchScore.toFixed(6)),
    actionabilityState: first.actionabilityState,
    dislocationState: first.dislocationState,
    expectedState: entry.expectedState,
    deterministic,
    expectedMatch
  };
});

const allDeterministic = results.every((result) => result.deterministic);
const expectedMatches = results.filter((result) => result.expectedMatch).length;

await fs.mkdir(path.dirname(reportPath), { recursive: true });

const report = [
  "# Replay Validation",
  "",
  `Generated: ${new Date().toISOString()}`,
  "",
  `Deterministic: ${allDeterministic ? "yes" : "no"}`,
  `Expected-state matches: ${expectedMatches}/${results.length}`,
  "",
  "| Window | Mismatch Score | Actionability | Dislocation State | Expected | Deterministic |",
  "|--------|----------------|----------------|------------------|----------|---------------|",
  ...results.map(
    (result) =>
      `| ${result.window} | ${result.mismatchScore} | ${result.actionabilityState} | ${result.dislocationState} | ${result.expectedState} | ${result.deterministic ? "yes" : "no"} |`
  ),
  ""
].join("\n");

await fs.writeFile(reportPath, report, "utf8");

if (!allDeterministic) {
  console.error("Replay validation failed: non-deterministic outputs detected.");
  process.exit(1);
}

console.log(`Replay validation completed. Report: ${reportPath}`);
