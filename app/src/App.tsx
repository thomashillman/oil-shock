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
    metadata: typeof data.metadata === "object" && data.metadata !== null ? (data.metadata as EnergyRuntimePayload["metadata"]) : undefined,
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

function isoOrFallback(value?: string): string {
  return value ?? new Date().toISOString();
}

function SummaryPill({
  label,
  tone = "neutral",
}: {
  label: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const palette = {
    neutral: { background: "rgba(255,255,255,0.12)", color: "#e5eefb" },
    good: { background: "rgba(16,185,129,0.18)", color: "#a7f3d0" },
    warn: { background: "rgba(245,158,11,0.18)", color: "#fde68a" },
    bad: { background: "rgba(239,68,68,0.18)", color: "#fecaca" },
  }[tone];

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        borderRadius: 999,
        padding: "5px 10px",
        background: palette.background,
        color: palette.color,
        fontSize: 11,
        fontWeight: 700,
        letterSpacing: "0.03em",
        textTransform: "uppercase",
      }}
    >
      {label}
    </span>
  );
}

function SectionCard({
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
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 20,
        padding: 20,
        boxShadow: "0 16px 40px rgba(15, 23, 42, 0.08)",
      }}
    >
      <div style={{ marginBottom: 14 }}>
        <h2 style={{ fontSize: 14, margin: 0, color: "#0f172a" }}>{title}</h2>
        {subtitle && <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>{subtitle}</p>}
      </div>
      {children}
    </section>
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
          setStateError(`Energy state payload is missing required fields from ${apiBaseUrl}/api/v1/energy/state`);
        }
      } else {
        setEnergyState(null);
        setStateError((payload as { message?: string } | null)?.message ?? "Failed to load energy state");
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
        setRuntimeError((payload as { message?: string } | null)?.message ?? "Failed to load energy runtime");
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
    () => engines.find((engine) => engine.engineKey === "energy") ?? engines[0] ?? null,
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
  const confidenceTone = confidence >= 0.8 ? "good" : confidence >= 0.55 ? "warn" : "bad";
  const runtimeFeedHealth = runtime?.feedHealth ?? [];
  const runtimeObservations = runtime?.observations ?? [];
  const runtimeRuleState = runtime?.ruleState ?? [];
  const runtimeTriggerEvents = runtime?.triggerEvents ?? [];
  const runtimeActions = runtime?.actions ?? [];

  return (
    <div
      style={{
        minHeight: "100dvh",
        background:
          "radial-gradient(circle at top left, rgba(59,130,246,0.2), transparent 28%), radial-gradient(circle at top right, rgba(16,185,129,0.16), transparent 24%), linear-gradient(180deg, #0f172a 0, #111827 280px, #eef2f7 280px, #eef2f7 100%)",
        color: "#0f172a",
      }}
    >
      <header
        style={{
          maxWidth: 1180,
          margin: "0 auto",
          padding: "28px 20px 18px",
          color: "#fff",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 20, alignItems: "start" }}>
          <div style={{ maxWidth: 680 }}>
            <p style={{ margin: "0 0 8px", fontSize: 11, letterSpacing: "0.18em", textTransform: "uppercase", opacity: 0.72 }}>
              Energy engine
            </p>
            <h1 style={{ margin: 0, fontSize: 28, lineHeight: 1.05, letterSpacing: "-0.04em" }}>
              Live Energy signal, runtime health, and feed status in one view.
            </h1>
            <p style={{ margin: "12px 0 0", maxWidth: 640, fontSize: 14, lineHeight: 1.6, color: "rgba(255,255,255,0.78)" }}>
              This frontend now reads the current Energy API directly. The main score comes from
              <code style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}> /api/v1/energy/state</code>,
              with runtime diagnostics from
              <code style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 12 }}> /api/engines/energy/runtime</code>.
            </p>
          </div>

          <button
            onClick={() => void loadOverview()}
            disabled={loading || refreshing}
            aria-label="Refresh energy data"
            style={{
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.08)",
              color: "#fff",
              borderRadius: 14,
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 700,
              cursor: "pointer",
              minWidth: 128,
              boxShadow: "0 10px 24px rgba(15, 23, 42, 0.2)",
            }}
          >
            {refreshing ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 1180, margin: "0 auto", padding: "0 20px 40px" }}>
        {loading ? (
          <div
            style={{
              background: "#fff",
              border: "1px solid #e5e7eb",
              borderRadius: 20,
              padding: 24,
              boxShadow: "0 16px 40px rgba(15, 23, 42, 0.08)",
            }}
          >
            <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>Loading energy data…</p>
          </div>
        ) : (
          <>
            {(stateError || runtimeError) && (
              <div
                role="alert"
                style={{
                  marginBottom: 16,
                  padding: "12px 14px",
                  borderRadius: 16,
                  border: "1px solid #fecaca",
                  background: "#fff1f2",
                  color: "#991b1b",
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              >
                {stateError && <div>{stateError}</div>}
                {runtimeError && <div>{runtimeError}</div>}
              </div>
            )}

            <div style={{ display: "grid", gridTemplateColumns: "1.2fr 0.8fr", gap: 16, alignItems: "stretch" }}>
              <section
                style={{
                  borderRadius: 24,
                  padding: 24,
                  color: "#fff",
                  background:
                    "linear-gradient(135deg, rgba(15,23,42,0.98), rgba(30,41,59,0.94) 58%, rgba(14,116,144,0.92))",
                  boxShadow: "0 24px 54px rgba(15, 23, 42, 0.22)",
                }}
              >
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 18 }}>
                  <SummaryPill label={scoreStatus} tone={scoreStatus === "stable" ? "good" : "warn"} />
                  <SummaryPill label={confidenceLabel(confidence)} tone={confidenceTone} />
                  <SummaryPill label={selectedEngine?.displayName ?? "Energy"} tone="neutral" />
                  {selectedEngine && <SummaryPill label={selectedEngine.status} tone="good" />}
                </div>

                <div style={{ display: "flex", gap: 24, alignItems: "end", flexWrap: "wrap" }}>
                  <div>
                    <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.68)" }}>Current score</p>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                      <span style={{ fontSize: 64, fontWeight: 800, letterSpacing: "-0.06em", lineHeight: 1 }}>
                        {percent(scoreValue)}
                      </span>
                      <span style={{ fontSize: 14, color: "rgba(255,255,255,0.72)" }}>normalized energy stress</span>
                    </div>
                  </div>

                  <div style={{ minWidth: 190 }}>
                    <p style={{ margin: 0, fontSize: 12, color: "rgba(255,255,255,0.68)" }}>Confidence</p>
                    <div
                      style={{
                        marginTop: 8,
                        height: 10,
                        borderRadius: 999,
                        background: "rgba(255,255,255,0.15)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${Math.round(confidence * 100)}%`,
                          background: "linear-gradient(90deg, #22c55e, #f59e0b)",
                          borderRadius: 999,
                        }}
                      />
                    </div>
                    <p style={{ margin: "8px 0 0", fontSize: 12, color: "rgba(255,255,255,0.82)" }}>
                      {percent(confidence)} confidence on {energyState?.feedKey ?? "energy.state"}
                    </p>
                  </div>
                </div>

                <p style={{ margin: "18px 0 0", fontSize: 13, color: "rgba(255,255,255,0.8)", lineHeight: 1.6 }}>
                  Last scored {relativeAge(isoOrFallback(energyState?.scoredAt))}. The page now surfaces the live
                  energy engine score instead of the legacy Oil Shock snapshot.
                </p>

                <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 18 }}>
                  {energyState?.flags.length ? (
                    energyState.flags.map((flag) => (
                      <span
                        key={flag}
                        style={{
                          borderRadius: 999,
                          padding: "6px 10px",
                          background: "rgba(255,255,255,0.12)",
                          color: "#e2e8f0",
                          fontSize: 12,
                          fontWeight: 600,
                          fontFamily: '"JetBrains Mono", monospace',
                        }}
                      >
                        {flag}
                      </span>
                    ))
                  ) : (
                    <span style={{ fontSize: 12, color: "rgba(255,255,255,0.72)" }}>No active score flags</span>
                  )}
                </div>
              </section>

              <SectionCard title="Engine summary" subtitle="Current deployment and runtime chain">
                <div style={{ display: "grid", gap: 12 }}>
                  <div
                    style={{
                      padding: 14,
                      borderRadius: 16,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Active engine
                    </p>
                    <p style={{ margin: "6px 0 0", fontSize: 18, fontWeight: 700, color: "#0f172a" }}>
                      {selectedEngine?.displayName ?? "Energy"}
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#475569" }}>
                      {selectedEngine?.engineKey ?? "energy"} • {selectedEngine?.status ?? "unknown"}
                    </p>
                  </div>

                  <div
                    style={{
                      padding: 14,
                      borderRadius: 16,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Runtime chain
                    </p>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
                      {(selectedEngine?.runtimeChain ?? []).map((step) => (
                        <span
                          key={step}
                          style={{
                            borderRadius: 999,
                            padding: "5px 10px",
                            background: "#e2e8f0",
                            color: "#0f172a",
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          {step}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div
                    style={{
                      padding: 14,
                      borderRadius: 16,
                      background: "#f8fafc",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 11, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>
                      Data freshness
                    </p>
                    <p style={{ margin: "6px 0 0", fontSize: 15, fontWeight: 700, color: "#0f172a" }}>
                      {feedHealthSummary.healthy} healthy / {feedHealthSummary.total} feeds
                    </p>
                    <p style={{ margin: "4px 0 0", fontSize: 12, color: "#475569" }}>
                      {feedHealthSummary.warning} warning, {feedHealthSummary.critical} degraded
                    </p>
                  </div>
                </div>
              </SectionCard>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
              <SectionCard title="Feed health" subtitle="Latest registry checks for the energy feeds">
                <div style={{ display: "grid", gap: 10 }}>
                  {runtimeFeedHealth.map((feed) => {
                    const latest = feed.latestCheck;
                    const tone = feed.status === "ok" ? "good" : feed.status === "warn" ? "warn" : "bad";
                    return (
                      <article
                        key={feed.feedKey}
                        style={{
                          border: "1px solid #e2e8f0",
                          borderRadius: 16,
                          padding: 14,
                          background: "#fff",
                        }}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "start" }}>
                          <div>
                            <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                              {feed.displayName}
                            </p>
                            <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                              {feed.feedKey} • {feed.enabled ? "enabled" : "disabled"}
                            </p>
                          </div>
                          <SummaryPill label={feed.status} tone={tone} />
                        </div>
                        <p style={{ margin: "10px 0 0", fontSize: 12, color: "#334155" }}>
                          {latest
                            ? `${latest.step} · ${latest.result} · ${latest.checkedAt}${
                                latest.latencyMs !== null ? ` · ${latest.latencyMs}ms` : ""
                              }`
                            : "No recent health check"}
                        </p>
                      </article>
                    );
                  })}
                  {runtimeFeedHealth.length === 0 && (
                    <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No feed health rows available.</p>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Observations" subtitle="Latest normalized inputs driving the live score">
                <div style={{ display: "grid", gap: 10 }}>
                  {runtimeObservations.map((observation) => (
                    <article
                      key={observation.seriesKey}
                      style={{
                        border: "1px solid #e2e8f0",
                        borderRadius: 16,
                        padding: 14,
                        background: "#fff",
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                        <div>
                          <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                            {observation.feedKey}
                          </p>
                          <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                            {observation.seriesKey} • as of {observation.asOfDate}
                          </p>
                        </div>
                        <span style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>
                          {percent(observation.value)}
                        </span>
                      </div>
                      <p style={{ margin: "10px 0 0", fontSize: 12, color: "#334155" }}>
                        Observed {observation.observedAt}
                      </p>
                    </article>
                  ))}
                  {runtimeObservations.length === 0 && (
                    <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No observations available.</p>
                  )}
                </div>
              </SectionCard>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 16, marginTop: 16 }}>
              <SectionCard title="Rule state" subtitle="Current Energy rule evaluation snapshots">
                <div style={{ display: "grid", gap: 10 }}>
                  {runtimeRuleState.map((rule) => (
                    <article key={`${rule.ruleKey}:${rule.stateKey}`} style={{ padding: 14, borderRadius: 16, background: "#fff", border: "1px solid #e2e8f0" }}>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>{rule.ruleKey}</p>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                        {rule.state.status ?? "unknown"} • evaluated {relativeAge(isoOrFallback(rule.evaluatedAt))}
                      </p>
                      <p style={{ margin: "8px 0 0", fontSize: 12, color: "#334155" }}>
                        spread: {percent(rule.state.spread ?? 0)} • crack: {percent(rule.state.crack ?? 0)}
                      </p>
                    </article>
                  ))}
                  {runtimeRuleState.length === 0 && (
                    <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No rule state rows available.</p>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Trigger events" subtitle="Confirmed rule transitions and guardrail triggers">
                <div style={{ display: "grid", gap: 10 }}>
                  {runtimeTriggerEvents.length ? (
                    runtimeTriggerEvents.slice(0, 4).map((event, index) => (
                      <article key={`${event.ruleKey ?? "trigger"}:${index}`} style={{ padding: 14, borderRadius: 16, background: "#fff", border: "1px solid #e2e8f0" }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                          {event.ruleKey ?? "trigger event"}
                        </p>
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                          {Object.entries(event)
                            .filter(([key]) => key !== "engineKey" && key !== "ruleKey")
                            .slice(0, 3)
                            .map(([key, value]) => `${key}: ${String(value)}`)
                            .join(" • ")}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No trigger events recorded.</p>
                  )}
                </div>
              </SectionCard>

              <SectionCard title="Actions" subtitle="Logging-only action manager output">
                <div style={{ display: "grid", gap: 10 }}>
                  {runtimeActions.length ? (
                    runtimeActions.slice(0, 4).map((action, index) => (
                      <article key={`${action.engineKey}:${index}`} style={{ padding: 14, borderRadius: 16, background: "#fff", border: "1px solid #e2e8f0" }}>
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "#0f172a" }}>
                          {action.engineKey}
                        </p>
                        <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>
                          {Object.entries(action)
                            .filter(([key]) => key !== "engineKey")
                            .slice(0, 3)
                            .map(([key, value]) => `${key}: ${String(value)}`)
                            .join(" • ")}
                        </p>
                      </article>
                    ))
                  ) : (
                    <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>No action log entries recorded.</p>
                  )}
                </div>
              </SectionCard>
            </div>

            <div
              style={{
                marginTop: 16,
                padding: "0 4px",
                color: "#64748b",
                fontSize: 12,
                display: "flex",
                flexWrap: "wrap",
                gap: 10,
                justifyContent: "space-between",
              }}
            >
              <span>
                API base: <code style={{ fontFamily: '"JetBrains Mono", monospace' }}>{apiBaseUrl}</code>
              </span>
              <span>
                Runtime snapshot: <code style={{ fontFamily: '"JetBrains Mono", monospace' }}>{runtime?.metadata?.generatedAt ?? "unknown"}</code>
              </span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
