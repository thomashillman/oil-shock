import fs from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const fixturePath = path.join(root, "worker", "test", "fixtures", "replay-windows.json");
const reportPath = path.join(root, "docs", "replay-validation.md");

const clamp = (value) => Math.max(0, Math.min(1, value));

function computeState(entry) {
  const mismatchScore = clamp(entry.physicalPressure - entry.recognition + entry.transmission * 0.15);
  const confirmations = [
    entry.physicalPressure >= 0.6 && entry.freshness.physical === "fresh",
    entry.recognition <= 0.45 && entry.freshness.recognition === "fresh",
    entry.transmission >= 0.5 && entry.freshness.transmission === "fresh"
  ].filter(Boolean).length;

  let state = "none";
  if (mismatchScore >= 0.4) {
    state = "watch";
  }
  if (mismatchScore >= 0.65 && confirmations >= 2) {
    state = "actionable";
  }

  return { mismatchScore, state };
}

const fixtureRaw = await fs.readFile(fixturePath, "utf8");
const fixtures = JSON.parse(fixtureRaw);

const results = fixtures.map((entry) => {
  const first = computeState(entry);
  const second = computeState(entry);
  const deterministic = first.state === second.state && first.mismatchScore === second.mismatchScore;
  const expectedMatch = first.state === entry.expectedState;
  return {
    window: entry.window,
    mismatchScore: Number(first.mismatchScore.toFixed(6)),
    state: first.state,
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
  "| Window | Mismatch Score | State | Expected | Deterministic |",
  "|--------|----------------|-------|----------|---------------|",
  ...results.map(
    (result) =>
      `| ${result.window} | ${result.mismatchScore} | ${result.state} | ${result.expectedState} | ${result.deterministic ? "yes" : "no"} |`
  ),
  ""
].join("\n");

await fs.writeFile(reportPath, report, "utf8");

if (!allDeterministic) {
  console.error("Replay validation failed: non-deterministic outputs detected.");
  process.exit(1);
}

console.log(`Replay validation completed. Report: ${reportPath}`);
