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

type TableName = "series_points" | "runs" | "run_evidence" | "signal_snapshots" | "impairment_ledger" | "rules";

export class FakeD1Database {
  private readonly tables: Record<TableName, Row[]> = {
    series_points: [],
    runs: [],
    run_evidence: [],
    signal_snapshots: [],
    impairment_ledger: [],
    rules: []
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
        run_key: params[12]
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
    if (normalized.includes("insert into rules")) {
      this.insert("rules", {
        engine_key: params[0],
        rule_key: params[1],
        name: params[2],
        predicate_json: params[3],
        weight: params[4],
        action: "adjust_mismatch",
        is_active: params[5] ?? 1
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
      const engineKey = String(params[3]);
      const ruleKey = String(params[4]);
      const row = this.tables.rules.find((item) => item.engine_key === engineKey && item.rule_key === ruleKey);
      if (row) {
        if (params[0] !== null && params[0] !== undefined) {
          row.weight = params[0];
        }
        if (params[1] !== null && params[1] !== undefined) {
          row.predicate_json = params[1];
        }
        if (params[2] !== null && params[2] !== undefined) {
          row.is_active = params[2];
        }
      }
      return { success: true, meta: { last_row_id: 0 } };
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
    if (normalized.includes("from rules")) {
      const engineKey = params[0];
      const rows = this.tables.rules
        .filter((item) => item.engine_key === engineKey && Number(item.is_active ?? 0) === 1)
        .sort((a, b) => Number(a.id) - Number(b.id));
      return (rows[0] as T) ?? null;
    }
    if (normalized.includes("from runs") && normalized.includes("run_type = 'score'")) {
      const row = [...this.tables.runs]
        .filter((item) => item.run_type === "score")
        .sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)))[0];
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
      const limit = String(params[0]);
      const rows = this.tables.impairment_ledger
        .filter((item) => item.retired_at === null && String(item.review_due_at) <= limit)
        .sort((a, b) => String(a.review_due_at).localeCompare(String(b.review_due_at)));
      return { results: rows as T[] };
    }
    if (normalized.includes("from signal_snapshots")) {
      const limit = Number(params[0] ?? 0);
      const rows = [...this.tables.signal_snapshots]
        .sort((a, b) => String(b.generated_at).localeCompare(String(a.generated_at)))
        .slice(0, Number.isFinite(limit) && limit > 0 ? limit : this.tables.signal_snapshots.length);
      return { results: rows as T[] };
    }
    if (normalized.includes("from rules")) {
      const engineKey = params[0];
      const rows = this.tables.rules
        .filter((item) => item.engine_key === engineKey && Number(item.is_active ?? 0) === 1)
        .sort((a, b) => Number(a.id) - Number(b.id));
      return { results: rows as T[] };
    }
    return { results: [] };
  }

  private insert(table: TableName, row: Row): void {
    this.tables[table].push({ id: this.nextId++, ...row });
  }
}

export function createTestEnv() {
  return {
    APP_ENV: "local" as const,
    PRODUCTION_ORIGIN: "",
    DB: new FakeD1Database() as unknown as D1Database
  };
}
