import { evidenceLabel, groupMeta, classificationLabel, coverageLabel } from "../labels";

export interface EvidenceItem {
  evidenceKey: string;
  evidenceGroup: string;
  evidenceGroupLabel: string;
  observedAt: string;
  contribution: number;
  classification: string;
  coverage: string;
  details: Record<string, unknown>;
}

export interface EvidenceData {
  generatedAt: string;
  evidence: EvidenceItem[];
}

const GROUP_ACCENT: Record<string, string> = {
  physical_reality: "#dc2626",
  market_recognition: "#d97706",
  transmission_pressure: "#2563eb",
  physical: "#dc2626",
  recognition: "#d97706",
  transmission: "#2563eb",
};

const CLASSIFICATION_COLOR: Record<string, string> = {
  confirming: "#16a34a",
  counterevidence: "#f97316",
  falsifier: "#dc2626",
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

function EvidenceItem({ item, accent }: { item: EvidenceItem; accent: string }) {
  const pct = Math.abs(item.contribution * 100);
  const positive = item.contribution >= 0;
  const classColor = CLASSIFICATION_COLOR[item.classification] ?? "#6b7280";

  return (
    <div style={{ padding: "12px 16px", borderBottom: "1px solid #f9fafb" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <span style={{ fontSize: 13, color: "#111827", fontWeight: 500 }}>
          {evidenceLabel(item.evidenceKey)}
        </span>
        <span
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: classColor,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {classificationLabel(item.classification)}
        </span>
      </div>

      <ContributionBar pct={pct} positive={positive} />

      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontSize: 11, gap: 8 }}>
        <span style={{ color: "#6b7280" }}>{coverageLabel(item.coverage)}</span>
        <span style={{ color: "#9ca3af", textAlign: "right" }}>
          {new Date(item.observedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </div>
  );
}

function EvidenceGroup({ groupLabel, items, accent }: { groupLabel: string; items: EvidenceItem[]; accent: string }) {
  const meta = groupMeta(groupLabel);
  return (
    <div style={{ marginBottom: 16 }}>
      {/* Group header with accent bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          paddingLeft: 20,
          paddingRight: 20,
          paddingTop: 16,
          paddingBottom: 12,
          background: "#fff",
          borderBottom: "1px solid #f3f4f6",
        }}
      >
        <div
          style={{
            width: 3,
            height: 24,
            background: accent,
            borderRadius: 2,
            flexShrink: 0,
          }}
        />
        <div style={{ flex: 1 }}>
          <div
            style={{
              fontSize: 10,
              fontWeight: 700,
              color: accent,
              textTransform: "uppercase",
              letterSpacing: "0.12em",
              marginBottom: 2,
            }}
          >
            {meta.label}
          </div>
          {meta.description && (
            <p style={{ fontSize: 11, color: "#6b7280", lineHeight: 1.3, margin: 0 }}>
              {meta.description}
            </p>
          )}
        </div>
      </div>

      {/* Evidence items in full-width stacked layout */}
      <div style={{ background: "#fff" }}>
        {items.map((item) => (
          <EvidenceItem key={item.evidenceKey} item={item} accent={accent} />
        ))}
      </div>
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
    const groupKey = item.evidenceGroupLabel || item.evidenceGroup;
    (acc[groupKey] ??= []).push(item);
    return acc;
  }, {});

  const orderedGroups = ["physical_reality", "market_recognition", "transmission_pressure"].filter(
    (group) => groups[group]
  );

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
        Evidence Frame
      </h2>

      {orderedGroups.map((group) => {
        const accent = GROUP_ACCENT[group] ?? "#6b7280";
        return (
          <EvidenceGroup key={group} groupLabel={group} items={groups[group]!} accent={accent} />
        );
      })}

      <div style={{ height: 20 }} />
    </section>
  );
}
