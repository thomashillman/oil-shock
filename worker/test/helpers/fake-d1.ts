type Row = Record<string, unknown>;

class FakePreparedStatement {
  private params: unknown[] = [];

  constructor(
    private readonly db: FakeD1Database,
    private readonly query: string
  ) {}

  bind(...params: unknown[]): FakePreparedStatement {
    this.params = params;
    return this;
  }

  async run(): Promise<{ success: boolean; meta: { last_row_id: number } }> {
    return this.db.run(this.query, this.params);
  }

  async first<T>(): Promise<T | null> {
    return this.db.first<T>(this.query, this.params);
  }

  async all<T>(): Promise<{ results: T[] }> {
    return this.db.all<T>(this.query, this.params);
  }
}

type TableName =
  | "series_points"
  | "runs"
  | "run_evidence"
  | "signal_snapshots"
  | "scores"
  | "impairment_ledger"
  | "state_change_events"
  | "config_thresholds"
  | "rules";

const SEED_CONFIG_THRESHOLDS: Row[] = [
  { key: "state_aligned_threshold_max", value: 0.3 },
  { key: "state_mild_threshold_min", value: 0.3 },
  { key: "state_mild_threshold_max", value: 0.5 },
  { key: "state_persistent_threshold_min", value: 0.5 },
  { key: "state_persistent_threshold_max", value: 0.75 },
  { key: "state_deep_threshold_min", value: 0.75 },
  { key: "shock_age_threshold_hours", value: 72 },
  { key: "dislocation_persistence_threshold_hours", value: 72 },
  { key: "transmission_freshness_threshold_days", value: 8 },
  { key: "ledger_adjustment_magnitude", value: 0.1 },
  { key: "mismatch_market_response_weight", value: 0.15 },
  { key: "confirmation_physical_stress_min", value: 0.6 },
  { key: "confirmation_price_signal_max", value: 0.45 },
  { key: "confirmation_market_response_min", value: 0.5 },
  { key: "coverage_missing_penalty", value: 0.34 },
  { key: "coverage_stale_penalty", value: 0.16 },
  { key: "coverage_max_penalty", value: 1.0 },
  { key: "state_deep_persistence_hours", value: 120 },
  { key: "state_persistent_persistence_hours", value: 72 },
  { key: "ledger_stale_threshold_days", value: 30 }
];

export class FakeD1Database {
  private readonly tables: Record<TableName, Row[]> = {
    series_points: [],
    runs: [],
    run_evidence: [],
    signal_snapshots: [],
    scores: [],
    impairment_ledger: [],
    state_change_events: [],
    config_thresholds: [...SEED_CONFIG_THRESHOLDS],
    rules: [
      {
        id: 1,
        engine_key: "oil_shock",
        rule_key: "oilshock.recognition_gap_bonus",
        name: "Recognition gap bonus",
        predicate_json: JSON.stringify({
          type: "all",
          predicates: [
            { type: "threshold", metric: "physicalStress", operator: ">=", value: 0.6 },
            { type: "threshold", metric: "priceSignal", operator: "<=", value: 0.45 }
          ]
        }),
        weight: 0.03,
        action: "adjust_mismatch",
        is_active: 1
      }
    ]
  };

  private nextId = 1;

  prepare(query: string): FakePreparedStatement {
    return new FakePreparedStatement(this, query);
  }

  async run(query: string, params: unknown[]): Promise<{ success: boolean; meta: { last_row_id: number } }> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("insert into series_points")) {
      this.insert("series_points", {
        series_key: params[0],
        observed_at: params[1],
        value: params[2],
        unit: params[3],
        source_key: params[4]
      });
      return { success: true, meta: { last_row_id: this.nextId - 1 } };
    }
    if (normalized.includes("insert into runs")) {
      this.insert("runs", {
        run_key: params[0],
        run_type: params[1],
        status: "running",
        started_at: params[2],
        finished_at: null,
        details_json: null
      });
      return { success: true, meta: { last_row_id: this.nextId - 1 } };
    }
    if (normalized.startsWith("update runs")) {
      const run = this.tables.runs.find((row) => row.run_key === params[3]);
      if (run) {
        run.status = params[0];
        run.finished_at = params[1];
        run.details_json = params[2];
      }
      return { success: true, meta: { last_row_id: 0 } };
    }
    if (normalized.includes("insert into signal_snapshots")) {
      this.insert("signal_snapshots", {
        generated_at: params[0],
        mismatch_score: params[1],
        actionability_state: params[2],
        coverage_confidence: params[3],
        source_freshness_json: params[4],
        evidence_ids_json: params[5],
        dislocation_state_json: params[6],
        state_rationale: params[7],
        subscores_json: params[8],
        clocks_json: params[9],
        ledger_impact_json: params[10],
        guardrail_flags_json: params[11],
        run_key: params[12] ?? null
      });
      return { success: true, meta: { last_row_id: this.nextId - 1 } };
    }
    if (normalized.includes("insert into scores")) {
      this.insert("scores", {
        engine_key: params[0],
        feed_key: params[1],
        scored_at: params[2],
        score_value: params[3],
        confidence: params[4] ?? null,
        flags_json: params[5] ?? null,
        snapshot_id: normalized.includes("snapshot_id") ? params[6] : null,
        run_key: normalized.includes("snapshot_id") ? (params[7] ?? null) : (params[6] ?? null)
      });
      return { success: true, meta: { last_row_id: this.nextId - 1 } };
    }
    if (normalized.includes("insert into run_evidence")) {
      this.insert("run_evidence", {
        run_key: params[0],
        evidence_key: params[1],
        evidence_group: params[2],
        observed_at: params[3],
        contribution: params[4],
        evidence_classification: params[5],
        coverage_quality: params[6],
        evidence_group_label: params[7],
        details_json: params[8]
      });
      return { success: true, meta: { last_row_id: this.nextId - 1 } };
    }
    if (normalized.includes("insert into impairment_ledger")) {
      this.insert("impairment_ledger", {
        entry_key: params[0],
        rationale: params[1],
        impact_direction: params[2],
        review_due_at: params[3],
        retired_at: null,
        updated_at: new Date().toISOString()
      });
      return { success: true, meta: { last_row_id: this.nextId - 1 } };
    }
    if (normalized.startsWith("update impairment_ledger")) {
      const id = String(params[4]);
      const row = this.tables.impairment_ledger.find((item) => String(item.id) === id);
      if (row) {
        row.rationale = params[0] ?? row.rationale;
        row.impact_direction = params[1] ?? row.impact_direction;
        row.review_due_at = params[2] ?? row.review_due_at;
        row.retired_at = params[3] ?? row.retired_at;
        row.updated_at = new Date().toISOString();
      }
      return { success: true, meta: { last_row_id: 0 } };
    }
    if (normalized.startsWith("update rules")) {
      const ruleKey = String(params[3]);
      const row = this.tables.rules.find((item) => item.rule_key === ruleKey);
      if (row) {
        row.weight = params[0] ?? row.weight;
        row.predicate_json = params[1] ?? row.predicate_json;
        row.is_active = params[2] ?? row.is_active;
      }
      return { success: true, meta: { last_row_id: 0 } };
    }
    if (normalized.includes("insert into state_change_events")) {
      this.insert("state_change_events", {
        generated_at: params[0],
        previous_state: params[1],
        new_state: params[2],
        state_transition_duration_seconds: params[3],
        transmission_pressure_changed: params[4]
      });
      return { success: true, meta: { last_row_id: this.nextId - 1 } };
    }
    return { success: true, meta: { last_row_id: 0 } };
  }

  async first<T>(query: string, params: unknown[]): Promise<T | null> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("from series_points")) {
      const seriesKey = params[0];
      const row = [...this.tables.series_points]
        .filter((item) => item.series_key === seriesKey)
        .sort((a, b) => String(b.observed_at).localeCompare(String(a.observed_at)))[0];
      return (row as T) ?? null;
    }
    if (normalized.includes("from signal_snapshots")) {
      const row = [...this.tables.signal_snapshots].sort((a, b) =>
        String(b.generated_at).localeCompare(String(a.generated_at))
      )[0];
      return (row as T) ?? null;
    }
    if (normalized.includes("from scores")) {
      const engineKey = params[0];
      const feedKey = params[1];
      const row = [...this.tables.scores]
        .filter((item) => item.engine_key === engineKey && item.feed_key === feedKey)
        .sort((a, b) => String(b.scored_at).localeCompare(String(a.scored_at)))[0];
      return (row as T) ?? null;
    }
    if (normalized.includes("from runs") && normalized.includes("run_type = 'score'")) {
      const row = [...this.tables.runs]
        .filter((item) => item.run_type === "score")
        .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0];
      return (row as T) ?? null;
    }
    if (normalized.includes("from state_change_events")) {
      if (normalized.includes("where new_state != 'aligned'") && normalized.includes("order by generated_at asc")) {
        const row = [...this.tables.state_change_events]
          .filter((item) => item.new_state !== "aligned")
          .sort((a, b) => String(a.generated_at).localeCompare(String(b.generated_at)))[0];
        return (row as T) ?? null;
      }
      if (normalized.includes("where transmission_pressure_changed = 1") && normalized.includes("order by generated_at asc")) {
        const row = [...this.tables.state_change_events]
          .filter((item) => item.transmission_pressure_changed === 1)
          .sort((a, b) => String(a.generated_at).localeCompare(String(b.generated_at)))[0];
        return (row as T) ?? null;
      }
      // getLatestStateChangeEvent
      const row = [...this.tables.state_change_events]
        .sort((a, b) => String(b.generated_at).localeCompare(String(a.generated_at)))[0];
      return (row as T) ?? null;
    }
    return null;
  }

  async all<T>(query: string, params: unknown[]): Promise<{ results: T[] }> {
    const normalized = query.replace(/\s+/g, " ").trim().toLowerCase();
    if (normalized.includes("from run_evidence")) {
      const runKey = params[0];
      const rows = this.tables.run_evidence
        .filter((item) => item.run_key === runKey)
        .sort((a, b) => String(b.observed_at).localeCompare(String(a.observed_at)));
      return { results: rows as T[] };
    }
    if (normalized.includes("from impairment_ledger")) {
      const rows = [...this.tables.impairment_ledger]
        .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
      return { results: rows as T[] };
    }
    if (normalized.includes("from config_thresholds")) {
      return { results: this.tables.config_thresholds as T[] };
    }
    if (normalized.includes("from rules")) {
      return {
        results: this.tables.rules
          .filter((row) => row.engine_key === params[0] && row.is_active === 1)
          .sort((a, b) => Number(a.id) - Number(b.id)) as T[]
      };
    }
    return { results: [] };
  }

  private insert(table: TableName, row: Row): void {
    this.tables[table].push({ id: this.nextId++, ...row });
  }
}

export function createExecutionContext(): ExecutionContext {
  return {
    waitUntil() {},
    passThroughOnException() {}
  } as unknown as ExecutionContext;
}

export function createTestEnv() {
  return {
    APP_ENV: "local" as const,
    PRODUCTION_ORIGIN: "",
    DB: new FakeD1Database() as unknown as D1Database,
    EIA_API_KEY: "test-eia-key",
    GIE_API_KEY: "test-gie-key"
  };
}
