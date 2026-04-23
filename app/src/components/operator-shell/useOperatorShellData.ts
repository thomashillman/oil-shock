import { useEffect, useMemo, useState } from "react";
import { apiBaseUrl } from "../../config";
import type { StateData } from "../StateView";
import { ENGINE_CATALOG, FEED_CATALOG } from "./catalog";
import type { BackfillRow, MetricKey, PredicateOperator, RuleSummary, SortKey, Tab } from "./types";

interface UseOperatorShellDataResult {
  tab: Tab;
  setTab: (tab: Tab) => void;
  loadingDashboard: boolean;
  loadError: string | null;
  rules: RuleSummary[];
  guardrails: string[];
  feedRows: Array<{ feedKey: string; label: string; engineKey: string; freshness: string; score: number }>;
  engines: Array<{ engineKey: string; label: string }>;
  topRules: RuleSummary[];
  ruleKey: string;
  setRuleKey: (value: string) => void;
  ruleName: string;
  setRuleName: (value: string) => void;
  ruleWeight: string;
  setRuleWeight: (value: string) => void;
  predicateJson: string;
  setPredicateJson: (value: string) => void;
  predicateMetric: MetricKey;
  setPredicateMetric: (value: MetricKey) => void;
  predicateOperator: PredicateOperator;
  setPredicateOperator: (value: PredicateOperator) => void;
  predicateValue: string;
  setPredicateValue: (value: string) => void;
  advancedMode: boolean;
  setAdvancedMode: (value: boolean) => void;
  ruleEditorMessage: string | null;
  previewAdjustment: number | null;
  baselineScore: number;
  projectedScore: number;
  projectedDelta: number;
  sortKey: SortKey;
  setSortKey: (value: SortKey) => void;
  filterMinDelta: string;
  setFilterMinDelta: (value: string) => void;
  filteredRows: BackfillRow[];
  backfillSummary: { avgDelta: number; maxIncrease: number; maxDecrease: number };
  saveRule: () => Promise<void>;
  previewRule: () => Promise<void>;
  runBackfill: () => Promise<void>;
}

export function useOperatorShellData(stateData: StateData | null): UseOperatorShellDataResult {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [rules, setRules] = useState<RuleSummary[]>([]);
  const [guardrails, setGuardrails] = useState<string[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadingDashboard, setLoadingDashboard] = useState(false);

  const [ruleKey, setRuleKey] = useState("oilshock.custom.rule");
  const [ruleName, setRuleName] = useState("Operator rule");
  const [ruleWeight, setRuleWeight] = useState("0.03");
  const [predicateJson, setPredicateJson] = useState(
    '{"type":"threshold","metric":"marketResponse","operator":">=","value":0.5}',
  );
  const [predicateMetric, setPredicateMetric] = useState<MetricKey>("marketResponse");
  const [predicateOperator, setPredicateOperator] = useState<PredicateOperator>(">=");
  const [predicateValue, setPredicateValue] = useState("0.5");
  const [advancedMode, setAdvancedMode] = useState(false);
  const [ruleEditorMessage, setRuleEditorMessage] = useState<string | null>(null);
  const [previewAdjustment, setPreviewAdjustment] = useState<number | null>(null);
  const [feedFreshnessByKey, setFeedFreshnessByKey] = useState<Record<string, "fresh" | "stale" | "missing">>({});

  const [backfillRows, setBackfillRows] = useState<BackfillRow[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("generatedAt");
  const [filterMinDelta, setFilterMinDelta] = useState("0");

  const engines = useMemo(() => ENGINE_CATALOG, []);

  const feedRows = useMemo(() => {
    if (!stateData) return [];
    return FEED_CATALOG.map((feed) => ({
      feedKey: feed.feedKey,
      label: feed.label,
      engineKey: feed.engineKey,
      freshness: feedFreshnessByKey[feed.feedKey] ?? stateData.sourceFreshness[feed.dimension],
      score: stateData.subscores[feed.dimension],
    }));
  }, [feedFreshnessByKey, stateData]);

  const topRules = useMemo(() => [...rules].sort((a, b) => Math.abs(b.weight) - Math.abs(a.weight)).slice(0, 5), [rules]);

  const baselineScore = stateData?.mismatchScore ?? 0;
  const projectedScore = Math.max(0, Math.min(1, baselineScore + (previewAdjustment ?? 0)));
  const projectedDelta = projectedScore - baselineScore;

  const backfillSummary = useMemo(() => {
    if (backfillRows.length === 0) return { avgDelta: 0, maxIncrease: 0, maxDecrease: 0 };
    const deltas = backfillRows.map((row) => row.rescoredWithOverride - row.baselineScore);
    return {
      avgDelta: deltas.reduce((sum, value) => sum + value, 0) / deltas.length,
      maxIncrease: Math.max(...deltas),
      maxDecrease: Math.min(...deltas),
    };
  }, [backfillRows]);

  const filteredRows = useMemo(() => {
    const minDelta = Number(filterMinDelta);
    const safeMinDelta = Number.isFinite(minDelta) ? Math.max(0, minDelta) : 0;
    const rows = backfillRows.filter((row) => Math.abs(row.rescoredWithOverride - row.baselineScore) >= safeMinDelta);
    if (sortKey === "generatedAt") return rows.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt));
    return rows.sort((a, b) => Math.abs(b.rescoredWithOverride - b.baselineScore) - Math.abs(a.rescoredWithOverride - a.baselineScore));
  }, [backfillRows, filterMinDelta, sortKey]);

  function parsePredicate() {
    const parsed: unknown = JSON.parse(predicateJson);
    if (!parsed || typeof parsed !== "object") throw new Error("Predicate must be a JSON object.");
    return parsed;
  }

  function syncPredicateFromBuilder() {
    const parsedValue = Number(predicateValue);
    if (!Number.isFinite(parsedValue)) {
      setRuleEditorMessage("Predicate threshold must be numeric.");
      return false;
    }
    setPredicateJson(
      JSON.stringify({ type: "threshold", metric: predicateMetric, operator: predicateOperator, value: parsedValue }),
    );
    return true;
  }

  async function loadDashboard() {
    setLoadingDashboard(true);
    try {
      const [rulesRes, guardrailRes] = await Promise.all([
        fetch(`${apiBaseUrl}/api/admin/rules`, { cache: "no-store" }),
        fetch(`${apiBaseUrl}/api/admin/guardrails/failures`, { cache: "no-store" }),
      ]);
      if (!rulesRes.ok || !guardrailRes.ok) throw new Error("dashboard_fetch_failed");
      const rulesPayload = (await rulesRes.json()) as { rules?: RuleSummary[] };
      const guardrailPayload = (await guardrailRes.json()) as { failures?: string[] };
      setRules(Array.isArray(rulesPayload.rules) ? rulesPayload.rules : []);
      setGuardrails(Array.isArray(guardrailPayload.failures) ? guardrailPayload.failures : []);

      const coverageRes = await fetch(`${apiBaseUrl}/api/coverage`, { cache: "no-store" });
      if (coverageRes.ok) {
        const coveragePayload = (await coverageRes.json()) as { feed_freshness?: Record<string, "fresh" | "stale" | "missing"> };
        if (coveragePayload.feed_freshness && typeof coveragePayload.feed_freshness === "object") {
          setFeedFreshnessByKey(coveragePayload.feed_freshness);
        }
      }

      setLoadError(null);
    } catch {
      setLoadError("Failed to load operator dashboard data.");
    } finally {
      setLoadingDashboard(false);
    }
  }

  async function saveRule() {
    if (!advancedMode && !syncPredicateFromBuilder()) return;
    try {
      parsePredicate();
    } catch {
      setRuleEditorMessage("Predicate JSON is invalid.");
      return;
    }
    const parsedWeight = Number(ruleWeight);
    if (!Number.isFinite(parsedWeight)) {
      setRuleEditorMessage("Weight must be numeric.");
      return;
    }

    const createRes = await fetch(`${apiBaseUrl}/api/admin/rules`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ruleKey, name: ruleName, weight: parsedWeight, predicateJson }),
    });

    if (!createRes.ok) {
      const patchRes = await fetch(`${apiBaseUrl}/api/admin/rules/${ruleKey}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ weight: parsedWeight, predicateJson, isActive: true }),
      });
      if (!patchRes.ok) {
        setRuleEditorMessage(`Failed to save rule (HTTP ${patchRes.status}).`);
        return;
      }
    }

    setRuleEditorMessage("Rule saved.");
    await loadDashboard();
  }

  async function previewRule() {
    if (!advancedMode && !syncPredicateFromBuilder()) return;
    try {
      const parsedWeight = Number(ruleWeight);
      if (!Number.isFinite(parsedWeight)) {
        setRuleEditorMessage("Weight must be numeric.");
        return;
      }
      const predicate = parsePredicate();
      const res = await fetch(`${apiBaseUrl}/api/admin/rules/dry-run`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          physicalStress: stateData?.subscores.physicalStress ?? 0,
          priceSignal: stateData?.subscores.priceSignal ?? 0,
          marketResponse: stateData?.subscores.marketResponse ?? 0,
          overrideRule: { ruleKey, name: ruleName, weight: parsedWeight, predicate },
        }),
      });
      if (!res.ok) {
        setRuleEditorMessage(`Preview failed (HTTP ${res.status}).`);
        return;
      }
      const payload = (await res.json()) as { totalAdjustment?: number };
      setPreviewAdjustment(Number(payload.totalAdjustment ?? 0));
      setRuleEditorMessage(null);
    } catch {
      setRuleEditorMessage("Unable to preview rule.");
    }
  }

  async function runBackfill() {
    if (!advancedMode && !syncPredicateFromBuilder()) return;
    try {
      const parsedWeight = Number(ruleWeight);
      if (!Number.isFinite(parsedWeight)) {
        setRuleEditorMessage("Weight must be numeric.");
        return;
      }
      const predicate = parsePredicate();
      const res = await fetch(`${apiBaseUrl}/api/admin/backfill/rescore`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ limit: 200, overrideRule: { ruleKey, name: ruleName, weight: parsedWeight, predicate } }),
      });
      if (!res.ok) {
        setBackfillRows([]);
        setRuleEditorMessage(`Backfill failed (HTTP ${res.status}).`);
        return;
      }
      const payload = (await res.json()) as { comparisons?: BackfillRow[] };
      setBackfillRows(Array.isArray(payload.comparisons) ? payload.comparisons : []);
      setRuleEditorMessage(null);
    } catch {
      setBackfillRows([]);
      setRuleEditorMessage("Backfill failed. Please retry.");
    }
  }

  useEffect(() => {
    if (tab === "dashboard") void loadDashboard();
  }, [tab]);

  return {
    tab,
    setTab,
    loadingDashboard,
    loadError,
    rules,
    guardrails,
    feedRows,
    engines,
    topRules,
    ruleKey,
    setRuleKey,
    ruleName,
    setRuleName,
    ruleWeight,
    setRuleWeight,
    predicateJson,
    setPredicateJson,
    predicateMetric,
    setPredicateMetric,
    predicateOperator,
    setPredicateOperator,
    predicateValue,
    setPredicateValue,
    advancedMode,
    setAdvancedMode,
    ruleEditorMessage,
    previewAdjustment,
    baselineScore,
    projectedScore,
    projectedDelta,
    sortKey,
    setSortKey,
    filterMinDelta,
    setFilterMinDelta,
    filteredRows,
    backfillSummary,
    saveRule,
    previewRule,
    runBackfill,
  };
}
