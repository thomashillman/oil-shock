import { downloadBackfillCsv } from "./downloadCsv";
import { colors, panelStyles } from "./styles";
import type { BackfillRow, SortKey } from "./types";

interface BackfillPanelProps {
  runBackfill: () => Promise<void>;
  filterMinDelta: string;
  setFilterMinDelta: (value: string) => void;
  sortKey: SortKey;
  setSortKey: (value: SortKey) => void;
  filteredRows: BackfillRow[];
  backfillSummary: { avgDelta: number; maxIncrease: number; maxDecrease: number };
}

export function BackfillPanel({
  runBackfill,
  filterMinDelta,
  setFilterMinDelta,
  sortKey,
  setSortKey,
  filteredRows,
  backfillSummary,
}: BackfillPanelProps) {
  return (
    <div id="backfill-panel" role="tabpanel" aria-labelledby="backfill-tab" style={{ ...panelStyles.bodyCard, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <button onClick={() => void runBackfill()}>Run historical re-score</button>
        <label style={{ fontSize: 12, color: colors.textBody, display: "flex", gap: 6, alignItems: "center" }}>
          Min |Δ|
          <input
            aria-label="Minimum delta filter"
            value={filterMinDelta}
            onChange={(event) => setFilterMinDelta(event.target.value)}
            style={{ width: 60 }}
          />
        </label>
        <label style={{ fontSize: 12, color: colors.textBody, display: "flex", gap: 6, alignItems: "center" }}>
          Sort
          <select aria-label="Backfill sort" value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)}>
            <option value="generatedAt">Newest</option>
            <option value="delta">Largest delta</option>
          </select>
        </label>
        <button onClick={() => downloadBackfillCsv(filteredRows)} disabled={filteredRows.length === 0}>
          Export CSV
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(120px, 1fr))", gap: 8 }}>
        <div style={{ border: `1px solid ${colors.borderSoft}`, borderRadius: 8, padding: 8 }}>
          <p style={{ margin: 0, fontSize: 11, color: colors.textMuted }}>Avg delta</p>
          <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 700 }}>{(backfillSummary.avgDelta * 100).toFixed(2)} pts</p>
        </div>
        <div style={{ border: `1px solid ${colors.borderSoft}`, borderRadius: 8, padding: 8 }}>
          <p style={{ margin: 0, fontSize: 11, color: colors.textMuted }}>Max increase</p>
          <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 700, color: colors.success }}>+{(backfillSummary.maxIncrease * 100).toFixed(2)} pts</p>
        </div>
        <div style={{ border: `1px solid ${colors.borderSoft}`, borderRadius: 8, padding: 8 }}>
          <p style={{ margin: 0, fontSize: 11, color: colors.textMuted }}>Max decrease</p>
          <p style={{ margin: "4px 0 0", fontSize: 14, fontWeight: 700, color: colors.danger }}>{(backfillSummary.maxDecrease * 100).toFixed(2)} pts</p>
        </div>
      </div>

      {filteredRows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 12, color: colors.textMuted }}>No rows yet. Run backfill to compare historical snapshots.</p>
      ) : (
        <div style={{ overflowX: "auto", border: `1px solid ${colors.borderSoft}`, borderRadius: 8 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                <th style={{ padding: "8px 10px" }}>Generated</th>
                <th style={{ padding: "8px 10px" }}>Baseline</th>
                <th style={{ padding: "8px 10px" }}>Projected</th>
                <th style={{ padding: "8px 10px" }}>Delta</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.slice(0, 100).map((row) => {
                const delta = row.rescoredWithOverride - row.baselineScore;
                return (
                  <tr key={row.generatedAt} style={{ borderTop: `1px solid ${colors.borderSoft}` }}>
                    <td style={{ padding: "8px 10px" }}>{row.generatedAt}</td>
                    <td style={{ padding: "8px 10px" }}>{(row.baselineScore * 100).toFixed(2)}%</td>
                    <td style={{ padding: "8px 10px" }}>{(row.rescoredWithOverride * 100).toFixed(2)}%</td>
                    <td style={{ padding: "8px 10px", color: delta >= 0 ? colors.success : colors.danger }}>
                      {delta >= 0 ? "+" : ""}
                      {(delta * 100).toFixed(2)} pts
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
