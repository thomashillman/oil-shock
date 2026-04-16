import { useCallback, useEffect, useState } from "react";
import { apiBaseUrl } from "./config";
import { StateView } from "./components/StateView";
import { EvidenceView } from "./components/EvidenceView";
import type { StateData } from "./components/StateView";
import type { EvidenceData } from "./components/EvidenceView";

const REFRESH_MS = 60_000;

export function App() {
  const [stateData, setStateData] = useState<StateData | null>(null);
  const [evidenceData, setEvidenceData] = useState<EvidenceData | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchAll = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);

    const [stateRes, evidenceRes] = await Promise.allSettled([
      fetch(`${apiBaseUrl}/api/state`),
      fetch(`${apiBaseUrl}/api/evidence`),
    ]);

    if (stateRes.status === "fulfilled") {
      const data = await stateRes.value.json();
      if (stateRes.value.ok) {
        setStateData(data as StateData);
        setStateError(null);
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

    setLastFetched(new Date());
    setLoading(false);
    if (manual) setRefreshing(false);
  }, []);

  useEffect(() => {
    void fetchAll();
    const id = setInterval(() => void fetchAll(), REFRESH_MS);
    return () => clearInterval(id);
  }, [fetchAll]);

  const timeLabel = lastFetched
    ? lastFetched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })
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
          {timeLabel && <span style={{ fontSize: 12, color: "#9ca3af" }}>{timeLabel}</span>}
          <button
            onClick={() => void fetchAll(true)}
            disabled={refreshing || loading}
            aria-label="Refresh"
            className="refresh-btn"
            style={{
              background: "none",
              border: "1px solid #e5e7eb",
              borderRadius: 6,
              padding: "4px 10px",
              fontSize: 14,
              color: "#374151",
              cursor: "pointer",
              lineHeight: 1,
            }}
          >
            <span className={refreshing ? "spin-icon" : undefined}>↺</span>
          </button>
        </div>
      </header>

      <main style={{ maxWidth: 640, margin: "0 auto", paddingBottom: 40 }}>
        {loading ? (
          <p style={{ padding: "40px 20px", color: "#9ca3af", fontSize: 14 }}>Loading…</p>
        ) : (
          <>
            <StateView data={stateData} error={stateError} />
            <EvidenceView data={evidenceData} error={evidenceError} />
          </>
        )}
      </main>
    </div>
  );
}
