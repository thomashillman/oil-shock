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
    return <p style={{ color: "#6b7280", fontSize: 14 }}>{error}</p>;
  }
  if (!data || data.evidence.length === 0) return null;

  const groups = data.evidence.reduce<Record<string, EvidenceItem[]>>((acc, item) => {
    (acc[item.evidence_group] ??= []).push(item);
    return acc;
  }, {});

  return (
    <section>
      <h2
        style={{
          fontSize: 11,
          fontWeight: 600,
          color: "#9ca3af",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 16,
        }}
      >
        Evidence
      </h2>
      {Object.entries(groups).map(([group, items]) => (
        <div key={group} style={{ marginBottom: 28 }}>
          <h3 style={{ fontSize: 13, fontWeight: 600, color: "#374151", marginBottom: 8 }}>{group}</h3>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: "2px solid #e5e7eb" }}>
                <th style={{ textAlign: "left", padding: "6px 0", color: "#9ca3af", fontWeight: 500 }}>
                  Signal
                </th>
                <th style={{ textAlign: "left", padding: "6px 0", color: "#9ca3af", fontWeight: 500 }}>
                  Observed
                </th>
                <th style={{ textAlign: "right", padding: "6px 0", color: "#9ca3af", fontWeight: 500 }}>
                  Contribution
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.evidence_key} style={{ borderBottom: "1px solid #f3f4f6" }}>
                  <td style={{ padding: "8px 0", color: "#111827" }}>{item.evidence_key}</td>
                  <td style={{ padding: "8px 0", color: "#6b7280" }}>
                    {new Date(item.observed_at).toLocaleDateString()}
                  </td>
                  <td style={{ padding: "8px 0", textAlign: "right", fontWeight: 600, color: "#374151" }}>
                    {item.contribution >= 0 ? "+" : ""}
                    {(item.contribution * 100).toFixed(1)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}
