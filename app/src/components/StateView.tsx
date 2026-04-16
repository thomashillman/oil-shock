import { FRESHNESS_LABEL, DISLOCATION_STATE_LABEL, DISLOCATION_STATE_DESCRIPTION } from "../labels";

type Freshness = "fresh" | "stale" | "missing";
type DislocationState = "aligned" | "mild_divergence" | "persistent_divergence" | "deep_divergence";

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
  aligned: "#6b7280",
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

function ClockDisplay({ clock, label }: { clock: Clock; label: string }) {
  return (
    <div style={{ padding: "12px 16px", borderRight: "1px solid #f3f4f6" }}>
      <div style={{ fontSize: 10, fontWeight: 600, color: "#9ca3af", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: "#111827", marginBottom: 2 }}>{clock.label}</div>
      <div style={{ fontSize: 11, color: "#6b7280" }}>
        {clock.classification === "acute" ? "Early phase" : clock.classification === "emerging" ? "Emerging" : "Sustained"}
      </div>
    </div>
  );
}

function SubscoreBar({ score, label }: { score: number; label: string }) {
  const percentage = Math.round(score * 100);
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: 11 }}>
        <span style={{ color: "#6b7280", fontWeight: 500 }}>{label}</span>
        <span style={{ color: "#111827", fontWeight: 600 }}>{percentage}%</span>
      </div>
      <div style={{ height: 4, background: "#f3f4f6", borderRadius: 2, overflow: "hidden" }}>
        <div
          style={{
            height: "100%",
            width: `${percentage}%`,
            background: "#2563eb",
            borderRadius: 2,
            transition: "width 0.3s ease",
          }}
        />
      </div>
    </div>
  );
}

export function StateView({ data, error }: { data: StateData | null; error: string | null }) {
  if (error) {
    return (
      <div style={{ margin: 20, padding: 16, background: "#fff", borderRadius: 12, color: "#6b7280", fontSize: 14 }}>
        {error}
      </div>
    );
  }
  if (!data) return null;

  // Guard: new fields may be absent if the worker hasn't been redeployed yet
  if (!data.dislocationState || !data.clocks || !data.subscores) {
    return (
      <div style={{ margin: 20, padding: 16, background: "#fff", borderRadius: 12, color: "#6b7280", fontSize: 14 }}>
        State data is incomplete — the API worker may not be fully deployed yet.
      </div>
    );
  }

  const bg = STATE_BG[data.dislocationState];
  const mismatchPct = Math.round(data.mismatchScore * 100);
  const coveragePct = Math.round(data.coverageConfidence * 100);
  const stateLabel = DISLOCATION_STATE_LABEL[data.dislocationState];

  return (
    <section>
      {/* Hero band */}
      <div style={{ background: bg, padding: "24px 20px", color: "#fff" }}>
        {/* State label badge */}
        <div style={{ marginBottom: 16 }}>
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

        {/* Score display */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 12 }}>
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

        {/* State rationale */}
        <p style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.95, maxWidth: 380, marginBottom: 2 }}>
          {data.stateRationale}
        </p>

        {/* Freshness pills */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 16 }}>
          {(["physical", "recognition", "transmission"] as const).map((key) => {
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
          })}
        </div>
      </div>

      {/* Three clocks display */}
      <div style={{ background: "#fff", borderBottom: "1px solid #f3f4f6", display: "flex" }}>
        <ClockDisplay clock={data.clocks.shock} label="Shock age" />
        <ClockDisplay clock={data.clocks.dislocation} label="Dislocation age" />
        <ClockDisplay clock={data.clocks.transmission} label="Transmission age" />
      </div>

      {/* Subscores */}
      <div style={{ background: "#fff", padding: "16px 20px", borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.03em", marginBottom: 12 }}>
          Score breakdown
        </div>
        <SubscoreBar score={data.subscores.physical} label="Physical pressure" />
        <SubscoreBar score={data.subscores.recognition} label="Market recognition" />
        <SubscoreBar score={data.subscores.transmission} label="Transmission pressure" />
      </div>

      {/* Ledger impact */}
      {data.ledgerImpact && (
        <div style={{ background: "#fff", padding: "12px 20px", borderBottom: "1px solid #f3f4f6", fontSize: 12 }}>
          <span style={{ color: "#6b7280", fontWeight: 600 }}>Ledger adjustment: </span>
          <span style={{ color: "#111827" }}>
            {data.ledgerImpact.direction === "increase" ? "+" : "−"}
            {Math.round(data.ledgerImpact.magnitude * 100)}%
          </span>
          <span style={{ color: "#9ca3af", marginLeft: 8 }}>({data.ledgerImpact.rationale})</span>
        </div>
      )}

      {/* Coverage bar */}
      <div style={{ background: "#fff", padding: "12px 20px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", letterSpacing: "0.03em" }}>
              Data confidence
            </span>
            <span style={{ fontSize: 11, color: "#9ca3af" }}>based on source freshness</span>
          </div>
          <span
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "#374151",
              fontVariantNumeric: "tabular-nums",
            }}
          >
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
