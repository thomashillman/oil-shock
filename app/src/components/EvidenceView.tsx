import { evidenceLabel, groupMeta } from "../labels";

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

const GROUP_ACCENT: Record<string, string> = {
  physical: "#dc2626",
  recognition: "#d97706",
  transmission: "#2563eb",
};

function ContributionBar({ pct, positive }: { pct: number; positive: boolean }) {
  const color = positive ? "#dc2626" : "#16a34a";
  return (
    <div style={{ height: 5, background: "#f3f4f6", borderRadius: 3, overflow: "hidden" }}>
      <div
        style={{
          height: "100%",
          width: `${Math.min(pct, 100)}%`,
          background: color,
          borderRadius: 3,
          transition: "width 0.3s ease",
        }}
      />
    </div>
  );
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

      {Object.entries(groups).map(([group, items]) => {
        const meta = groupMeta(group);
        const accent = GROUP_ACCENT[group] ?? "#6b7280";
        return (
          <div
            key={group}
            style={{
              background: "#fff",
              borderRadius: 12,
              marginBottom: 12,
              overflow: "hidden",
              borderLeft: `3px solid ${accent}`,
            }}
          >
            {/* Group header */}
            <div style={{ padding: "12px 16px 10px", borderBottom: "1px solid #f3f4f6" }}>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 700,
                  color: accent,
                  textTransform: "uppercase",
                  letterSpacing: "0.12em",
                  marginBottom: 3,
                }}
              >
                {meta.label}
              </div>
              {meta.description && (
                <p style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.4 }}>{meta.description}</p>
              )}
            </div>

            {/* Evidence items */}
            {items.map((item, i) => {
              const pct = Math.abs(item.contribution * 100);
              const positive = item.contribution >= 0;
              const valueColor = positive ? "#dc2626" : "#16a34a";
              const directionLabel = positive ? "driving signal" : "moderating signal";

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
                      marginBottom: 8,
                    }}
                  >
                    <span style={{ fontSize: 13, color: "#111827", fontWeight: 500 }}>
                      {evidenceLabel(item.evidence_key)}
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: valueColor,
                        fontVariantNumeric: "tabular-nums",
                        marginLeft: 12,
                        flexShrink: 0,
                      }}
                    >
                      {positive ? "+" : "−"}
                      {pct.toFixed(1)}%
                    </span>
                  </div>

                  <ContributionBar pct={pct} positive={positive} />

                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 7,
                      fontSize: 11,
                    }}
                  >
                    <span style={{ color: valueColor, fontWeight: 500 }}>{directionLabel}</span>
                    <span style={{ color: "#9ca3af" }}>
                      {new Date(item.observed_at).toLocaleDateString(undefined, {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}
    </section>
  );
}
