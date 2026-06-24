import { colors, panelStyles } from "./styles";
import type { MetricKey, PredicateOperator } from "./types";

interface RuleEditorPanelProps {
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
  baselineScore: number;
  projectedScore: number;
  projectedDelta: number;
  ruleEditorMessage: string | null;
  previewRule: () => Promise<void>;
  saveRule: () => Promise<void>;
}

export function RuleEditorPanel(props: RuleEditorPanelProps) {
  const {
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
    baselineScore,
    projectedScore,
    projectedDelta,
    ruleEditorMessage,
    previewRule,
    saveRule,
  } = props;

  return (
    <div id="rules-panel" role="tabpanel" aria-labelledby="rules-tab" style={{ ...panelStyles.bodyCard, display: "grid", gap: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <p style={{ margin: 0, fontSize: 12, color: colors.textBody }}>Draft, preview, then save.</p>
        <label style={{ fontSize: 12, color: colors.textBody, display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={advancedMode} onChange={(event) => setAdvancedMode(event.target.checked)} />
          Advanced JSON mode
        </label>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <input aria-label="Rule key" value={ruleKey} onChange={(e) => setRuleKey(e.target.value)} placeholder="rule key" />
        <input aria-label="Rule name" value={ruleName} onChange={(e) => setRuleName(e.target.value)} placeholder="rule name" />
      </div>
      <input aria-label="Rule weight" value={ruleWeight} onChange={(e) => setRuleWeight(e.target.value)} placeholder="rule weight" />

      {!advancedMode ? (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
          <select aria-label="Predicate metric" value={predicateMetric} onChange={(e) => setPredicateMetric(e.target.value as MetricKey)}>
            <option value="physicalStress">physicalStress</option>
            <option value="priceSignal">priceSignal</option>
            <option value="marketResponse">marketResponse</option>
          </select>
          <select aria-label="Predicate operator" value={predicateOperator} onChange={(e) => setPredicateOperator(e.target.value as PredicateOperator)}>
            <option value=">=">{">="}</option>
            <option value=">">{">"}</option>
            <option value="<=">{"<="}</option>
            <option value="<">{"<"}</option>
          </select>
          <input aria-label="Predicate value" value={predicateValue} onChange={(e) => setPredicateValue(e.target.value)} placeholder="0.5" />
        </div>
      ) : (
        <textarea aria-label="Predicate JSON" value={predicateJson} onChange={(e) => setPredicateJson(e.target.value)} rows={5} />
      )}

      <div style={{ display: "flex", gap: 8 }}>
        <button onClick={() => void previewRule()}>Preview impact</button>
        <button onClick={() => void saveRule()}>Save rule</button>
      </div>

      <div style={panelStyles.bodyCard}>
        <p style={{ margin: "0 0 6px", fontSize: 12, fontWeight: 600 }}>Preview diff</p>
        <p style={{ margin: "0 0 2px", fontSize: 12, color: colors.textBody }}>Baseline: {(baselineScore * 100).toFixed(1)}%</p>
        <p style={{ margin: "0 0 2px", fontSize: 12, color: colors.textBody }}>Projected: {(projectedScore * 100).toFixed(1)}%</p>
        <p style={{ margin: 0, fontSize: 12, color: projectedDelta >= 0 ? colors.success : colors.danger }}>
          Delta: {projectedDelta >= 0 ? "+" : ""}
          {(projectedDelta * 100).toFixed(1)} pts
        </p>
      </div>

      {ruleEditorMessage && (
        <p role="alert" style={{ margin: 0, fontSize: 12 }}>
          {ruleEditorMessage}
        </p>
      )}
    </div>
  );
}
