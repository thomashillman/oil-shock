import { useEffect, useMemo, useState } from "react";
import { apiBaseUrl } from "./config";
import {
  ApiError,
  fetchCoverage,
  fetchEvidence,
  fetchLedgerReview,
  fetchState,
  runPocCycle,
  type CoveragePayload,
  type EvidencePayload,
  type LedgerReviewPayload,
  type StatePayload
} from "./api";
import "./App.css";

type View = "state" | "evidence" | "ledger";

interface LoadResult {
  state: StatePayload | null;
  evidence: EvidencePayload | null;
  coverage: CoveragePayload | null;
  ledger: LedgerReviewPayload | null;
  errors: string[];
}

const INITIAL_RESULT: LoadResult = {
  state: null,
  evidence: null,
  coverage: null,
  ledger: null,
  errors: []
};

function formatNumber(value: number | undefined): string {
  if (value === undefined) {
    return "N/A";
  }
  return value.toFixed(3);
}

function formatTimestamp(value: string | undefined): string {
  if (!value) {
    return "N/A";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

async function loadAllData(): Promise<LoadResult> {
  const responses = await Promise.allSettled([
    fetchState(),
    fetchEvidence(),
    fetchCoverage(),
    fetchLedgerReview()
  ]);

  const [stateResult, evidenceResult, coverageResult, ledgerResult] = responses;
  const errors: string[] = [];

  const state = stateResult.status === "fulfilled" ? stateResult.value : null;
  if (stateResult.status === "rejected") {
    errors.push(stateResult.reason instanceof ApiError ? stateResult.reason.message : "Failed loading state.");
  }

  const evidence = evidenceResult.status === "fulfilled" ? evidenceResult.value : null;
  if (evidenceResult.status === "rejected") {
    errors.push(
      evidenceResult.reason instanceof ApiError ? evidenceResult.reason.message : "Failed loading evidence."
    );
  }

  const coverage = coverageResult.status === "fulfilled" ? coverageResult.value : null;
  if (coverageResult.status === "rejected") {
    errors.push(
      coverageResult.reason instanceof ApiError ? coverageResult.reason.message : "Failed loading coverage."
    );
  }

  const ledger = ledgerResult.status === "fulfilled" ? ledgerResult.value : null;
  if (ledgerResult.status === "rejected") {
    errors.push(ledgerResult.reason instanceof ApiError ? ledgerResult.reason.message : "Failed loading ledger.");
  }

  return {
    state,
    evidence,
    coverage,
    ledger,
    errors
  };
}

export function App() {
  const [view, setView] = useState<View>("state");
  const [result, setResult] = useState<LoadResult>(INITIAL_RESULT);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  const headerState = useMemo(() => {
    if (!result.state) {
      return "NO SNAPSHOT";
    }
    return result.state.actionability_state.toUpperCase();
  }, [result.state]);

  const refresh = async (): Promise<void> => {
    setIsLoading(true);
    setResult(await loadAllData());
    setIsLoading(false);
  };

  const seedSnapshot = async (): Promise<void> => {
    setIsRunning(true);
    try {
      await runPocCycle();
      await refresh();
    } finally {
      setIsRunning(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <main className="layout">
      <header className="hero">
        <div>
          <h1>Oil Shock MVP</h1>
          <p>Live dislocation monitor for physical constraints vs market recognition.</p>
        </div>
        <div className={`state-badge state-${headerState.toLowerCase().replace(" ", "-")}`}>{headerState}</div>
      </header>

      <section className="toolbar">
        <nav className="tabs">
          <button className={view === "state" ? "active" : ""} onClick={() => setView("state")} type="button">
            State
          </button>
          <button
            className={view === "evidence" ? "active" : ""}
            onClick={() => setView("evidence")}
            type="button"
          >
            Evidence
          </button>
          <button className={view === "ledger" ? "active" : ""} onClick={() => setView("ledger")} type="button">
            Ledger
          </button>
        </nav>
        <div className="actions">
          <button onClick={() => void refresh()} type="button">
            Refresh
          </button>
          <button onClick={() => void seedSnapshot()} type="button">
            {isRunning ? "Running..." : "Run Data Cycle"}
          </button>
        </div>
      </section>

      {result.errors.length > 0 && (
        <section className="panel warning">
          <h2>Data Warnings</h2>
          <ul>
            {result.errors.map((error) => (
              <li key={error}>{error}</li>
            ))}
          </ul>
        </section>
      )}

      {isLoading ? (
        <section className="panel">
          <h2>Loading</h2>
          <p>Fetching latest snapshot data.</p>
        </section>
      ) : null}

      {!isLoading && view === "state" && (
        <section className="panel grid">
          <article>
            <h3>Mismatch Score</h3>
            <p className="metric">{formatNumber(result.state?.mismatch_score)}</p>
          </article>
          <article>
            <h3>Coverage Confidence</h3>
            <p className="metric">{formatNumber(result.coverage?.coverage_confidence)}</p>
          </article>
          <article>
            <h3>Generated At</h3>
            <p>{formatTimestamp(result.state?.generated_at)}</p>
          </article>
          <article>
            <h3>Freshness</h3>
            <p>
              Physical: {result.coverage?.source_freshness?.physical ?? "N/A"}
              <br />
              Recognition: {result.coverage?.source_freshness?.recognition ?? "N/A"}
              <br />
              Transmission: {result.coverage?.source_freshness?.transmission ?? "N/A"}
            </p>
          </article>
        </section>
      )}

      {!isLoading && view === "evidence" && (
        <section className="panel">
          <h2>Evidence</h2>
          <p>Generated: {formatTimestamp(result.evidence?.generated_at)}</p>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Group</th>
                  <th>Key</th>
                  <th>Contribution</th>
                  <th>Observed At</th>
                </tr>
              </thead>
              <tbody>
                {(result.evidence?.evidence ?? []).map((item) => (
                  <tr key={`${item.evidence_key}-${item.observed_at}`}>
                    <td>{item.evidence_group}</td>
                    <td>{item.evidence_key}</td>
                    <td>{formatNumber(item.contribution)}</td>
                    <td>{formatTimestamp(item.observed_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {!isLoading && view === "ledger" && (
        <section className="panel">
          <h2>Ledger Review Queue</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Entry</th>
                  <th>Direction</th>
                  <th>Review Due</th>
                  <th>Rationale</th>
                </tr>
              </thead>
              <tbody>
                {(result.ledger?.review_due ?? []).map((item) => (
                  <tr key={String(item.id)}>
                    <td>{item.entry_key}</td>
                    <td>{item.impact_direction}</td>
                    <td>{formatTimestamp(item.review_due_at)}</td>
                    <td>{item.rationale}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <footer className="footer">API: {apiBaseUrl}</footer>
    </main>
  );
}
