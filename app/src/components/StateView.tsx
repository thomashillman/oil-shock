import { FRESHNESS_LABEL, STATE_SUBTITLE, STATE_TAGLINE } from "../labels";

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

const STATE_BG: Record<ActionabilityState, string> = {
  none: "#6b7280",
  watch: "#d97706",
  actionable: "#dc2626",
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

const WATCH_THRESHOLD = 40;
const ACTIONABLE_THRESHOLD = 65;

function ThresholdScale({ score, bg }: { score: number; bg: string }) {
  return (
    <div style={{ marginTop: 24 }}>
      {/* Bar */}
      <div style={{ position: "relative", height: 4, background: "rgba(255,255,255,0.22)", borderRadius: 2 }}>
        <div
          style={{
            height: "100%",
            width: `${score}%`,
            background: "rgba(255,255,255,0.9)",
            borderRadius: 2,
            transition: "width 0.4s ease",
          }}
        />
        {/* Tick marks */}
        {[WATCH_THRESHOLD, ACTIONABLE_THRESHOLD].map((tick) => (
          <div
            key={tick}
            style={{
              position: "absolute",
              left: `${tick}%`,
              top: "50%",
              transform: "translate(-50%, -50%)",
              width: 1,
              height: 10,
              background: "rgba(255,255,255,0.45)",
            }}
          />
        ))}
      </div>

      {/* Zone labels */}
      <div style={{ position: "relative", height: 18, marginTop: 5 }}>
        <span style={{ position: "absolute", left: 0, fontSize: 10, opacity: 0.6 }}>none</span>
        <span
          style={{ position: "absolute", left: `${WATCH_THRESHOLD}%`, transform: "translateX(-50%)", fontSize: 10, opacity: 0.6 }}
        >
          watch
        </span>
        <span
          style={{ position: "absolute", left: `${ACTIONABLE_THRESHOLD}%`, transform: "translateX(-30%)", fontSize: 10, opacity: 0.6 }}
        >
          actionable
        </span>
        <span
          style={{
            position: "absolute",
            left: `${score}%`,
            transform: "translateX(-50%)",
            fontSize: 11,
            fontWeight: 700,
            opacity: 0.95,
            marginTop: -1,
          }}
        >
          {score}%
        </span>
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

  const bg = STATE_BG[data.actionability_state];
  const mismatchPct = Math.round(data.mismatch_score * 100);
  const coveragePct = Math.round(data.coverage_confidence * 100);

  return (
    <section>
      {/* Hero band */}
      <div style={{ background: bg, padding: "28px 20px 24px", color: "#fff" }}>
        {/* Tagline */}
        <p style={{ fontSize: 16, fontWeight: 400, lineHeight: 1.45, marginBottom: 18, opacity: 0.95, maxWidth: 340 }}>
          {STATE_TAGLINE[data.actionability_state]}
        </p>

        {/* State badge + subtitle */}
        <div style={{ marginBottom: 4 }}>
          <span
            style={{
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              background: "rgba(0,0,0,0.18)",
              padding: "3px 8px",
              borderRadius: 4,
            }}
          >
            {data.actionability_state}
          </span>
        </div>
        <p style={{ fontSize: 12, opacity: 0.7, marginBottom: 4 }}>
          {STATE_SUBTITLE[data.actionability_state]}
        </p>

        {/* Threshold scale */}
        <ThresholdScale score={mismatchPct} bg={bg} />

        {/* Freshness row */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14, marginTop: 20 }}>
          {(["physical", "recognition", "transmission"] as const).map((key) => {
            const freshness = data.source_freshness[key];
            return (
              <div key={key} style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <span
                  style={{
                    display: "inline-block",
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: FRESHNESS_DOT[freshness],
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 12, opacity: 0.8 }}>
                  {FRESHNESS_LABEL[key]}{" "}
                  <span style={{ opacity: 0.65 }}>({FRESHNESS_TEXT[freshness]})</span>
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Coverage bar */}
      <div style={{ background: "#fff", padding: "14px 20px", borderBottom: "1px solid #f3f4f6" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <div>
            <span style={{ fontSize: 12, color: "#374151", fontWeight: 500 }}>Data confidence</span>
            <span style={{ fontSize: 11, color: "#9ca3af", marginLeft: 6 }}>
              based on source freshness
            </span>
          </div>
          <span style={{ fontSize: 13, fontWeight: 700, color: "#374151", fontVariantNumeric: "tabular-nums" }}>
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
