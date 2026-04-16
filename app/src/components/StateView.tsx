type Freshness = "fresh" | "stale" | "missing";
type ActionabilityState = "none" | "watch" | "actionable";

export interface StateData {
  generated_at: string;
  mismatch_score: number;
  actionability_state: ActionabilityState;
  coverage_confidence: number;
  source_freshness: {
    physical: Freshness;
    recognition: Freshness;
    transmission: Freshness;
  };
  evidence_ids: string[];
}

const STATE_BG: Record<ActionabilityState, string> = {
  none: "#6b7280",
  watch: "#d97706",
  actionable: "#dc2626",
};

const FRESHNESS_DOT: Record<Freshness, string> = {
  fresh: "#4ade80",
  stale: "#fbbf24",
  missing: "#f87171",
};

export function StateView({ data, error }: { data: StateData | null; error: string | null }) {
  if (error) {
    return (
      <div style={{ margin: 20, padding: 16, background: "#fff", borderRadius: 12, color: "#6b7280", fontSize: 14 }}>
        {error}
      </div>
    );
  }
  if (!data) return null;

  const bg = STATE_BG[data.actionability_state];
  const mismatchPct = Math.round(data.mismatch_score * 100);
  const coveragePct = Math.round(data.coverage_confidence * 100);

  return (
    <section>
      {/* Hero band */}
      <div style={{ background: bg, padding: "32px 20px 28px", color: "#fff" }}>
        <div
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            opacity: 0.75,
            marginBottom: 10,
          }}
        >
          State
        </div>
        <div style={{ fontSize: 40, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1, marginBottom: 8 }}>
          {data.actionability_state}
        </div>
        <div style={{ fontSize: 16, opacity: 0.85 }}>{mismatchPct}% mismatch</div>

        {/* Freshness dots */}
        <div style={{ display: "flex", gap: 18, marginTop: 22 }}>
          {(["physical", "recognition", "transmission"] as const).map((key) => (
            <div key={key} style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: FRESHNESS_DOT[data.source_freshness[key]],
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 12, opacity: 0.85, textTransform: "capitalize" }}>{key}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Coverage bar */}
      <div style={{ background: "#fff", padding: "14px 20px", borderBottom: "1px solid #f3f4f6" }}>
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 7 }}
        >
          <span style={{ fontSize: 12, color: "#6b7280" }}>Coverage confidence</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#374151", fontVariantNumeric: "tabular-nums" }}>
            {coveragePct}%
          </span>
        </div>
        <div style={{ height: 4, background: "#f3f4f6", borderRadius: 2, overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: `${coveragePct}%`,
              background: bg,
              borderRadius: 2,
              transition: "width 0.4s ease",
            }}
          />
        </div>
      </div>
    </section>
  );
}
