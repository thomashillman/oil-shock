// Design tokens for Oil Shock dashboard
// Stripe/Datadog style: professional, data-focused, information-dense

export const theme = {
  // Color palette - Dislocation States
  colors: {
    states: {
      aligned: "#1a3a4a",
      mild_divergence: "#d97706",
      persistent_divergence: "#dc2626",
      deep_divergence: "#7c2d12",
    },

    // Freshness indicators
    freshness: {
      fresh: "#4ade80",
      stale: "#fbbf24",
      missing: "#f87171",
    },

    // Evidence categories (subscores)
    evidence: {
      physical: "#dc2626",
      recognition: "#2563eb",
      transmission: "#d97706",
    },

    // Evidence classification
    classification: {
      confirming: "#16a34a",
      counterevidence: "#f97316",
      falsifier: "#dc2626",
    },

    // Grayscale - Light mode
    light: {
      bg: "#ffffff",
      bg_secondary: "#f9fafb",
      bg_tertiary: "#f3f4f6",
      border_primary: "#e5e7eb",
      border_secondary: "#d1d5db",
      text_primary: "#111827",
      text_secondary: "#6b7280",
      text_tertiary: "#9ca3af",
    },

    // Grayscale - Dark mode
    dark: {
      bg: "#0f1117",
      bg_secondary: "#161b22",
      bg_tertiary: "#21262d",
      border_primary: "#30363d",
      border_secondary: "#444c56",
      text_primary: "#e6edf3",
      text_secondary: "#8b949e",
      text_tertiary: "#6e7681",
    },

    // Status page background
    page_bg_light: "#eaecf0",
    page_bg_dark: "#0d1117",

    // Interactive states
    focus_ring: "rgba(59, 130, 246, 0.5)",
    focus_ring_dark: "rgba(96, 165, 250, 0.3)",
    hover_lift: "rgba(0, 0, 0, 0.04)",
    hover_lift_dark: "rgba(255, 255, 255, 0.08)",

    // Delta indicators
    delta_up: "#fca5a5",
    delta_down: "#86efac",
  },

  // Spacing scale (4px grid)
  spacing: {
    xs: "2px",
    sm: "4px",
    md: "8px",
    lg: "12px",
    xl: "16px",
    xxl: "20px",
    xxxl: "24px",
    huge: "32px",
    giant: "40px",
  },

  // Typography
  typography: {
    sizes: {
      xs: "9px",
      sm: "10px",
      md: "11px",
      base: "12px",
      lg: "13px",
      xl: "14px",
      "2xl": "15px",
      "3xl": "18px",
      "4xl": "20px",
      "5xl": "24px",
      "6xl": "32px",
      "7xl": "48px",
    },
    weights: {
      normal: 400,
      medium: 500,
      semibold: 600,
      bold: 700,
      heavy: 800,
    },
    lineHeights: {
      tight: 1,
      snug: 1.2,
      normal: 1.4,
      relaxed: 1.5,
      loose: 1.6,
    },
    fontStack: 'system-ui, -apple-system, sans-serif',
  },

  // Border radius
  radius: {
    none: "0px",
    sm: "2px",
    md: "6px",
    lg: "8px",
    xl: "12px",
    full: "9999px",
  },

  // Shadows
  shadows: {
    none: "none",
    sm: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
    md: "0 4px 6px -1px rgba(0, 0, 0, 0.1)",
    lg: "0 10px 15px -3px rgba(0, 0, 0, 0.1)",
  },

  // Z-index ladder
  zIndex: {
    base: 0,
    dropdown: 10,
    modal: 100,
    toast: 200,
  },

  // Transitions - respects prefers-reduced-motion
  transitions: {
    fast: "150ms ease",
    normal: "250ms ease",
    slow: "400ms ease",
  },

  // Breakpoints
  breakpoints: {
    mobile: "640px",
    tablet: "1024px",
    desktop: "1200px",
  },

  // Letter spacing
  letterSpacing: {
    tight: "-0.01em",
    normal: "0em",
    wide: "0.03em",
    wider: "0.12em",
    widest: "0.16em",
  },
};

export type Theme = typeof theme;
