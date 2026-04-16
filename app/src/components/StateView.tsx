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

const STATE_COLORS: Record<ActionabilityState, string> = {
  none: "#6b7280",
  watch: "#d97706",
  actionable: "#dc2626",
};

const FRESHNESS_COLORS: Record<Freshness, string> = {
  fresh: "#16a34a",
  stale: "#d97706",
  missing: "#dc2626",
};

function FreshnessBadge({ value }: { value: Freshness }) {
  return (
    <span style={{ color: FRESHNESS_COLORS[value], fontWeight: 600, textTransform: "capitalize" }}>
      {value}
    </span>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ padding: 16, background: "#f9fafb", borderRadius: 8 }}>
      <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: "#111827" }}>{value}</div>
    </div>
  );
}

export function StateView({ data, error }: { data: StateData | null; error: string | null }) {
  if (error) {
    return <p style={{ color: "#6b7280", marginBottom: 32, fontSize: 14 }}>{error}</p>;
  }
  if (!data) return null;

  const stateColor = STATE_COLORS[data.actionability_state];

  return (
    <section style={{ marginBottom: 40 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
        <span
          style={{
            background: stateColor,
            color: "#fff",
            padding: "4px 12px",
            borderRadius: 4,
            fontWeight: 700,
            fontSize: 13,
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          {data.actionability_state}
        </span>
        <span style={{ color: "#9ca3af", fontSize: 12 }}>
          {new Date(data.generated_at).toLocaleString()}
        </span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
        <Metric label="Mismatch Score" value={(data.mismatch_score * 100).toFixed(1) + "%"} />
        <Metric label="Coverage" value={(data.coverage_confidence * 100).toFixed(1) + "%"} />
      </div>

      <h2
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#9ca3af",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 8,
        }}
      >
        Source Freshness
      </h2>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
        <tbody>
          {(["physical", "recognition", "transmission"] as const).map((key) => (
            <tr key={key} style={{ borderBottom: "1px solid #f3f4f6" }}>
              <td style={{ padding: "9px 0", color: "#374151", textTransform: "capitalize" }}>{key}</td>
              <td style={{ padding: "9px 0", textAlign: "right" }}>
                <FreshnessBadge value={data.source_freshness[key]} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
