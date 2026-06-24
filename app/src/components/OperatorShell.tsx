import type { StateData } from "./StateView";
import { BackfillPanel } from "./operator-shell/BackfillPanel";
import { panelStyles } from "./operator-shell/styles";
import { DashboardPanel } from "./operator-shell/DashboardPanel";
import { RuleEditorPanel } from "./operator-shell/RuleEditorPanel";
import { useOperatorShellData } from "./operator-shell/useOperatorShellData";
import type { Tab } from "./operator-shell/types";

interface OperatorShellProps {
  stateData: StateData | null;
}

const TABS: Array<{ key: Tab; label: string }> = [
  { key: "dashboard", label: "Dashboard" },
  { key: "rules", label: "Rule editor" },
  { key: "backfill", label: "Backfill" },
];

export function OperatorShell({ stateData }: OperatorShellProps) {
  const state = useOperatorShellData(stateData);

  return (
    <section style={panelStyles.shell}>
      <div style={panelStyles.header}>
        <h2 style={{ fontSize: 14, margin: 0 }}>Operator shell</h2>
        <span style={{ fontSize: 11, color: "#6b7280" }}>Control surface</span>
      </div>

      <div role="tablist" aria-label="Operator shell sections" style={panelStyles.tabList}>
        {TABS.map(({ key, label }) => {
          const selected = state.tab === key;
          return (
            <button
              key={key}
              id={`${key}-tab`}
              role="tab"
              aria-selected={selected}
              aria-controls={`${key}-panel`}
              onClick={() => state.setTab(key)}
              style={{
                border: selected ? "1px solid #111827" : "1px solid #d1d5db",
                background: selected ? "#111827" : "#fff",
                color: selected ? "#fff" : "#111827",
                borderRadius: 8,
                padding: "6px 10px",
                fontSize: 12,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {state.tab === "dashboard" && (
        <DashboardPanel
          loadingDashboard={state.loadingDashboard}
          loadError={state.loadError}
          mismatchScore={stateData?.mismatchScore ?? 0}
          rules={state.rules}
          guardrails={state.guardrails}
          feedRows={state.feedRows}
          engines={state.engines}
          topRules={state.topRules}
        />
      )}

      {state.tab === "rules" && (
        <RuleEditorPanel
          ruleKey={state.ruleKey}
          setRuleKey={state.setRuleKey}
          ruleName={state.ruleName}
          setRuleName={state.setRuleName}
          ruleWeight={state.ruleWeight}
          setRuleWeight={state.setRuleWeight}
          predicateJson={state.predicateJson}
          setPredicateJson={state.setPredicateJson}
          predicateMetric={state.predicateMetric}
          setPredicateMetric={state.setPredicateMetric}
          predicateOperator={state.predicateOperator}
          setPredicateOperator={state.setPredicateOperator}
          predicateValue={state.predicateValue}
          setPredicateValue={state.setPredicateValue}
          advancedMode={state.advancedMode}
          setAdvancedMode={state.setAdvancedMode}
          baselineScore={state.baselineScore}
          projectedScore={state.projectedScore}
          projectedDelta={state.projectedDelta}
          ruleEditorMessage={state.ruleEditorMessage}
          previewRule={state.previewRule}
          saveRule={state.saveRule}
        />
      )}

      {state.tab === "backfill" && (
        <BackfillPanel
          runBackfill={state.runBackfill}
          filterMinDelta={state.filterMinDelta}
          setFilterMinDelta={state.setFilterMinDelta}
          sortKey={state.sortKey}
          setSortKey={state.setSortKey}
          filteredRows={state.filteredRows}
          backfillSummary={state.backfillSummary}
        />
      )}
    </section>
  );
}
