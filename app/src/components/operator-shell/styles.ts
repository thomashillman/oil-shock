import type { CSSProperties } from "react";

export const colors = {
  textMuted: "#6b7280",
  textBody: "#4b5563",
  textPrimary: "#111827",
  borderSoft: "#f3f4f6",
  borderBase: "#e5e7eb",
  success: "#16a34a",
  warning: "#d97706",
  danger: "#dc2626",
} as const;

export const panelStyles: Record<string, CSSProperties> = {
  shell: { margin: "8px 20px 0", padding: 16, border: `1px solid ${colors.borderBase}`, borderRadius: 12, background: "#fff" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 },
  tabList: { display: "flex", gap: 8, marginBottom: 12 },
  card: { border: `1px solid ${colors.borderSoft}`, borderRadius: 10, padding: 10 },
  bodyCard: { border: `1px solid ${colors.borderSoft}`, borderRadius: 8, padding: 10 },
  mutedText: { fontSize: 12, color: colors.textMuted },
  bodyText: { fontSize: 12, color: colors.textBody },
};
