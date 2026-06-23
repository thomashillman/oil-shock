import { useCallback, useEffect, useRef, useState } from "react";
import { apiBaseUrl } from "./config";
import { StateView } from "./components/StateView";
import { EvidenceView } from "./components/EvidenceView";
import { OperatorShell } from "./components/OperatorShell";
import type { StateData, HistoryPoint } from "./components/StateView";
import type { EvidenceData } from "./components/EvidenceView";

const REFRESH_MS = 60_000;
const RECALC_POLL_MS = 3_000;
const RECALC_TIMEOUT_MS = 90_000;

function relativeAge(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function normalizeStatePayload(payload: unknown): StateData | null {
  if (!payload || typeof payload !== "object") return null;

  const pickNestedSubscoreKeys = (value: unknown) => {
    if (!value || typeof value !== "object") return undefined;
    const nested = value as Record<string, unknown>;
    return {
      physicalStress: nested.physicalStress ?? nested.physical_stress,
      priceSignal: nested.priceSignal ?? nested.price_signal,
      marketResponse: nested.marketResponse ?? nested.market_response,
    };
  };

  const data = payload as Record<string, unknown>;
  const toNumber = (value: unknown): number => {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const parsed = Number(value);
      if (Number.isFinite(parsed)) return parsed;
    }
    return 0;
  };
  const pick = (obj: Record<string, unknown> | undefined, camel: string, snake: string) =>
    obj?.[camel] ?? obj?.[snake];
  const fromSnake = {
    generatedAt: data.generated_at,
    mismatchScore: data.mismatch_score,
    dislocationState: data.dislocation_state,
    stateRationale: data.state_rationale,
    actionabilityState: data.actionability_state,
    confidence: data.confidence,
    subscores: data.subscores,
    clocks: data.clocks,
    ledgerImpact: data.ledger_impact,
    coverageConfidence: data.coverage_confidence,
    sourceFreshness: data.source_freshness,
    evidenceIds: data.evidence_ids,
  };

  const normalized = {
    generatedAt: data.generatedAt ?? fromSnake.generatedAt,
    mismatchScore: data.mismatchScore ?? fromSnake.mismatchScore,
    dislocationState: data.dislocationState ?? fromSnake.dislocationState,
    stateRationale: data.stateRationale ?? fromSnake.stateRationale,
    actionabilityState: data.actionabilityState ?? fromSnake.actionabilityState,
    confidence: data.confidence ?? fromSnake.confidence,
    subscores: pickNestedSubscoreKeys(data.subscores ?? fromSnake.subscores) as StateData["subscores"],
    clocks: data.clocks ?? fromSnake.clocks,
    ledgerImpact: data.ledgerImpact ?? fromSnake.ledgerImpact,
    coverageConfidence: data.coverageConfidence ?? fromSnake.coverageConfidence,
    sourceFreshness: pickNestedSubscoreKeys(
      data.sourceFreshness ?? fromSnake.sourceFreshness,
    ) as StateData["sourceFreshness"],
    evidenceIds: data.evidenceIds ?? fromSnake.evidenceIds,
  } as StateData;

  const rawSubscores =
    normalized.subscores && typeof normalized.subscores === "object"
      ? (normalized.subscores as unknown as Record<string, unknown>)
      : undefined;
  normalized.subscores = {
    physicalStress: toNumber(pick(rawSubscores, "physicalStress", "physical_stress")),
    priceSignal: toNumber(pick(rawSubscores, "priceSignal", "price_signal")),
    marketResponse: toNumber(pick(rawSubscores, "marketResponse", "market_response")),
  };

  normalized.mismatchScore = toNumber(normalized.mismatchScore);
  normalized.coverageConfidence = toNumber(normalized.coverageConfidence);

  const rawFreshness =
    normalized.sourceFreshness && typeof normalized.sourceFreshness === "object"
      ? (normalized.sourceFreshness as unknown as Record<string, unknown>)
      : undefined;
  normalized.sourceFreshness = {
    physicalStress: pick(rawFreshness, "physicalStress", "physical_stress") as
      | "fresh"
      | "stale"
      | "missing",
    priceSignal: pick(rawFreshness, "priceSignal", "price_signal") as
      | "fresh"
      | "stale"
      | "missing",
    marketResponse: pick(rawFreshness, "marketResponse", "market_response") as
      | "fresh"
      | "stale"
      | "missing",
  };

  if (!normalized.dislocationState || !normalized.clocks || !normalized.subscores) {
    return null;
  }

  return normalized;
}

export function App() {
  const [stateData, setStateData] = useState<StateData | null>(null);
  const [evidenceData, setEvidenceData] = useState<EvidenceData | null>(null);
  const [historyData, setHistoryData] = useState<HistoryPoint[]>([]);
  const [stateError, setStateError] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [recalculating, setRecalculating] = useState(false);
  const [recalcError, setRecalcError] = useState<string | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchAll = useCallback(async () => {
    const [stateRes, evidenceRes] = await Promise.allSettled([
      fetch(`${apiBaseUrl}/api/state`, { cache: "no-store" }),
      fetch(`${apiBaseUrl}/api/evidence`, { cache: "no-store" }),
    ]);

    if (stateRes.status === "fulfilled") {
      const data = await stateRes.value.json();
      if (stateRes.value.ok) {
        const normalized = normalizeStatePayload(data);
        if (normalized) {
          setStateData(normalized);
          setStateError(null);
        } else {
          setStateData(null);
          setStateError(`State payload is missing required fields from ${apiBaseUrl}/api/state`);
        }
      } else {
        setStateError((data as { message?: string }).message ?? "Failed to load state");
      }
    } else {
      setStateError("Network error loading state");
    }

    if (evidenceRes.status === "fulfilled") {
      const data = await evidenceRes.value.json();
      if (evidenceRes.value.ok) {
        setEvidenceData(data as EvidenceData);
        setEvidenceError(null);
      } else {
        setEvidenceError((data as { message?: string }).message ?? "Failed to load evidence");
      }
    } else {
      setEvidenceError("Network error loading evidence");
    }

    setLoading(false);
  }, []);

  const fetchHistory = useCallback(async () => {
    try {
      const res = await fetch(`${apiBaseUrl}/api/state/history?limit=8`, { cache: "no-store" });
      if (res.ok) {
        const data = (await res.json()) as { history?: unknown };
        const isHistoryPoint = (value: unknown): value is HistoryPoint => {
          if (!value || typeof value !== "object") return false;
          const item = value as Record<string, unknown>;
          return (
            typeof item.generatedAt === "string" &&
            typeof item.dislocationState === "string" &&
            typeof item.mismatchScore === "number" &&
            Number.isFinite(item.mismatchScore)
          );
        };
        if (Array.isArray(data.history)) {
          setHistoryData(
            data.history.filter(isHistoryPoint).map((item) => ({
              generatedAt: item.generatedAt,
              mismatchScore: item.mismatchScore,
              dislocationState: item.dislocationState,
            })),
          );
        }
      }
    } catch {
      // history is non-critical
    }
  }, []);

  const recalculate = useCallback(async () => {
    if (recalculating) return;
    setRecalculating(true);
    setRecalcError(null);

    const prevGeneratedAt = stateData?.generatedAt ?? null;

    try {
      const postRes = await fetch(`${apiBaseUrl}/api/admin/run-poc`, { method: "POST" });
      if (!postRes.ok) {
        setRecalculating(false);
        setRecalcError(`Recalculation failed (HTTP ${postRes.status}). Try again in a moment.`);
        return;
      }
    } catch {
      setRecalculating(false);
      setRecalcError("Recalculation failed: network error. Check your connection and retry.");
      return;
    }

    const deadline = Date.now() + RECALC_TIMEOUT_MS;

    const poll = async () => {
      if (Date.now() >= deadline) {
        setRecalculating(false);
        setRecalcError("Recalculation timed out — the worker may be offline. Try again in a minute.");
        return;
      }
      try {
        const res = await fetch(`${apiBaseUrl}/api/state`, { cache: "no-store" });
        if (res.ok) {
          const raw = (await res.json()) as Record<string, unknown>;
          const newGeneratedAt = (raw.generated_at ?? raw.generatedAt) as string | undefined;
          if (newGeneratedAt && newGeneratedAt !== prevGeneratedAt) {
            await fetchAll();
            await fetchHistory();
            setRecalculating(false);
            setRecalcError(null);
            return;
          }
        }
      } catch {
        // continue polling
      }
      pollTimerRef.current = setTimeout(() => {
        void poll();
      }, RECALC_POLL_MS);
    };

    pollTimerRef.current = setTimeout(() => {
      void poll();
    }, RECALC_POLL_MS);
  }, [recalculating, stateData, fetchAll, fetchHistory]);

  useEffect(() => {
    void fetchAll();
    void fetchHistory();
    const id = setInterval(() => void fetchAll(), REFRESH_MS);
    return () => {
      clearInterval(id);
      if (pollTimerRef.current !== null) clearTimeout(pollTimerRef.current);
    };
  }, [fetchAll, fetchHistory]);

  const calcLabel = stateData?.generatedAt
    ? `Calculated ${relativeAge(stateData.generatedAt)}`
    : null;

  return (
    <div style={{ minHeight: "100dvh", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "14px 20px",
          background: "#fff",
          borderBottom: "1px solid #e5e7eb",
        }}
      >
        <h1 style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.01em" }}>Oil Shock</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {calcLabel && (
            <span style={{ fontSize: 12, color: "#9ca3af" }}>{calcLabel}</span>
          )}
          <button
            onClick={() => void recalculate()}
            disabled={recalculating || loading}
            aria-label="Recalculate"
            className="refresh-btn"
            style={{
              background: "none",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 13,
              color: "#374151",
              cursor: "pointer",
              lineHeight: 1,
              display: "flex",
              alignItems: "center",
              gap: 5,
            }}
          >
            <span className={recalculating ? "spin-icon" : undefined}>↺</span>
            <span>{recalculating ? "Recalculating…" : "Recalculate"}</span>
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: "0 auto", paddingBottom: 40 }}>
        {recalcError && (
          <div
            role="alert"
            style={{
              margin: "12px 20px 0",
              padding: "10px 14px",
              background: "#fef2f2",
              border: "1px solid #fecaca",
              borderRadius: 8,
              color: "#991b1b",
              fontSize: 13,
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <span>{recalcError}</span>
            <button
              onClick={() => setRecalcError(null)}
              aria-label="Dismiss recalculation error"
              style={{
                background: "none",
                border: "none",
                color: "#991b1b",
                fontSize: 16,
                cursor: "pointer",
                lineHeight: 1,
                padding: 2,
              }}
            >
              ×
            </button>
          </div>
        )}
        {loading ? (
          <p style={{ padding: "40px 20px", color: "#9ca3af", fontSize: 14 }}>Loading…</p>
        ) : (
          <>
            <StateView data={stateData} error={stateError} history={historyData} />
            <EvidenceView data={evidenceData} error={evidenceError} />
            <OperatorShell stateData={stateData} />
          </>
        )}
      </main>
    </div>
  );
}
