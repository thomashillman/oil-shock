export type RuleMetricKey = "physicalStress" | "priceSignal" | "marketResponse";
export type RuleAction = "adjust_mismatch";
export type RuleOperator = ">" | ">=" | "<" | "<=" | "==" | "!=";

export interface ThresholdPredicate {
  type: "threshold";
  metric: RuleMetricKey;
  operator: RuleOperator;
  value: number;
}

export interface AllPredicate {
  type: "all";
  predicates: RulePredicate[];
}

export type RulePredicate = ThresholdPredicate | AllPredicate;

export interface RuleDefinition {
  id: number;
  engineKey: string;
  ruleKey: string;
  name: string;
  action: RuleAction;
  weight: number;
  predicate: RulePredicate;
}

export interface RuleMetrics {
  physicalStress: number;
  priceSignal: number;
  marketResponse: number;
}

export interface RuleEvaluationResult {
  totalAdjustment: number;
  appliedRules: RuleDefinition[];
}

const METRICS: RuleMetricKey[] = ["physicalStress", "priceSignal", "marketResponse"];
const OPERATORS: RuleOperator[] = [">", ">=", "<", "<=", "==", "!="];

export function isRulePredicate(value: unknown): value is RulePredicate {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Record<string, unknown>;
  if (candidate.type === "threshold") {
    return (
      typeof candidate.metric === "string" &&
      METRICS.includes(candidate.metric as RuleMetricKey) &&
      typeof candidate.operator === "string" &&
      OPERATORS.includes(candidate.operator as RuleOperator) &&
      typeof candidate.value === "number" &&
      Number.isFinite(candidate.value)
    );
  }
  if (candidate.type === "all") {
    return Array.isArray(candidate.predicates) && candidate.predicates.every((predicate) => isRulePredicate(predicate));
  }
  return false;
}

function compare(left: number, operator: RuleOperator, right: number): boolean {
  if (operator === ">") return left > right;
  if (operator === ">=") return left >= right;
  if (operator === "<") return left < right;
  if (operator === "<=") return left <= right;
  if (operator === "==") return left === right;
  return left !== right;
}

function matchesPredicate(predicate: RulePredicate, metrics: RuleMetrics): boolean {
  if (predicate.type === "threshold") {
    return compare(metrics[predicate.metric], predicate.operator, predicate.value);
  }
  return predicate.predicates.every((childPredicate) => matchesPredicate(childPredicate, metrics));
}

export function evaluateRules(rules: RuleDefinition[], metrics: RuleMetrics): RuleEvaluationResult {
  let totalAdjustment = 0;
  const appliedRules: RuleDefinition[] = [];

  for (const rule of rules) {
    if (!matchesPredicate(rule.predicate, metrics)) {
      continue;
    }
    appliedRules.push(rule);
    if (rule.action === "adjust_mismatch") {
      totalAdjustment += rule.weight;
    }
  }

  return { totalAdjustment, appliedRules };
}
