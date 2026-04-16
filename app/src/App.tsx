import { useEffect, useState } from "react";
import { apiBaseUrl } from "./config";
import { StateView } from "./components/StateView";
import { EvidenceView } from "./components/EvidenceView";
import type { StateData } from "./components/StateView";
import type { EvidenceData } from "./components/EvidenceView";

export function App() {
  const [stateData, setStateData] = useState<StateData | null>(null);
  const [evidenceData, setEvidenceData] = useState<EvidenceData | null>(null);
  const [stateError, setStateError] = useState<string | null>(null);
  const [evidenceError, setEvidenceError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchAll() {
      const [stateRes, evidenceRes] = await Promise.allSettled([
        fetch(`${apiBaseUrl}/api/state`),
        fetch(`${apiBaseUrl}/api/evidence`),
      ]);

      if (stateRes.status === "fulfilled") {
        const data = await stateRes.value.json();
        if (stateRes.value.ok) setStateData(data as StateData);
        else setStateError((data as { message?: string }).message ?? "Failed to load state");
      } else {
        setStateError("Network error loading state");
      }

      if (evidenceRes.status === "fulfilled") {
        const data = await evidenceRes.value.json();
        if (evidenceRes.value.ok) setEvidenceData(data as EvidenceData);
        else setEvidenceError((data as { message?: string }).message ?? "Failed to load evidence");
      } else {
        setEvidenceError("Network error loading evidence");
      }

      setLoading(false);
    }
    void fetchAll();
  }, []);

  return (
    <main
      style={{
        maxWidth: 680,
        margin: "0 auto",
        padding: "32px 20px",
        fontFamily: "system-ui, -apple-system, sans-serif",
      }}
    >
      <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 28, letterSpacing: "-0.01em" }}>
        Oil Shock
      </h1>
      {loading ? (
        <p style={{ color: "#9ca3af", fontSize: 14 }}>Loading…</p>
      ) : (
        <>
          <StateView data={stateData} error={stateError} />
          <EvidenceView data={evidenceData} error={evidenceError} />
        </>
      )}
    </main>
  );
}
