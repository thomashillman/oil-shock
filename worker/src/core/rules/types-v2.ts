export type RuleLifecycleStatus = "inactive" | "active" | "no_data" | "error";

export interface ObservationValue {
  value: number;
  observedAt: string;
  releaseKey?: string;
}

export interface RuleStateValue {
  [key: string]: unknown;
}

export interface RuleStateUpdate {
  stateKey: string;
  state: RuleStateValue;
}

export interface TriggerEventDraft {
  transitionKey: string;
  previousState?: string;
  newState: string;
  reason?: string;
  details?: Record<string, unknown>;
}

export interface RuleContext {
  engineKey: string;
  runKey: string;
  releaseKey: string;
  evaluatedAt: string;
  observations: Record<string, ObservationValue>;
  priorState: Record<string, RuleStateValue>;
}

export interface RuleResult {
  ruleKey: string;
  status: RuleLifecycleStatus;
  computed: Record<string, unknown>;
  stateUpdates: RuleStateUpdate[];
  triggerEvent?: TriggerEventDraft;
}

export interface RuleDefinitionV2 {
  ruleKey: string;
  evaluate(context: RuleContext): Promise<RuleResult>;
}

export interface RuleEngineStore {
  upsertRuleState(input: {
    engineKey: string;
    ruleKey: string;
    stateKey: string;
    releaseKey: string;
    state: RuleStateValue;
    evaluatedAt: string;
  }): Promise<void>;
  insertTriggerEvent(input: {
    engineKey: string;
    ruleKey: string;
    releaseKey: string;
    transitionKey: string;
    previousState?: string;
    newState: string;
    runKey: string;
    triggeredAt: string;
    status: string;
    reason?: string;
    computed?: Record<string, unknown>;
    details?: Record<string, unknown>;
  }): Promise<void>;
}
