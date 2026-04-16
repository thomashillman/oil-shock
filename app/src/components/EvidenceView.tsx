export interface EvidenceItem {
  evidence_key: string;
  evidence_group: string;
  observed_at: string;
  contribution: number;
  details_json: string;
}

export interface EvidenceData {
  generated_at: string;
  evidence: EvidenceItem[];
}

export function EvidenceView({ data, error }: { data: EvidenceData | null; error: string | null }) {
  if (error) {
    return (
      <div style={{ margin: 20, padding: 16, background: "#fff", borderRadius: 12, color: "#6b7280", fontSize: 14 }}>
        {error}
      </div>
    );
  }
  if (!data || data.evidence.length === 0) return null;

  const groups = data.evidence.reduce<Record<string, EvidenceItem[]>>((acc, item) => {
    (acc[item.evidence_group] ??= []).push(item);
    return acc;
  }, {});

  return (
    <section style={{ padding: "20px 20px 0" }}>
      <h2
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: "#9ca3af",
          textTransform: "uppercase",
          letterSpacing: "0.14em",
          marginBottom: 12,
        }}
      >
        Evidence
      </h2>

      {Object.entries(groups).map(([group, items]) => (
        <div
          key={group}
          style={{ background: "#fff", borderRadius: 12, marginBottom: 12, overflow: "hidden" }}
        >
          <div
            style={{
              padding: "10px 16px",
              fontSize: 10,
              fontWeight: 700,
              color: "#9ca3af",
              textTransform: "uppercase",
              letterSpacing: "0.14em",
              borderBottom: "1px solid #f3f4f6",
            }}
          >
            {group}
          </div>

          {items.map((item, i) => {
            const pct = Math.abs(item.contribution * 100);
            const positive = item.contribution >= 0;
            const barColor = positive ? "#dc2626" : "#16a34a";
            const valueColor = positive ? "#dc2626" : "#16a34a";

            return (
              <div
                key={item.evidence_key}
                style={{
                  padding: "12px 16px",
                  borderBottom: i < items.length - 1 ? "1px solid #f9fafb" : "none",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    marginBottom: 7,
                  }}
                >
                  <span
                    style={{
                      fontSize: 13,
                      color: "#111827",
                      fontFamily: "ui-monospace, 'Cascadia Code', monospace",
                    }}
                  >
                    {item.evidence_key}
                  </span>
                  <span
                    style={{
                      fontSize: 13,
                      fontWeight: 700,
                      color: valueColor,
                      fontVariantNumeric: "tabular-nums",
                    }}
                  >
                    {positive ? "+" : "−"}
                    {pct.toFixed(1)}%
                  </span>
                </div>

                <div style={{ height: 3, background: "#f3f4f6", borderRadius: 2, overflow: "hidden", marginBottom: 6 }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(pct, 100)}%`,
                      background: barColor,
                      borderRadius: 2,
                    }}
                  />
                </div>

                <div style={{ fontSize: 11, color: "#9ca3af" }}>
                  {new Date(item.observed_at).toLocaleDateString(undefined, {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                  })}
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </section>
  );
}
