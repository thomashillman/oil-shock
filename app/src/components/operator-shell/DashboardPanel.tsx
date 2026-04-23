import { colors, panelStyles } from "./styles";
import type { RuleSummary } from "./types";

const FRESHNESS_COLOR: Record<string, string> = {
  fresh: colors.success,
  stale: colors.warning,
  missing: colors.danger,
};

function statusLabelForGuardrails(count: number): "healthy" | "warning" | "critical" {
  if (count === 0) return "healthy";
  if (count <= 2) return "warning";
  return "critical";
}

interface DashboardPanelProps {
  loadingDashboard: boolean;
  loadError: string | null;
  mismatchScore: number;
  rules: RuleSummary[];
  guardrails: string[];
  feedRows: Array<{ feedKey: string; label: string; engineKey: string; freshness: string; score: number }>;
  engines: Array<{ engineKey: string; label: string }>;
  topRules: RuleSummary[];
}

export function DashboardPanel({
  loadingDashboard,
  loadError,
  mismatchScore,
  rules,
  guardrails,
  feedRows,
  engines,
  topRules,
}: DashboardPanelProps) {
  const guardrailStatus = statusLabelForGuardrails(guardrails.length);
  const guardrailStatusColor =
    guardrailStatus === "healthy" ? colors.success : guardrailStatus === "warning" ? colors.warning : colors.danger;

  return (
    <div id="dashboard-panel" role="tabpanel" aria-labelledby="dashboard-tab">
      {loadingDashboard && <p style={panelStyles.mutedText}>Loading dashboard…</p>}
      {loadError && (
        <p role="alert" style={{ ...panelStyles.mutedText, color: "#991b1b" }}>
          {loadError}
        </p>
      )}
      {!loadingDashboard && !loadError && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginBottom: 12 }}>
            <div style={{ ...panelStyles.card, border: `1px solid ${colors.borderBase}` }}>
              <p style={{ fontSize: 11, color: colors.textMuted, margin: 0 }}>Engine health</p>
              <p style={{ fontSize: 22, margin: "4px 0", fontWeight: 700 }}>{Math.round(mismatchScore * 100)}%</p>
              <p style={{ fontSize: 11, color: colors.textBody, margin: 0 }}>oil_shock mismatch score</p>
            </div>
            <div style={{ ...panelStyles.card, border: `1px solid ${colors.borderBase}` }}>
              <p style={{ fontSize: 11, color: colors.textMuted, margin: 0 }}>Guardrail status</p>
              <p style={{ fontSize: 16, margin: "6px 0 2px", fontWeight: 700, color: guardrailStatusColor }}>{guardrailStatus}</p>
              <p style={{ fontSize: 11, color: colors.textBody, margin: 0 }}>{guardrails.length} active flag(s)</p>
            </div>
            <div style={{ ...panelStyles.card, border: `1px solid ${colors.borderBase}` }}>
              <p style={{ fontSize: 11, color: colors.textMuted, margin: 0 }}>Rule inventory</p>
              <p style={{ fontSize: 16, margin: "6px 0 2px", fontWeight: 700 }}>{rules.length}</p>
              <p style={{ fontSize: 11, color: colors.textBody, margin: 0 }}>active rules loaded</p>
            </div>
            <div style={{ ...panelStyles.card, border: `1px solid ${colors.borderBase}` }}>
              <p style={{ fontSize: 11, color: colors.textMuted, margin: 0 }}>Engine inventory</p>
              <p style={{ fontSize: 16, margin: "6px 0 2px", fontWeight: 700 }}>{engines.length}</p>
              <p style={{ fontSize: 11, color: colors.textBody, margin: 0 }}>{engines.map((engine) => engine.label).join(", ")}</p>
            </div>
          </div>

          <div style={{ marginBottom: 12 }}>
            <p style={{ fontSize: 12, margin: "0 0 6px", fontWeight: 600 }}>Feed freshness matrix</p>
            <div style={{ display: "grid", gap: 6 }}>
              {feedRows.length === 0 && <p style={panelStyles.mutedText}>No feed data available.</p>}
              {feedRows.map((feed) => (
                <div
                  key={feed.feedKey}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", border: `1px solid ${colors.borderSoft}`, borderRadius: 8, padding: "8px 10px" }}
                >
                  <span style={{ fontSize: 12, color: colors.textPrimary }}>{feed.label}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ ...panelStyles.bodyText, textTransform: "uppercase", fontSize: 11 }}>{feed.engineKey}</span>
                    <span style={panelStyles.bodyText}>{Math.round(feed.score * 100)}%</span>
                    <span
                      style={{
                        fontSize: 11,
                        fontWeight: 700,
                        color: "#fff",
                        background: FRESHNESS_COLOR[feed.freshness] ?? colors.textMuted,
                        padding: "2px 6px",
                        borderRadius: 999,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                      }}
                    >
                      {feed.freshness}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div style={panelStyles.card}>
              <p style={{ fontSize: 12, margin: "0 0 6px", fontWeight: 600 }}>Guardrail incidents</p>
              {guardrails.length === 0 ? (
                <p style={{ ...panelStyles.bodyText, color: colors.success, margin: 0 }}>No active incidents</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {guardrails.map((item) => (
                    <li key={item} style={{ ...panelStyles.bodyText, marginBottom: 4 }}>
                      {item}
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div style={panelStyles.card}>
              <p style={{ fontSize: 12, margin: "0 0 6px", fontWeight: 600 }}>Top rule impact</p>
              {topRules.length === 0 ? (
                <p style={{ ...panelStyles.mutedText, margin: 0 }}>No rules available.</p>
              ) : (
                <ul style={{ margin: 0, paddingLeft: 18 }}>
                  {topRules.map((rule) => (
                    <li key={rule.ruleKey} style={{ ...panelStyles.bodyText, marginBottom: 4 }}>
                      {rule.ruleKey} ({rule.weight >= 0 ? "+" : ""}
                      {rule.weight.toFixed(3)})
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
