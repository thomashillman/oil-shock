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

function ThresholdScale({ score }: { score: number }) {
  return (
    <div style={{ marginTop: 20 }}>
      {/* Position pointer above bar */}
      <div style={{ position: "relative", height: 14, marginBottom: 2 }}>
        <span
          style={{
            position: "absolute",
            left: `${score}%`,
            transform: "translateX(-50%)",
            fontSize: 10,
            fontWeight: 700,
            color: "rgba(255,255,255,0.95)",
            lineHeight: 1,
          }}
        >
          ▼
        </span>
      </div>

      {/* Bar with zone fills */}
      <div style={{ position: "relative", height: 8, borderRadius: 4, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, display: "flex" }}>
          <div style={{ flex: WATCH_THRESHOLD, background: "rgba(255,255,255,0.08)" }} />
          <div style={{ flex: ACTIONABLE_THRESHOLD - WATCH_THRESHOLD, background: "rgba(255,255,255,0.13)" }} />
          <div style={{ flex: 100 - ACTIONABLE_THRESHOLD, background: "rgba(255,255,255,0.18)" }} />
        </div>
        <div
          style={{
            position: "absolute",
            left: 0,
            width: `${score}%`,
            height: "100%",
            background: "rgba(255,255,255,0.75)",
            transition: "width 0.4s ease",
          }}
        />
        {[WATCH_THRESHOLD, ACTIONABLE_THRESHOLD].map((tick) => (
          <div
            key={tick}
            style={{
              position: "absolute",
              left: `${tick}%`,
              top: 0,
              bottom: 0,
              width: 1,
              background: "rgba(255,255,255,0.4)",
            }}
          />
        ))}
      </div>

      {/* Zone labels */}
      <div style={{ position: "relative", height: 18, marginTop: 5 }}>
        <span style={{ position: "absolute", left: 0, fontSize: 10, color: "rgba(255,255,255,0.6)" }}>
          none
        </span>
        <span
          style={{
            position: "absolute",
            left: `${WATCH_THRESHOLD}%`,
            transform: "translateX(-50%)",
            fontSize: 10,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          watch
        </span>
        <span
          style={{
            position: "absolute",
            left: `${ACTIONABLE_THRESHOLD}%`,
            transform: "translateX(-30%)",
            fontSize: 10,
            color: "rgba(255,255,255,0.6)",
          }}
        >
          actionable
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
      <div style={{ background: bg, padding: "24px 20px 20px", color: "#fff" }}>
        {/* State badge */}
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
            {data.actionability_state}
          </span>
        </div>

        {/* Score hero */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 14 }}>
          <span
            style={{
              fontSize: 56,
              fontWeight: 800,
              letterSpacing: "-0.03em",
              lineHeight: 1,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {mismatchPct}%
          </span>
          <span style={{ fontSize: 13, opacity: 0.6 }}>mismatch</span>
        </div>

        {/* Tagline */}
        <p style={{ fontSize: 14, lineHeight: 1.5, opacity: 0.9, maxWidth: 340, marginBottom: 3 }}>
          {STATE_TAGLINE[data.actionability_state]}
        </p>
        <p style={{ fontSize: 11, opacity: 0.6 }}>
          {STATE_SUBTITLE[data.actionability_state]}
        </p>

        <ThresholdScale score={mismatchPct} />

        {/* Freshness pill badges */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 16 }}>
          {(["physical", "recognition", "transmission"] as const).map((key) => {
            const freshness = data.source_freshness[key];
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

      {/* Coverage bar */}
      <div style={{ background: "#fff", padding: "12px 20px 14px", borderBottom: "1px solid #f3f4f6" }}>
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
