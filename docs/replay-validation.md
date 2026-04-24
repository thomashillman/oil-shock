# Replay Validation

Generated: 2026-04-24T13:00:57.758Z

Deterministic: yes
Dislocation-state matches: 9/9
Actionability-state matches: 9/9

| Window | Mismatch | Dislocation State | Expected Dislocation | Actionability | Expected Actionability | Deterministic |
|--------|----------|-------------------|----------------------|---------------|------------------------|---------------|
| stress_case | 0.7695 | mild_divergence | mild_divergence | actionable | actionable | yes |
| soft_case | 0.0865 | aligned | aligned | none | none | yes |
| duration_mild | 0.4025 | mild_divergence | mild_divergence | watch | watch | yes |
| duration_persistent | 0.5825 | persistent_divergence | persistent_divergence | watch | watch | yes |
| duration_deep | 0.755 | deep_divergence | deep_divergence | actionable | actionable | yes |
| null_duration_high_score | 0.755 | mild_divergence | mild_divergence | actionable | actionable | yes |
| stale_critical_downgrade | 0.755 | aligned | aligned | actionable | actionable | yes |
| ledger_push_over | 0.7325 | persistent_divergence | persistent_divergence | watch | watch | yes |
| ledger_pull_under | 0.4325 | mild_divergence | mild_divergence | watch | watch | yes |
