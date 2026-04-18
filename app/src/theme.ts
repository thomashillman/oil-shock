// Design tokens for Oil Shock — Seismic Crisis Monitoring Dashboard
// Aesthetic: Emergency control room / geological pressure visualization
// Visual language: technical, measured, electric, glowing accents

export const theme = {
  // Color palette - Seismic State Escalation
  colors: {
    states: {
      // Vigilant stable state (deep cool blue with subtle glow potential)
      aligned: "#0a1a2a",
      // Early warning (electric orange, building tension)
      mild_divergence: "#ff8800",
      // Active crisis (bright red, urgent glow)
      persistent_divergence: "#ff3333",
      // Systemic failure (deep red, darkest intensity)
      deep_divergence: "#8b0000",
    },

    // State accent glows (for visual pressure indication)
    glows: {
      aligned: "rgba(0, 200, 255, 0.4)",
      mild_divergence: "rgba(255, 136, 0, 0.4)",
      persistent_divergence: "rgba(255, 51, 51, 0.5)",
      deep_divergence: "rgba(255, 51, 51, 0.6)",
    },

    // Freshness indicators (measured signal quality)
    freshness: {
      fresh: "#00ff00",
      stale: "#ffaa00",
      missing: "#ff4444",
    },

    // Evidence categories (seismic pressure components)
    evidence: {
      physical: "#ff3333",
      recognition: "#00ccff",
      transmission: "#ffaa00",
    },

    // Evidence classification (signal quality)
    classification: {
      confirming: "#00ff00",
      counterevidence: "#ffaa00",
      falsifier: "#ff3333",
    },

    // Grayscale - Dark mode (scientific instrument)
    light: {
      bg: "#0a0f15",
      bg_secondary: "#0f1420",
      bg_tertiary: "#141a22",
      border_primary: "#1a2838",
      border_secondary: "#233350",
      text_primary: "#e8f0ff",
      text_secondary: "#a8b8d8",
      text_tertiary: "#707a8a",
    },

    dark: {
      bg: "#050810",
      bg_secondary: "#0a0f15",
      bg_tertiary: "#0f1420",
      border_primary: "#1a2838",
      border_secondary: "#233350",
      text_primary: "#e8f0ff",
      text_secondary: "#a8b8d8",
      text_tertiary: "#707a8a",
    },

    // Page and container backgrounds
    page_bg_light: "#050810",
    page_bg_dark: "#050810",

    // Focus and interaction (cyan/electric)
    focus_ring: "rgba(0, 200, 255, 0.6)",
    focus_ring_dark: "rgba(0, 200, 255, 0.6)",

    // Delta indicators (pressure direction)
    delta_up: "#ff5555",
    delta_down: "#00ff88",
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

  // Typography - Monospace Technical Feel
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
    // Monospace font stack: IBM Plex Mono > Roboto Mono > Courier New
    fontStack: '"IBM Plex Mono", "Roboto Mono", "Courier New", monospace',
    // Monospace for numbers/data (technical, measured feel)
    monoStack: '"Courier New", monospace',
  },

  // Border radius (sharp, angular edges)
  radius: {
    none: "0px",
    sm: "1px",
    md: "2px",
    lg: "4px",
    xl: "6px",
    full: "9999px",
  },

  // Shadows (sharp, technical, no soft blur)
  shadows: {
    none: "none",
    sm: "0 0 8px rgba(0, 200, 255, 0.1)",
    md: "0 0 16px rgba(0, 200, 255, 0.15)",
    lg: "0 0 24px rgba(0, 200, 255, 0.2)",
    glow: "0 0 20px rgba(255, 51, 51, 0.3)",
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
    fast: "150ms ease-in-out",
    normal: "250ms ease-in-out",
    slow: "400ms ease-in-out",
  },

  // Breakpoints
  breakpoints: {
    mobile: "640px",
    tablet: "1024px",
    desktop: "1200px",
  },

  // Letter spacing (tight for monospace, wider for display)
  letterSpacing: {
    tight: "-0.01em",
    normal: "0em",
    wide: "0.05em",
    wider: "0.1em",
    widest: "0.2em",
  },
};

export type Theme = typeof theme;
