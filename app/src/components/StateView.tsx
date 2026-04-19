import { FRESHNESS_LABEL, DISLOCATION_STATE_LABEL } from "../labels";

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
  physicalStress: number;
  priceSignal: number;
  marketResponse: number;
}

export type SubscoreKey = keyof Subscores;

export const SUBSCORE_KEYS: readonly SubscoreKey[] = [
  "physicalStress",
  "priceSignal",
  "marketResponse",
] as const;

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
    sourceQuality: Record<SubscoreKey, Freshness>;
  };
  subscores: Subscores;
  clocks: {
    shock: Clock;
    dislocation: Clock;
    transmission: Clock;
  };
  ledgerImpact: LedgerImpact | null;
  coverageConfidence: number;
  sourceFreshness: Record<SubscoreKey, Freshness>;
  evidenceIds: string[];
}

const STATE_BG: Record<DislocationState, string> = {
  aligned: "#1a3a4a",
  mild_divergence: "#d97706",
  persistent_divergence: "#dc2626",
  deep_divergence: "#7c2d12",
};

const FRESHNESS_DOT: Record<Freshness, string> = {
  fresh: "#4ade80",
  stale: "#fbbf24",
  missing: "#f87171",
};

const FRESHNESS_TEXT: Record<Freshness, string> = {
  fresh: "current",
  stale: "aging",
  missing: "missing",
};

const SUBSCORE_COLOR: Record<SubscoreKey, string> = {
  physicalStress: "#dc2626",
  priceSignal: "#2563eb",
  marketResponse: "#d97706",
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
  const sanitizedScore = Number.isFinite(score) ? Math.min(Math.max(score, 0), 1) : 0;
  const percentage = Math.round(sanitizedScore * 100);
  const isMuted = percentage === 0;
  return (
    <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
      {/* Accent bar */}
      <div
        style={{
          width: 3,
          height: 28,
          background: color,
          borderRadius: 2,
          flexShrink: 0,
          marginTop: 0,
        }}
      />

      {/* Label and value */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, marginBottom: 6 }}
        >
          <span style={{ color: "#6b7280", fontWeight: 500, fontSize: 12 }}>{label}</span>
          <span
            style={{
              fontFamily: '"JetBrains Mono", "Courier New", monospace',
              fontSize: 12,
              fontWeight: 600,
              color: isMuted ? "#d1d5db" : "#111827",
              flexShrink: 0,
            }}
          >
            {percentage}%
          </span>
        </div>

        {/* Bar */}
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
  if (error) {
    return (
      <div
        style={{
          margin: 20,
          padding: 16,
          background: "#fff",
          borderRadius: 12,
          color: "#6b7280",
          fontSize: 14,
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
          margin: 20,
          padding: 16,
          background: "#fff",
          borderRadius: 12,
          color: "#6b7280",
          fontSize: 14,
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

  const allFresh = SUBSCORE_KEYS.every((k) => data.sourceFreshness[k] === "fresh");

  const latestPt = history[0];
  const prevPt = history[1];
  const delta =
    latestPt !== undefined && prevPt !== undefined
      ? latestPt.mismatchScore - prevPt.mismatchScore
      : null;

  return (
    <section>
      {/* Hero band */}
      <div style={{ background: bg, padding: "24px 20px", color: "#fff" }}>
        {/* State label badge */}
        <div style={{ marginBottom: 14 }}>
          <span
            style={{
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
              background: "rgba(0,0,0,0.2)",
              padding: "3px 10px",
              borderRadius: 100,
            }}
          >
            {stateLabel}
          </span>
        </div>

        {/* Score row: number + delta chip + sparkline */}
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 4 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
            <span
              style={{
                fontSize: 48,
                fontWeight: 800,
                letterSpacing: "-0.03em",
                lineHeight: 1,
                fontVariantNumeric: "tabular-nums",
              }}
            >
              {mismatchPct}%
            </span>
            <span style={{ fontSize: 13, opacity: 0.7 }}>mismatch</span>
          </div>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "flex-end",
              gap: 3,
            }}
          >
            {delta !== null && Math.abs(delta) >= 0.005 && (
              <span
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: delta > 0 ? "#fca5a5" : "#86efac",
                  letterSpacing: "-0.01em",
                }}
              >
                {delta > 0 ? "↑" : "↓"}&nbsp;{Math.abs(Math.round(delta * 100))}pp
              </span>
            )}
            <Sparkline history={history} />
          </div>
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
            SUBSCORE_KEYS.map((key) => {
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

      {/* Three clocks — completely hidden when aligned */}
      {!isAligned && (
        <div style={{ background: "#fff", borderBottom: "1px solid #f3f4f6", display: "flex" }}>
          <ClockDisplay clock={data.clocks.shock} label="Shock age" />
          <ClockDisplay clock={data.clocks.dislocation} label="Dislocation age" />
          <ClockDisplay clock={data.clocks.transmission} label="Transmission age" />
        </div>
      )}

      {/* Subscores — color-coded by role */}
      <div
        style={{ background: "#fff", padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}
      >
        <div
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "#6b7280",
            textTransform: "uppercase",
            letterSpacing: "0.03em",
            marginBottom: 12,
          }}
        >
          Score breakdown
        </div>
        <SubscoreBar
          score={data.subscores.physicalStress}
          label="Physical pressure"
          color={SUBSCORE_COLOR.physicalStress}
        />
        <SubscoreBar
          score={data.subscores.priceSignal}
          label="Price signal"
          color={SUBSCORE_COLOR.priceSignal}
        />
        <SubscoreBar
          score={data.subscores.marketResponse}
          label="Market response"
          color={SUBSCORE_COLOR.marketResponse}
        />
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
