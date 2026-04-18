import { FRESHNESS_LABEL, DISLOCATION_STATE_LABEL } from "../labels";
import { theme } from "../theme";
import { useIsMobile } from "../hooks/useMediaQuery";
import { useDarkMode } from "../hooks/useDarkMode";
import { usePrefersReducedMotion } from "../hooks/useMediaQuery";
import { SeismicWaveform } from "./ui/SeismicWaveform";
import { GaugeIndicator } from "./ui/GaugeIndicator";

type Freshness = "fresh" | "stale" | "missing";
type DislocationState = "aligned" | "mild_divergence" | "persistent_divergence" | "deep_divergence";

export interface HistoryPoint {
  generatedAt: string;
  mismatchScore: number;
  dislocationState: string;
}

export interface Clock {
  ageSeconds: number;
  label: string;
  classification: "acute" | "chronic" | "emerging";
}

export interface Subscores {
  physical: number;
  recognition: number;
  transmission: number;
}

export interface LedgerImpact {
  direction: "increase" | "decrease";
  magnitude: number;
  rationale: string;
}

export interface StateData {
  generatedAt: string;
  mismatchScore: number;
  dislocationState: DislocationState;
  stateRationale: string;
  actionabilityState: "none" | "watch" | "actionable";
  confidence: {
    coverage: number;
    sourceQuality: {
      physical: Freshness;
      recognition: Freshness;
      transmission: Freshness;
    };
  };
  subscores: Subscores;
  clocks: {
    shock: Clock;
    dislocation: Clock;
    transmission: Clock;
  };
  ledgerImpact: LedgerImpact | null;
  coverageConfidence: number;
  sourceFreshness: {
    physical: Freshness;
    recognition: Freshness;
    transmission: Freshness;
  };
  evidenceIds: string[];
}

const STATE_BG: Record<DislocationState, string> = {
  aligned: theme.colors.states.aligned,
  mild_divergence: theme.colors.states.mild_divergence,
  persistent_divergence: theme.colors.states.persistent_divergence,
  deep_divergence: theme.colors.states.deep_divergence,
};

const FRESHNESS_DOT: Record<Freshness, string> = {
  fresh: theme.colors.freshness.fresh,
  stale: theme.colors.freshness.stale,
  missing: theme.colors.freshness.missing,
};

const FRESHNESS_TEXT: Record<Freshness, string> = {
  fresh: "current",
  stale: "aging",
  missing: "missing",
};

const SUBSCORE_COLOR: Record<keyof Subscores, string> = {
  physical: theme.colors.evidence.physical,
  recognition: theme.colors.evidence.recognition,
  transmission: theme.colors.evidence.transmission,
};

function ThresholdScale({ score }: { score: number }) {
  const pct = Math.min(Math.round(score * 100), 100);
  return (
    <div style={{ marginTop: 10, marginBottom: 4 }}>
      <div
        style={{
          position: "relative",
          height: 5,
          background: "rgba(255,255,255,0.15)",
          borderRadius: 3,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 0,
            top: 0,
            height: "100%",
            width: `${pct}%`,
            background: "rgba(255,255,255,0.4)",
            borderRadius: 3,
            transition: "width 0.4s ease",
          }}
        />
        {([30, 50, 75] as const).map((t) => (
          <div
            key={t}
            style={{
              position: "absolute",
              left: `${t}%`,
              top: 0,
              width: 1,
              height: "100%",
              background: "rgba(255,255,255,0.35)",
            }}
          />
        ))}
      </div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: 3,
          fontSize: 9,
          opacity: 0.45,
          letterSpacing: "0.02em",
        }}
      >
        <span>Aligned</span>
        <span>Mild</span>
        <span>Persistent</span>
        <span>Deep</span>
      </div>
    </div>
  );
}

function Sparkline({ history }: { history: HistoryPoint[] }) {
  if (history.length < 2) return null;
  const pts = [...history].reverse();
  const w = 56;
  const h = 18;
  const xStep = w / (pts.length - 1);
  const points = pts
    .map((p, i) => `${i * xStep},${h - p.mismatchScore * h}`)
    .join(" ");
  return (
    <svg
      viewBox={`0 0 ${w} ${h}`}
      style={{ width: w, height: h, overflow: "visible", display: "block" }}
      aria-hidden
    >
      <polyline
        points={points}
        fill="none"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockDisplay({ clock, label }: { clock: Clock; label: string }) {
  return (
    <div style={{ padding: "12px 16px", borderRight: "1px solid #f3f4f6", flex: 1 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          color: "#9ca3af",
          textTransform: "uppercase",
          letterSpacing: "0.03em",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 2 }}>
        {clock.label}
      </div>
      <div style={{ fontSize: 11, color: "#6b7280" }}>
        {clock.classification === "acute"
          ? "Early phase"
          : clock.classification === "emerging"
            ? "Emerging"
            : "Sustained"}
      </div>
    </div>
  );
}

function SubscoreBar({ score, label, color }: { score: number; label: string; color: string }) {
  const percentage = Math.round(score * 100);
  return (
    <div style={{ marginBottom: 12 }}>
      <div
        style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11 }}
      >
        <span style={{ color: "#6b7280", fontWeight: 500 }}>{label}</span>
        <span style={{ color: "#111827", fontWeight: 600 }}>{percentage}%</span>
      </div>
      <div style={{ height: 4, background: "#f3f4f6", borderRadius: 2, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${percentage}%`,
            background: color,
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

export function StateView({
  data,
  error,
  history,
}: {
  data: StateData | null;
  error: string | null;
  history: HistoryPoint[];
}) {
  const isMobile = useIsMobile();
  const { isDarkMode } = useDarkMode();
  const prefersReducedMotion = usePrefersReducedMotion();
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
  if (!data) return null;

  if (!data.dislocationState || !data.clocks || !data.subscores) {
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
        State data is incomplete — the API worker may not be fully deployed yet.
      </div>
    );
  }

  const bg = STATE_BG[data.dislocationState];
  const mismatchPct = Math.round(data.mismatchScore * 100);
  const coveragePct = Math.round(data.coverageConfidence * 100);
  const stateLabel = DISLOCATION_STATE_LABEL[data.dislocationState];
  const isAligned = data.dislocationState === "aligned";

  const allFresh = (["physical", "recognition", "transmission"] as const).every(
    (k) => data.sourceFreshness[k] === "fresh"
  );

  const latestPt = history[0];
  const prevPt = history[1];
  const delta =
    latestPt !== undefined && prevPt !== undefined
      ? latestPt.mismatchScore - prevPt.mismatchScore
      : null;

  const getGlowColor = (state: string) => {
    switch (state) {
      case "aligned":
        return "rgba(0, 200, 255, 0.15)";
      case "mild_divergence":
        return "rgba(255, 136, 0, 0.15)";
      case "persistent_divergence":
        return "rgba(255, 51, 51, 0.2)";
      case "deep_divergence":
        return "rgba(255, 51, 51, 0.3)";
      default:
        return "rgba(0, 200, 255, 0.1)";
    }
  };

  return (
    <section>
      {/* Hero band - Seismic state visualization */}
      <div
        style={{
          background: bg,
          backgroundImage: `
            repeating-linear-gradient(45deg, transparent, transparent 2px, rgba(255, 255, 255, 0.03) 2px, rgba(255, 255, 255, 0.03) 4px),
            linear-gradient(0deg, ${getGlowColor(data.dislocationState)}, transparent 40%)
          `,
          padding: isMobile ? `${theme.spacing.xxl} ${theme.spacing.xl}` : `${theme.spacing.xxxl} ${theme.spacing.xxl}`,
          color: "#fff",
          position: "relative",
          borderBottom: `2px solid ${
            data.dislocationState === "deep_divergence"
              ? "rgba(255, 51, 51, 0.6)"
              : data.dislocationState === "persistent_divergence"
                ? "rgba(255, 51, 51, 0.4)"
                : "rgba(255, 255, 255, 0.1)"
          }`,
          boxShadow:
            data.dislocationState === "deep_divergence"
              ? `inset 0 0 20px ${getGlowColor(data.dislocationState)}`
              : "none",
        }}
      >
        {/* State label badge - Technical identifier */}
        <div style={{ marginBottom: theme.spacing.xxl }}>
          <span
            style={{
              fontSize: theme.typography.sizes.sm,
              fontWeight: 700,
              letterSpacing: theme.letterSpacing.widest,
              textTransform: "uppercase",
              background: "rgba(0, 0, 0, 0.4)",
              border: `1px solid ${
                data.dislocationState === "deep_divergence"
                  ? "rgba(255, 51, 51, 0.6)"
                  : "rgba(255, 255, 255, 0.2)"
              }`,
              padding: `${theme.spacing.sm} ${theme.spacing.xl}`,
              borderRadius: "2px",
              fontFamily: theme.typography.monoStack,
              display: "inline-block",
            }}
          >
            {stateLabel}
          </span>
        </div>

        {/* Score row: seismic display with waveform */}
        <div style={{ marginBottom: theme.spacing.xxl }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: theme.spacing.xl, marginBottom: theme.spacing.lg }}>
            <span
              style={{
                fontSize: theme.typography.sizes["7xl"],
                fontWeight: 800,
                letterSpacing: theme.letterSpacing.tight,
                lineHeight: 1,
                fontFamily: theme.typography.monoStack,
                fontVariantNumeric: "tabular-nums",
                color: mismatchPct > 75 ? "var(--color-missing)" : "#fff",
                textShadow: mismatchPct > 75 ? "0 0 16px rgba(255, 51, 51, 0.6)" : "none",
              }}
            >
              {mismatchPct}%
            </span>
            <span style={{ fontSize: theme.typography.sizes.lg, opacity: 0.8, marginBottom: theme.spacing.md }}>
              mismatch
            </span>
          </div>

          {/* Delta indicator (pressure direction) */}
          {delta !== null && Math.abs(delta) >= 0.005 && (
            <div style={{ marginBottom: theme.spacing.lg }}>
              <span
                style={{
                  fontSize: theme.typography.sizes.lg,
                  fontWeight: 700,
                  color: delta > 0 ? "var(--color-missing)" : "var(--color-fresh)",
                  fontFamily: theme.typography.monoStack,
                  letterSpacing: theme.letterSpacing.wide,
                }}
              >
                {delta > 0 ? "▲" : "▼"} {Math.abs(Math.round(delta * 100))}pp
              </span>
            </div>
          )}

          {/* Seismic waveform (history visualization) */}
          <SeismicWaveform
            history={history}
            height={50}
            color={
              mismatchPct > 75
                ? "rgba(255, 51, 51, 0.8)"
                : mismatchPct > 50
                  ? "rgba(255, 136, 0, 0.8)"
                  : "rgba(0, 200, 255, 0.6)"
            }
          />
        </div>

        {/* Threshold scale — resolves "ALIGNED + 44%" confusion */}
        <ThresholdScale score={data.mismatchScore} />

        {/* State rationale */}
        <p
          style={{
            fontSize: 13,
            lineHeight: 1.5,
            opacity: 0.9,
            maxWidth: 380,
            marginTop: 10,
            marginBottom: 0,
          }}
        >
          {data.stateRationale}
        </p>

        {/* Freshness pills — collapsed to single chip when all sources fresh */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 14 }}>
          {allFresh ? (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                background: "rgba(0,0,0,0.18)",
                borderRadius: 100,
                padding: "4px 10px 4px 8px",
              }}
            >
              <span
                style={{
                  display: "inline-block",
                  width: 6,
                  height: 6,
                  borderRadius: "50%",
                  background: "#4ade80",
                  flexShrink: 0,
                }}
              />
              <span style={{ fontSize: 11, opacity: 0.9 }}>All sources current</span>
            </div>
          ) : (
            (["physical", "recognition", "transmission"] as const).map((key) => {
              const freshness = data.sourceFreshness[key];
              return (
                <div
                  key={key}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 5,
                    background: "rgba(0,0,0,0.18)",
                    borderRadius: 100,
                    padding: "4px 10px 4px 8px",
                  }}
                >
                  <span
                    style={{
                      display: "inline-block",
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: FRESHNESS_DOT[freshness],
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ fontSize: 11, opacity: 0.9 }}>{FRESHNESS_LABEL[key]}</span>
                  <span style={{ fontSize: 10, opacity: 0.55 }}>{FRESHNESS_TEXT[freshness]}</span>
                </div>
              );
            })
          )}
        </div>

        {/* Coverage confidence — in hero so low confidence qualifies everything below */}
        <div style={{ marginTop: 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 4,
            }}
          >
            <span style={{ fontSize: 10, opacity: 0.65, letterSpacing: "0.02em" }}>
              Data confidence
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, opacity: 0.9 }}>{coveragePct}%</span>
          </div>
          <div
            style={{ height: 3, background: "rgba(0,0,0,0.25)", borderRadius: 2, overflow: "hidden" }}
          >
            <div
              style={{
                height: "100%",
                width: `${coveragePct}%`,
                background: coveragePct >= 60 ? "rgba(255,255,255,0.55)" : "#fbbf24",
                borderRadius: 2,
                transition: "width 0.4s ease",
              }}
            />
          </div>
          {coveragePct < 60 && (
            <p
              style={{ fontSize: 10, color: "#fde68a", opacity: 0.9, marginTop: 5, marginBottom: 0 }}
            >
              Low data confidence — interpret with caution
            </p>
          )}
        </div>
      </div>

      {/* Three clocks — collapsed to single line when aligned */}
      {isAligned ? (
        <div
          style={{
            background: "#fff",
            borderBottom: "1px solid #f3f4f6",
            padding: "11px 20px",
          }}
        >
          <span style={{ fontSize: 12, color: "#9ca3af" }}>
            No active dislocation — clocks inactive
          </span>
        </div>
      ) : (
        <div style={{ background: "#fff", borderBottom: "1px solid #f3f4f6", display: "flex" }}>
          <ClockDisplay clock={data.clocks.shock} label="Shock age" />
          <ClockDisplay clock={data.clocks.dislocation} label="Dislocation age" />
          <ClockDisplay clock={data.clocks.transmission} label="Transmission age" />
        </div>
      )}

      {/* Subscores — gauge indicators showing danger zones */}
      <div
        style={{
          background: "var(--bg-primary)",
          padding: theme.spacing.xxl,
          borderBottom: `1px solid var(--border-primary)`,
          borderLeft: `3px solid rgba(255, 136, 0, 0.6)`,
        }}
      >
        <div
          style={{
            fontSize: theme.typography.sizes.sm,
            fontWeight: 600,
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: theme.letterSpacing.wider,
            marginBottom: theme.spacing.xxl,
          }}
        >
          Pressure Analysis
        </div>
        <div style={{ display: "grid", gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr", gap: theme.spacing.xxl }}>
          <GaugeIndicator
            value={data.subscores.physical}
            label="Physical Pressure"
            color="var(--state-persistent)"
            dangerZone={0.6}
            showLabel
          />
          <GaugeIndicator
            value={data.subscores.recognition}
            label="Market Recognition"
            color="var(--state-mild)"
            dangerZone={0.45}
            showLabel
          />
          <GaugeIndicator
            value={data.subscores.transmission}
            label="Transmission Pressure"
            color="var(--state-persistent)"
            dangerZone={0.5}
            showLabel
          />
        </div>
      </div>

      {/* Ledger impact */}
      {data.ledgerImpact && (
        <div
          style={{
            background: "#fff",
            padding: "12px 20px",
            borderBottom: "1px solid #f3f4f6",
            fontSize: 12,
          }}
        >
          <span style={{ color: "#6b7280", fontWeight: 600 }}>Ledger adjustment: </span>
          <span style={{ color: "#111827" }}>
            {data.ledgerImpact.direction === "increase" ? "+" : "−"}
            {Math.round(data.ledgerImpact.magnitude * 100)}%
          </span>
          <span style={{ color: "#9ca3af", marginLeft: 8 }}>({data.ledgerImpact.rationale})</span>
        </div>
      )}
    </section>
  );
}
