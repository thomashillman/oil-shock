import type { BackfillRow } from "./types";

export function downloadBackfillCsv(rows: BackfillRow[], fileName = "backfill-comparison.csv") {
  if (rows.length === 0) return;

  const header = "generatedAt,baselineScore,rescoredWithOverride,delta";
  const lines = rows.map((row) => {
    const delta = row.rescoredWithOverride - row.baselineScore;
    return `${row.generatedAt},${row.baselineScore.toFixed(4)},${row.rescoredWithOverride.toFixed(4)},${delta.toFixed(4)}`;
  });

  const blob = new Blob([[header, ...lines].join("\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}
