import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { apiBaseUrl } from "./config";

const REFRESH_MS = 60_000;

interface EnergyStatePayload {
  engineKey: string;
  feedKey: string;
  scoredAt: string;
  scoreValue: number;
  confidence: number;
  flags: string[];
}

interface EngineInventoryItem {
  engineKey: string;
  displayName: string;
  status: string;
  runtimeChain: string[];
}

interface RuntimeFeedHealthItem {
  engineKey: string;
  feedKey: string;
  displayName: string;
  enabled: boolean;
  status: string;
  latestCheck: null | {
    checkedAt: string;
    step: string;
    result: string;
    status: string;
    errorMessage: string | null;
    latencyMs: number | null;
  };
}

interface RuntimeObservationItem {
  engineKey: string;
  feedKey: string;
  seriesKey: string;
  releaseKey: string;
  asOfDate: string;
  observedAt: string;
  value: number;
}

interface RuntimeRuleStateItem {
  engineKey: string;
  ruleKey: string;
  stateKey: string;
  releaseKey: string;
  state: {
    status?: string;
    spread?: number;
    crack?: number;
    [key: string]: unknown;
  };
  evaluatedAt: string;
}

interface RuntimeTriggerEventItem {
  engineKey: string;
  ruleKey: string;
  [key: string]: unknown;
}

interface RuntimeActionItem {
  engineKey: string;
  [key: string]: unknown;
}

interface EnergyRuntimePayload {
  engineKey: string;
  feedHealth: RuntimeFeedHealthItem[];
  observations: RuntimeObservationItem[];
  ruleState: RuntimeRuleStateItem[];
  triggerEvents: RuntimeTriggerEventItem[];
  actions: RuntimeActionItem[];
  metadata?: {
    generatedAt?: string;
    readOnly?: boolean;
    cpiEnabled?: boolean;
  };
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

function normalizeEnergyState(payload: unknown): EnergyStatePayload | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  const scoredAt = typeof data.scoredAt === "string" ? data.scoredAt : "";
  if (!scoredAt) return null;
  return {
    engineKey: typeof data.engineKey === "string" ? data.engineKey : "energy",
    feedKey: typeof data.feedKey === "string" ? data.feedKey : "energy.state",
    scoredAt,
    scoreValue: toNumber(data.scoreValue),
    confidence: toNumber(data.confidence),
    flags: toStringArray(data.flags),
  };
}

function normalizeEngineInventory(payload: unknown): EngineInventoryItem[] {
  if (!payload || typeof payload !== "object") return [];
  const engines = (payload as Record<string, unknown>).engines;
  if (!Array.isArray(engines)) return [];
  return engines.filter((engine): engine is EngineInventoryItem => {
    if (!engine || typeof engine !== "object") return false;
    const item = engine as Record<string, unknown>;
    return (
      typeof item.engineKey === "string" &&
      typeof item.displayName === "string" &&
      typeof item.status === "string" &&
      Array.isArray(item.runtimeChain)
    );
  });
}

function normalizeRuntime(payload: unknown): EnergyRuntimePayload | null {
  if (!payload || typeof payload !== "object") return null;
  const data = payload as Record<string, unknown>;
  const feedHealth = Array.isArray(data.feedHealth) ? data.feedHealth : [];
  const observations = Array.isArray(data.observations) ? data.observations : [];
  const ruleState = Array.isArray(data.ruleState) ? data.ruleState : [];
  const triggerEvents = Array.isArray(data.triggerEvents) ? data.triggerEvents : [];
  const actions = Array.isArray(data.actions) ? data.actions : [];
  return {
    engineKey: typeof data.engineKey === "string" ? data.engineKey : "energy",
    feedHealth: feedHealth.filter((item): item is RuntimeFeedHealthItem => {
      if (!item || typeof item !== "object") return false;
      const value = item as Record<string, unknown>;
      return (
        typeof value.engineKey === "string" &&
        typeof value.feedKey === "string" &&
        typeof value.displayName === "string" &&
        typeof value.enabled === "boolean" &&
        typeof value.status === "string"
      );
    }),
    observations: observations.filter((item): item is RuntimeObservationItem => {
      if (!item || typeof item !== "object") return false;
      const value = item as Record<string, unknown>;
      return (
        typeof value.engineKey === "string" &&
        typeof value.feedKey === "string" &&
        typeof value.seriesKey === "string" &&
        typeof value.observedAt === "string" &&
        typeof value.value === "number"
      );
    }),
    ruleState: ruleState.filter((item): item is RuntimeRuleStateItem => {
      if (!item || typeof item !== "object") return false;
      const value = item as Record<string, unknown>;
      return (
        typeof value.engineKey === "string" &&
        typeof value.ruleKey === "string" &&
        typeof value.stateKey === "string" &&
        typeof value.evaluatedAt === "string" &&
        typeof value.state === "object" &&
        value.state !== null
      );
    }),
    triggerEvents: triggerEvents.filter((item): item is RuntimeTriggerEventItem => {
      if (!item || typeof item !== "object") return false;
      return typeof (item as Record<string, unknown>).engineKey === "string";
    }),
    actions: actions.filter((item): item is RuntimeActionItem => {
      if (!item || typeof item !== "object") return false;
      return typeof (item as Record<string, unknown>).engineKey === "string";
    }),
    metadata:
      typeof data.metadata === "object" && data.metadata !== null
        ? (data.metadata as EnergyRuntimePayload["metadata"])
        : undefined,
  };
}

function relativeAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function percent(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function statusLabel(scoreValue: number): string {
  if (scoreValue >= 0.66) return "elevated";
  if (scoreValue >= 0.33) return "watch";
  return "stable";
}

function confidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return "high confidence";
  if (confidence >= 0.55) return "moderate confidence";
  return "low confidence";
}

// Design tokens
const T = {
  crude: "#12100E",
  bitumen: "#1E1A16",
  wellhead: "#EDE8DC",
  flare: "#E8691A",
  gauge: "#3FA882",
  watch: "#F59E0B",
  paraffin: "#7A6E64",
  border: "#2A2520",
  display: "'Barlow Condensed', system-ui, sans-serif",
  body: "'IBM Plex Sans', system-ui, sans-serif",
  mono: "'IBM Plex Mono', monospace",
} as const;

function accentForStatus(status: string): string {
  if (status === "elevated") return T.flare;
  if (status === "watch") return T.watch;
  return T.gauge;
}

// Signature element: pressure-gauge arc
function GaugeMeter({ score, status }: { score: number; status: string }) {
  const cx = 64, cy = 62, r = 46, sw = 8;
  // Arc from 150° to 390° SVG-space (7 o'clock → 5 o'clock via 12), 240° sweep
  const startDeg = 150;
  const sweep = 240;

  function pt(deg: number) {
    const rad = (deg * Math.PI) / 180;
    return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
  }

  const s = pt(startDeg);
  const e = pt(startDeg + sweep);
  const trackPath = `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 1 1 ${e.x.toFixed(2)} ${e.y.toFixed(2)}`;

  const clamped = Math.max(0, Math.min(1, score));
  const scoreSweep = clamped * sweep;
  const se = pt(startDeg + scoreSweep);
  const largeArc = scoreSweep > 180 ? 1 : 0;
  const scorePath =
    clamped > 0.005
      ? `M ${s.x.toFixed(2)} ${s.y.toFixed(2)} A ${r} ${r} 0 ${largeArc} 1 ${se.x.toFixed(2)} ${se.y.toFixed(2)}`
      : null;

  const accent = accentForStatus(status);
  const pct = Math.round(clamped * 100);

  return (
    <svg
      viewBox="0 0 128 108"
      width="152"
      height="128"
      aria-label={`Stress score ${pct}%`}
      style={{ flexShrink: 0 }}
    >
      <path
        d={trackPath}
        fill="none"
        stroke="rgba(237,232,220,0.07)"
        strokeWidth={sw}
        strokeLinecap="round"
      />
      {scorePath && (
        <path
          d={scorePath}
          fill="none"
          stroke={accent}
          strokeWidth={sw}
          strokeLinecap="round"
        />
      )}
      {/* Threshold ticks at 33% and 66% */}
      {[0.33, 0.66].map((t) => {
        const deg = startDeg + t * sweep;
        const rad = (deg * Math.PI) / 180;
        const inner = { x: cx + (r - 7) * Math.cos(rad), y: cy + (r - 7) * Math.sin(rad) };
        const outer = { x: cx + (r + 7) * Math.cos(rad), y: cy + (r + 7) * Math.sin(rad) };
        return (
          <line
            key={t}
            x1={inner.x}
            y1={inner.y}
            x2={outer.x}
            y2={outer.y}
            stroke="rgba(237,232,220,0.2)"
            strokeWidth={1.5}
          />
        );
      })}
      <text
        x={cx}
        y={cy - 4}
        textAnchor="middle"
        fill={accent}
        fontSize={28}
        fontWeight={700}
        fontFamily="'Barlow Condensed', sans-serif"
      >
        {pct}
      </text>
      <text
        x={cx}
        y={cy + 12}
        textAnchor="middle"
        fill={T.paraffin}
        fontSize={9}
        fontFamily="'IBM Plex Mono', monospace"
        letterSpacing="1.5"
      >
        STRESS %
      </text>
    </svg>
  );
}

function Badge({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "ok" | "warn" | "bad" | "neutral";
}) {
  const style = {
    ok: { background: "rgba(63,168,130,0.14)", color: T.gauge },
    warn: { background: "rgba(245,158,11,0.14)", color: T.watch },
    bad: { background: "rgba(232,105,26,0.14)", color: T.flare },
    neutral: { background: "rgba(237,232,220,0.07)", color: T.paraffin },
  }[tone];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: "3px 8px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 600,
        fontFamily: T.mono,
        letterSpacing: "0.06em",
        textTransform: "uppercase",
        ...style,
      }}
    >
      {label}
    </span>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section
      style={{
        background: T.bitumen,
        borderRadius: 10,
        border: `1px solid ${T.border}`,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          padding: "13px 18px 11px",
          borderBottom: `1px solid ${T.border}`,
        }}
      >
        <div
          style={{
            fontFamily: T.display,
            fontWeight: 600,
            fontSize: 13,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: T.wellhead,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ marginTop: 2, fontSize: 11, color: T.paraffin }}>
            {subtitle}
          </div>
        )}
      </div>
      <div style={{ padding: "14px 18px" }}>{children}</div>
    </section>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        gap: 12,
        padding: "7px 0",
        borderBottom: `1px solid rgba(42,37,32,0.9)`,
      }}
    >
      <span style={{ fontSize: 11, color: T.paraffin }}>{label}</span>
      <span style={{ fontSize: 11, fontFamily: T.mono, color: T.wellhead }}>{value}</span>
    </div>
  );
}

export function App() {
  const [energyState, setEnergyState] = useState<EnergyStatePayload | null>(null);
  const [engines, setEngines] = useState<EngineInventoryItem[]>([]);
  const [runtime, setRuntime] = useState<EnergyRuntimePayload | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [runtimeError, setRuntimeError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const loadOverview = useCallback(async () => {
    setRefreshing(true);
    setStateError(null);
    setRuntimeError(null);

    const [stateRes, enginesRes, runtimeRes] = await Promise.allSettled([
      fetch(`${apiBaseUrl}/api/v1/energy/state`, { cache: "no-store" }),
      fetch(`${apiBaseUrl}/api/engines`, { cache: "no-store" }),
      fetch(`${apiBaseUrl}/api/engines/energy/runtime`, { cache: "no-store" }),
    ]);

    if (stateRes.status === "fulfilled") {
      const payload = await stateRes.value.json().catch(() => null);
      if (stateRes.value.ok) {
        const normalized = normalizeEnergyState(payload);
        if (normalized) {
          setEnergyState(normalized);
        } else {
          setEnergyState(null);
          setStateError(
            `Energy state payload is missing required fields from ${apiBaseUrl}/api/v1/energy/state`,
          );
        }
      } else {
        setEnergyState(null);
        setStateError(
          (payload as { message?: string } | null)?.message ?? "Failed to load energy state",
        );
      }
    } else {
      setEnergyState(null);
      setStateError("Network error loading energy state");
    }

    if (enginesRes.status === "fulfilled") {
      const payload = await enginesRes.value.json().catch(() => null);
      if (enginesRes.value.ok) {
        setEngines(normalizeEngineInventory(payload));
      } else {
        setEngines([]);
      }
    } else {
      setEngines([]);
    }

    if (runtimeRes.status === "fulfilled") {
      const payload = await runtimeRes.value.json().catch(() => null);
      if (runtimeRes.value.ok) {
        setRuntime(normalizeRuntime(payload));
      } else {
        setRuntime(null);
        setRuntimeError(
          (payload as { message?: string } | null)?.message ?? "Failed to load energy runtime",
        );
      }
    } else {
      setRuntime(null);
      setRuntimeError("Network error loading energy runtime");
    }

    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void loadOverview();
    const intervalId = setInterval(() => {
      void loadOverview();
    }, REFRESH_MS);
    return () => clearInterval(intervalId);
  }, [loadOverview]);

  const selectedEngine = useMemo(
    () => engines.find((e) => e.engineKey === "energy") ?? engines[0] ?? null,
    [engines],
  );

  const feedHealthSummary = useMemo(() => {
    if (!runtime) return { healthy: 0, warning: 0, critical: 0, total: 0 };
    return runtime.feedHealth.reduce(
      (acc, feed) => {
        acc.total += 1;
        if (feed.status === "ok" && feed.enabled) acc.healthy += 1;
        else if (feed.status === "warn") acc.warning += 1;
        else acc.critical += 1;
        return acc;
      },
      { healthy: 0, warning: 0, critical: 0, total: 0 },
    );
  }, [runtime]);

  const scoreValue = energyState?.scoreValue ?? 0;
  const confidence = energyState?.confidence ?? 0;
  const scoreStatus = statusLabel(scoreValue);
  const scoreAccent = accentForStatus(scoreStatus);
  const confidenceTone =
    confidence >= 0.8 ? ("ok" as const) : confidence >= 0.55 ? ("warn" as const) : ("bad" as const);
  const runtimeFeedHealth = runtime?.feedHealth ?? [];
  const runtimeObservations = runtime?.observations ?? [];
  const runtimeRuleState = runtime?.ruleState ?? [];
  const runtimeTriggerEvents = runtime?.triggerEvents ?? [];
  const runtimeActions = runtime?.actions ?? [];

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: T.crude,
        color: T.wellhead,
        fontFamily: T.body,
      }}
    >
      {/* Header */}
      <header
        style={{
          borderBottom: `1px solid ${T.border}`,
          padding: "0 24px",
          height: 52,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span
            style={{
              fontFamily: T.display,
              fontWeight: 700,
              fontSize: 17,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: T.wellhead,
            }}
          >
            Oil Shock
          </span>
          <span style={{ width: 1, height: 16, background: T.border, display: "block" }} />
          <span
            style={{
              fontSize: 11,
              color: T.paraffin,
              fontFamily: T.mono,
              letterSpacing: "0.04em",
            }}
          >
            Energy dislocation monitor
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          {energyState && (
            <span style={{ fontSize: 11, color: T.paraffin, fontFamily: T.mono }}>
              scored {relativeAge(energyState.scoredAt)}
            </span>
          )}
          <button
            onClick={() => void loadOverview()}
            disabled={loading || refreshing}
            aria-label="Refresh energy data"
            style={{
              background: "transparent",
              border: `1px solid ${T.border}`,
              color: T.wellhead,
              borderRadius: 6,
              padding: "6px 14px",
              fontSize: 12,
              fontFamily: T.body,
              fontWeight: 500,
              cursor: loading || refreshing ? "default" : "pointer",
              opacity: loading || refreshing ? 0.4 : 1,
              transition: "border-color 0.15s ease, opacity 0.15s ease",
            }}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 48px" }}>
        {loading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              height: 220,
              color: T.paraffin,
              fontSize: 12,
              fontFamily: T.mono,
              letterSpacing: "0.06em",
            }}
          >
            loading…
          </div>
        ) : (
          <>
            {/* Error banner */}
            {(stateError ?? runtimeError) && (
              <div
                role="alert"
                style={{
                  marginBottom: 14,
                  padding: "11px 16px",
                  borderRadius: 8,
                  border: `1px solid rgba(232,105,26,0.3)`,
                  background: "rgba(232,105,26,0.06)",
                  color: T.flare,
                  fontSize: 12,
                  fontFamily: T.mono,
                  lineHeight: 1.6,
                }}
              >
                {stateError && <div>{stateError}</div>}
                {runtimeError && <div>{runtimeError}</div>}
              </div>
            )}

            {/* Hero */}
            <div
              style={{
                background: T.bitumen,
                borderRadius: 10,
                border: `1px solid ${T.border}`,
                padding: "28px 32px",
                marginBottom: 12,
                display: "flex",
                gap: 36,
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <GaugeMeter score={scoreValue} status={scoreStatus} />

              {/* State label + metadata */}
              <div style={{ flex: 1, minWidth: 200 }}>
                <div
                  style={{
                    fontFamily: T.mono,
                    fontSize: 10,
                    letterSpacing: "0.12em",
                    color: T.paraffin,
                    textTransform: "uppercase",
                    marginBottom: 5,
                  }}
                >
                  Energy dislocation
                </div>
                <div
                  style={{
                    fontFamily: T.display,
                    fontWeight: 700,
                    fontSize: 50,
                    letterSpacing: "0.01em",
                    lineHeight: 1,
                    color: scoreAccent,
                    textTransform: "uppercase",
                  }}
                >
                  {scoreStatus === "elevated"
                    ? "Elevated"
                    : scoreStatus === "watch"
                      ? "Watch"
                      : "Stable"}
                </div>

                <div style={{ marginTop: 16, display: "flex", flexWrap: "wrap", gap: 6 }}>
                  <Badge label={confidenceLabel(confidence)} tone={confidenceTone} />
                  {selectedEngine && (
                    <Badge label={selectedEngine.status} tone="ok" />
                  )}
                  {(energyState?.flags ?? []).map((flag) => (
                    <Badge key={flag} label={flag} tone="neutral" />
                  ))}
                </div>

                {/* Confidence track */}
                <div style={{ marginTop: 16 }}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginBottom: 5,
                    }}
                  >
                    <span style={{ fontSize: 11, color: T.paraffin }}>Signal confidence</span>
                    <span style={{ fontSize: 11, fontFamily: T.mono, color: T.wellhead }}>
                      {percent(confidence)}
                    </span>
                  </div>
                  <div
                    style={{
                      height: 3,
                      background: "rgba(237,232,220,0.07)",
                      borderRadius: 2,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        height: "100%",
                        width: `${Math.round(confidence * 100)}%`,
                        background:
                          confidence >= 0.8 ? T.gauge : confidence >= 0.55 ? T.watch : T.flare,
                        borderRadius: 2,
                        transition: "width 0.4s ease",
                      }}
                    />
                  </div>
                </div>

                {energyState && (
                  <div
                    style={{
                      marginTop: 12,
                      fontSize: 11,
                      color: T.paraffin,
                      fontFamily: T.mono,
                    }}
                  >
                    {energyState.feedKey} · scored {relativeAge(energyState.scoredAt)}
                  </div>
                )}
              </div>

              {/* Engine column */}
              <div
                style={{
                  minWidth: 190,
                  paddingLeft: 32,
                  borderLeft: `1px solid ${T.border}`,
                  alignSelf: "stretch",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 18,
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      color: T.paraffin,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      fontFamily: T.mono,
                      marginBottom: 4,
                    }}
                  >
                    Active engine
                  </div>
                  <div
                    style={{
                      fontFamily: T.display,
                      fontWeight: 600,
                      fontSize: 20,
                      color: T.wellhead,
                    }}
                  >
                    {selectedEngine?.displayName ?? "Energy"}
                  </div>
                  <div
                    style={{
                      fontSize: 11,
                      color: T.paraffin,
                      fontFamily: T.mono,
                      marginTop: 2,
                    }}
                  >
                    {selectedEngine?.engineKey ?? "energy"}
                  </div>
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 10,
                      color: T.paraffin,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      fontFamily: T.mono,
                      marginBottom: 5,
                    }}
                  >
                    Feed health
                  </div>
                  <div
                    style={{
                      fontFamily: T.display,
                      fontWeight: 600,
                      fontSize: 18,
                      color:
                        feedHealthSummary.critical > 0
                          ? T.flare
                          : feedHealthSummary.warning > 0
                            ? T.watch
                            : T.gauge,
                    }}
                  >
                    {feedHealthSummary.healthy}/{feedHealthSummary.total} feeds
                  </div>
                  {(feedHealthSummary.warning > 0 || feedHealthSummary.critical > 0) && (
                    <div
                      style={{
                        fontSize: 11,
                        color: T.paraffin,
                        fontFamily: T.mono,
                        marginTop: 2,
                      }}
                    >
                      {feedHealthSummary.warning} warn · {feedHealthSummary.critical} degraded
                    </div>
                  )}
                </div>

                <div>
                  <div
                    style={{
                      fontSize: 10,
                      color: T.paraffin,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      fontFamily: T.mono,
                      marginBottom: 6,
                    }}
                  >
                    Runtime chain
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {(selectedEngine?.runtimeChain ?? []).map((step) => (
                      <span
                        key={step}
                        style={{
                          fontSize: 10,
                          fontFamily: T.mono,
                          color: T.paraffin,
                          background: "rgba(237,232,220,0.05)",
                          border: `1px solid ${T.border}`,
                          borderRadius: 3,
                          padding: "2px 6px",
                        }}
                      >
                        {step}
                      </span>
                    ))}
                    {!selectedEngine && (
                      <span style={{ fontSize: 11, color: T.paraffin, fontFamily: T.mono }}>
                        —
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Feed health + Observations */}
            <div
              style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}
            >
              <Panel title="Feed health" subtitle="API registry checks">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {runtimeFeedHealth.map((feed) => {
                    const tone =
                      feed.status === "ok" && feed.enabled
                        ? ("ok" as const)
                        : feed.status === "warn"
                          ? ("warn" as const)
                          : ("bad" as const);
                    const latest = feed.latestCheck;
                    return (
                      <article
                        key={feed.feedKey}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 6,
                          background: "rgba(237,232,220,0.025)",
                          border: `1px solid ${T.border}`,
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            gap: 8,
                          }}
                        >
                          <span style={{ fontSize: 13, fontWeight: 500, color: T.wellhead }}>
                            {feed.displayName}
                          </span>
                          <Badge label={feed.status} tone={tone} />
                        </div>
                        <div
                          style={{
                            marginTop: 4,
                            fontSize: 10,
                            color: T.paraffin,
                            fontFamily: T.mono,
                          }}
                        >
                          {feed.feedKey} · {feed.enabled ? "enabled" : "disabled"}
                        </div>
                        {latest && (
                          <div
                            style={{
                              marginTop: 3,
                              fontSize: 10,
                              color: T.paraffin,
                              fontFamily: T.mono,
                            }}
                          >
                            {latest.step} · {latest.result}
                            {latest.latencyMs !== null ? ` · ${latest.latencyMs}ms` : ""}
                          </div>
                        )}
                      </article>
                    );
                  })}
                  {runtimeFeedHealth.length === 0 && (
                    <span style={{ fontSize: 12, color: T.paraffin, fontFamily: T.mono }}>
                      No feed health data.
                    </span>
                  )}
                </div>
              </Panel>

              <Panel title="Observations" subtitle="Latest normalized inputs driving the score">
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {runtimeObservations.map((obs) => (
                    <article
                      key={obs.seriesKey}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 6,
                        background: "rgba(237,232,220,0.025)",
                        border: `1px solid ${T.border}`,
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, color: T.wellhead }}>
                          {obs.feedKey}
                        </div>
                        <div
                          style={{
                            marginTop: 3,
                            fontSize: 10,
                            color: T.paraffin,
                            fontFamily: T.mono,
                          }}
                        >
                          {obs.seriesKey} · {obs.asOfDate}
                        </div>
                      </div>
                      <div
                        style={{
                          fontFamily: T.display,
                          fontWeight: 700,
                          fontSize: 22,
                          color: T.wellhead,
                          flexShrink: 0,
                        }}
                      >
                        {percent(obs.value)}
                      </div>
                    </article>
                  ))}
                  {runtimeObservations.length === 0 && (
                    <span style={{ fontSize: 12, color: T.paraffin, fontFamily: T.mono }}>
                      No observations.
                    </span>
                  )}
                </div>
              </Panel>
            </div>

            {/* Rule state · Trigger events · Actions */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12 }}>
              <Panel title="Rule state" subtitle="Energy rule snapshots">
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {runtimeRuleState.map((rule) => (
                    <article
                      key={`${rule.ruleKey}:${rule.stateKey}`}
                      style={{
                        padding: "10px 12px",
                        borderRadius: 6,
                        background: "rgba(237,232,220,0.025)",
                        border: `1px solid ${T.border}`,
                      }}
                    >
                      <div style={{ fontSize: 12, fontWeight: 500, color: T.wellhead }}>
                        {rule.ruleKey}
                      </div>
                      <div
                        style={{
                          marginTop: 3,
                          fontSize: 10,
                          color: T.paraffin,
                          fontFamily: T.mono,
                        }}
                      >
                        {rule.state.status ?? "unknown"} · {relativeAge(rule.evaluatedAt)}
                      </div>
                      <div
                        style={{
                          marginTop: 2,
                          fontSize: 10,
                          color: T.paraffin,
                          fontFamily: T.mono,
                        }}
                      >
                        spread {percent(rule.state.spread ?? 0)} · crack{" "}
                        {percent(rule.state.crack ?? 0)}
                      </div>
                    </article>
                  ))}
                  {runtimeRuleState.length === 0 && (
                    <span style={{ fontSize: 12, color: T.paraffin, fontFamily: T.mono }}>
                      No rule state.
                    </span>
                  )}
                </div>
              </Panel>

              <Panel title="Trigger events" subtitle="Rule transitions">
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {runtimeTriggerEvents.length > 0 ? (
                    runtimeTriggerEvents.slice(0, 4).map((event, index) => (
                      <article
                        key={`${String(event.ruleKey ?? "trigger")}:${index}`}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 6,
                          background: "rgba(237,232,220,0.025)",
                          border: `1px solid ${T.border}`,
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 500, color: T.wellhead }}>
                          {String(event.ruleKey ?? "trigger event")}
                        </div>
                        <div
                          style={{
                            marginTop: 3,
                            fontSize: 10,
                            color: T.paraffin,
                            fontFamily: T.mono,
                          }}
                        >
                          {Object.entries(event)
                            .filter(([k]) => k !== "engineKey" && k !== "ruleKey")
                            .slice(0, 3)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(" · ")}
                        </div>
                      </article>
                    ))
                  ) : (
                    <span style={{ fontSize: 12, color: T.paraffin, fontFamily: T.mono }}>
                      No trigger events.
                    </span>
                  )}
                </div>
              </Panel>

              <Panel title="Actions" subtitle="Action manager log">
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {runtimeActions.length > 0 ? (
                    runtimeActions.slice(0, 4).map((action, index) => (
                      <article
                        key={`${action.engineKey}:${index}`}
                        style={{
                          padding: "10px 12px",
                          borderRadius: 6,
                          background: "rgba(237,232,220,0.025)",
                          border: `1px solid ${T.border}`,
                        }}
                      >
                        <div style={{ fontSize: 12, fontWeight: 500, color: T.wellhead }}>
                          {action.engineKey}
                        </div>
                        <div
                          style={{
                            marginTop: 3,
                            fontSize: 10,
                            color: T.paraffin,
                            fontFamily: T.mono,
                          }}
                        >
                          {Object.entries(action)
                            .filter(([k]) => k !== "engineKey")
                            .slice(0, 3)
                            .map(([k, v]) => `${k}: ${String(v)}`)
                            .join(" · ")}
                        </div>
                      </article>
                    ))
                  ) : (
                    <span style={{ fontSize: 12, color: T.paraffin, fontFamily: T.mono }}>
                      No action log entries.
                    </span>
                  )}
                </div>
              </Panel>
            </div>

            {/* Footer */}
            <div
              style={{
                marginTop: 24,
                paddingTop: 14,
                borderTop: `1px solid ${T.border}`,
                display: "flex",
                justifyContent: "space-between",
                flexWrap: "wrap",
                gap: 12,
                fontSize: 10,
                color: T.paraffin,
                fontFamily: T.mono,
              }}
            >
              <span>api: {apiBaseUrl}</span>
              <span>snapshot: {runtime?.metadata?.generatedAt ?? "—"}</span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
