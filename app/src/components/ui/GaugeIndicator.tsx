import type { CSSProperties } from "react";
import { theme } from "../../theme";

interface GaugeIndicatorProps {
  value: number; // 0-1
  label: string;
  color: string;
  dangerZone?: number; // 0-1, where red zone starts
  showLabel?: boolean;
}

export function GaugeIndicator({
  value,
  label,
  color,
  dangerZone = 0.75,
  showLabel = true,
}: GaugeIndicatorProps) {
  const percentage = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  const inDanger = value >= dangerZone;

  return (
    <div style={{ marginBottom: theme.spacing.xl }}>
      {showLabel && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: theme.spacing.md,
            fontSize: theme.typography.sizes.sm,
          }}
        >
          <span style={{ color: "var(--text-secondary)" }}>{label}</span>
          <span
            style={{
              fontFamily: theme.typography.monoStack,
              color: inDanger ? "var(--color-missing)" : color,
              fontWeight: 700,
              letterSpacing: theme.letterSpacing.wide,
            }}
          >
            {percentage}%
          </span>
        </div>
      )}

      {/* Gauge container - vertical bar with danger zone */}
      <div
        style={{
          position: "relative",
          height: "120px",
          background: "var(--bg-tertiary)",
          border: `1px solid var(--border-primary)`,
          borderRadius: "2px",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column-reverse",
        }}
      >
        {/* Danger zone indicator (red region) */}
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: `${Math.max(100 - dangerZone * 100, 0)}%`,
            background: "rgba(255, 51, 51, 0.2)",
            borderTop: "1px dashed rgba(255, 51, 51, 0.5)",
          }}
        />

        {/* Fill bar (actual value) */}
        <div
          style={{
            height: `${percentage}%`,
            background:
              inDanger ? "var(--color-missing)" : color,
            transition: "all 250ms ease-in-out",
            boxShadow: inDanger
              ? "0 0 12px rgba(255, 51, 51, 0.6)"
              : "0 0 8px rgba(0, 200, 255, 0.2)",
          }}
        />

        {/* Threshold line */}
        <div
          style={{
            position: "absolute",
            bottom: `${dangerZone * 100}%`,
            left: 0,
            right: 0,
            height: "2px",
            background: "rgba(255, 51, 51, 0.6)",
            zIndex: 2,
          }}
        />
      </div>
    </div>
  );
}
