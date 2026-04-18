import { evidenceLabel, groupMeta, classificationLabel, coverageLabel } from "../labels";
import { theme } from "../theme";
import { useIsMobile } from "../hooks/useMediaQuery";
import { useDarkMode } from "../hooks/useDarkMode";

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
  const color = positive ? theme.colors.classification.falsifier : theme.colors.classification.confirming;
  return (
    <div
      style={{
        height: "5px",
        background: "var(--bg-tertiary)",
        borderRadius: theme.radius.sm,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${Math.min(pct, 100)}%`,
          background: color,
          borderRadius: theme.radius.sm,
          transition: `width ${theme.transitions.normal}`,
        }}
      />
    </div>
  );
}

function EvidenceItem({ item, accent }: { item: EvidenceItem; accent: string }) {
  const pct = Math.abs(item.contribution * 100);
  const positive = item.contribution >= 0;
  const classColor = CLASSIFICATION_COLOR[item.classification] ?? "var(--text-secondary)";

  return (
    <div
      style={{
        padding: `${theme.spacing.lg} ${theme.spacing.xl}`,
        borderBottom: `1px solid var(--border-primary)`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: theme.spacing.md,
        }}
      >
        <span
          style={{
            fontSize: theme.typography.sizes.lg,
            color: "var(--text-primary)",
            fontWeight: theme.typography.weights.medium,
          }}
        >
          {evidenceLabel(item.evidenceKey)}
        </span>
        <span
          style={{
            fontSize: theme.typography.sizes.base,
            fontWeight: theme.typography.weights.semibold,
            color: classColor,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {classificationLabel(item.classification)}
        </span>
      </div>

      <ContributionBar pct={pct} positive={positive} />

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: theme.spacing.md,
          fontSize: theme.typography.sizes.sm,
          gap: theme.spacing.lg,
        }}
      >
        <span style={{ color: "var(--text-secondary)" }}>{coverageLabel(item.coverage)}</span>
        <span style={{ color: "var(--text-tertiary)", textAlign: "right" }}>
          {new Date(item.observedAt).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          })}
        </span>
      </div>
    </div>
  );
}

function EvidenceColumn({ groupLabel, items, accent }: { groupLabel: string; items: EvidenceItem[]; accent: string }) {
  const meta = groupMeta(groupLabel);
  return (
    <div
      style={{
        background: "var(--bg-primary)",
        borderRadius: theme.radius.lg,
        overflow: "hidden",
        borderLeft: `3px solid ${accent}`,
        border: `1px solid var(--border-primary)`,
      }}
    >
      <div
        style={{
          padding: `${theme.spacing.lg} ${theme.spacing.xl}`,
          borderBottom: `1px solid var(--border-primary)`,
        }}
      >
        <div
          style={{
            fontSize: theme.typography.sizes.sm,
            fontWeight: theme.typography.weights.bold,
            color: accent,
            textTransform: "uppercase",
            letterSpacing: theme.letterSpacing.wider,
            marginBottom: theme.spacing.sm,
          }}
        >
          {meta.label}
        </div>
        {meta.description && (
          <p
            style={{
              fontSize: theme.typography.sizes.sm,
              color: "var(--text-secondary)",
              lineHeight: theme.typography.lineHeights.snug,
              margin: 0,
            }}
          >
            {meta.description}
          </p>
        )}
      </div>

      {items.map((item) => (
        <EvidenceItem key={item.evidenceKey} item={item} accent={accent} />
      ))}
    </div>
  );
}

export function EvidenceView({ data, error }: { data: EvidenceData | null; error: string | null }) {
  const isMobile = useIsMobile();
  const { isDarkMode } = useDarkMode();

  if (error) {
    return (
      <div
        style={{
          margin: theme.spacing.xl,
          padding: theme.spacing.xl,
          background: "var(--bg-primary)",
          borderRadius: theme.radius.lg,
          color: "var(--text-secondary)",
          fontSize: theme.typography.sizes.base,
          border: `1px solid var(--border-primary)`,
        }}
      >
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

  const gridColumns = isMobile ? 1 : 2;
  const gridGap = isMobile ? theme.spacing.xl : theme.spacing.lg;

  return (
    <section style={{ padding: `${theme.spacing.xxl} ${theme.spacing.xl} 0` }}>
      <h2
        style={{
          fontSize: theme.typography.sizes.sm,
          fontWeight: theme.typography.weights.bold,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: theme.letterSpacing.widest,
          marginBottom: theme.spacing.lg,
        }}
      >
        Evidence Frame
      </h2>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${gridColumns}, 1fr)`,
          gap: gridGap,
          marginBottom: theme.spacing.xxxl,
        }}
      >
        {orderedGroups.map((group) => {
          const accent = GROUP_ACCENT[group] ?? "var(--text-secondary)";
          return (
            <EvidenceColumn key={group} groupLabel={group} items={groups[group]!} accent={accent} />
          );
        })}
      </div>
    </section>
  );
}
