import { useCallback, useEffect, useRef, useState } from "react";
import { apiBaseUrl } from "./config";
import { StateView } from "./components/StateView";
import { EvidenceView } from "./components/EvidenceView";
import { Button } from "./components/ui/Button";
import { LiveRegion } from "./components/ui/LiveRegion";
import { useDarkMode } from "./hooks/useDarkMode";
import { useIsMobile } from "./hooks/useMediaQuery";
import { theme } from "./theme";
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

  const data = payload as Record<string, unknown>;
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
    subscores: data.subscores ?? fromSnake.subscores,
    clocks: data.clocks ?? fromSnake.clocks,
    ledgerImpact: data.ledgerImpact ?? fromSnake.ledgerImpact,
    coverageConfidence: data.coverageConfidence ?? fromSnake.coverageConfidence,
    sourceFreshness: data.sourceFreshness ?? fromSnake.sourceFreshness,
    evidenceIds: data.evidenceIds ?? fromSnake.evidenceIds,
  } as StateData;

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
  const [loadingMessage, setLoadingMessage] = useState<string>("");
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { isDarkMode, toggleDarkMode } = useDarkMode();
  const isMobile = useIsMobile();

  const fetchAll = useCallback(async () => {
    const [stateRes, evidenceRes] = await Promise.allSettled([
      fetch(`${apiBaseUrl}/api/state`),
      fetch(`${apiBaseUrl}/api/evidence`),
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
      const res = await fetch(`${apiBaseUrl}/api/state/history?limit=8`);
      if (res.ok) {
        const data = (await res.json()) as { history?: unknown };
        if (Array.isArray(data.history)) {
          setHistoryData(data.history as HistoryPoint[]);
        }
      }
    } catch {
      // history is non-critical
    }
  }, []);

  const recalculate = useCallback(async () => {
    if (recalculating) return;
    setRecalculating(true);
    setLoadingMessage("Recalculating…");

    const prevGeneratedAt = stateData?.generatedAt ?? null;

    try {
      await fetch(`${apiBaseUrl}/api/admin/run-poc`, { method: "POST" });
    } catch {
      // fire-and-forget
    }

    const deadline = Date.now() + RECALC_TIMEOUT_MS;

    const poll = async () => {
      if (Date.now() >= deadline) {
        setRecalculating(false);
        setLoadingMessage("Recalculation complete.");
        return;
      }
      try {
        const res = await fetch(`${apiBaseUrl}/api/state`);
        if (res.ok) {
          const raw = (await res.json()) as Record<string, unknown>;
          const newGeneratedAt = (raw.generated_at ?? raw.generatedAt) as string | undefined;
          if (newGeneratedAt && newGeneratedAt !== prevGeneratedAt) {
            await fetchAll();
            await fetchHistory();
            setRecalculating(false);
            setLoadingMessage("Recalculation complete. Data updated.");
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

  const handleRecalculateKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      void recalculate();
    }
  };

  return (
    <div
      style={{
        minHeight: "100dvh",
        fontFamily: theme.typography.fontStack,
        display: "flex",
        flexDirection: "column",
        backgroundColor: "var(--page-bg)",
        color: "var(--text-primary)",
        transition: "background-color 0.2s ease, color 0.2s ease",
      }}
    >
      <LiveRegion>{loadingMessage}</LiveRegion>

      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: isMobile
            ? `${theme.spacing.lg} ${theme.spacing.xxl}`
            : `${theme.spacing.lg} ${theme.spacing.xxl}`,
          backgroundColor: "var(--bg-primary)",
          borderBottom: `1px solid var(--border-primary)`,
          flexWrap: isMobile ? "wrap" : "nowrap",
          gap: theme.spacing.xl,
        }}
      >
        <h1
          style={{
            fontSize: theme.typography.sizes["2xl"],
            fontWeight: theme.typography.weights.bold,
            letterSpacing: theme.letterSpacing.tight,
            margin: 0,
            color: "var(--text-primary)",
          }}
        >
          Oil Shock
        </h1>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: theme.spacing.xl,
            minWidth: isMobile ? "100%" : "auto",
            justifyContent: isMobile ? "space-between" : "flex-end",
          }}
        >
          {calcLabel && (
            <span
              style={{
                fontSize: theme.typography.sizes.sm,
                color: "var(--text-tertiary)",
                whiteSpace: "nowrap",
              }}
            >
              {calcLabel}
            </span>
          )}
          <div style={{ display: "flex", gap: theme.spacing.lg, alignItems: "center" }}>
            <Button
              onClick={toggleDarkMode}
              aria-label={isDarkMode ? "Switch to light mode" : "Switch to dark mode"}
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                fontSize: theme.typography.sizes.base,
                background: "var(--bg-secondary)",
                border: `1px solid var(--border-primary)`,
                color: "var(--text-primary)",
                borderRadius: theme.radius.md,
                cursor: "pointer",
              }}
            >
              {isDarkMode ? "☀" : "🌙"}
            </Button>
            <Button
              onClick={() => void recalculate()}
              onKeyDown={handleRecalculateKeyDown}
              disabled={recalculating || loading}
              aria-label="Recalculate state"
              className="refresh-btn"
              style={{
                padding: `${theme.spacing.sm} ${theme.spacing.lg}`,
                fontSize: theme.typography.sizes.base,
                background: "var(--bg-secondary)",
                border: `1px solid var(--border-primary)`,
                color: "var(--text-primary)",
                borderRadius: theme.radius.md,
                cursor: recalculating || loading ? "not-allowed" : "pointer",
                opacity: recalculating || loading ? 0.4 : 1,
              }}
            >
              <span className={recalculating ? "spin-icon" : undefined}>↺</span>
              <span>{recalculating ? "Recalculating…" : "Recalculate"}</span>
            </Button>
          </div>
        </div>
      </header>

      <main
        style={{
          maxWidth: "1200px",
          width: "100%",
          margin: "0 auto",
          padding: isMobile ? `${theme.spacing.xl}` : `${theme.spacing.xxxl}`,
          paddingBottom: "40px",
          flex: 1,
        }}
      >
        {loading ? (
          <p
            style={{
              padding: `${theme.spacing.xxxl} ${theme.spacing.xxl}`,
              color: "var(--text-secondary)",
              fontSize: theme.typography.sizes.base,
            }}
          >
            Loading…
          </p>
        ) : (
          <>
            <StateView data={stateData} error={stateError} history={historyData} />
            <EvidenceView data={evidenceData} error={evidenceError} />
          </>
        )}
      </main>
    </div>
  );
}
