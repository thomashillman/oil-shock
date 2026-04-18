// Reusable style constants for Oil Shock
import { theme } from "./theme";
import type { CSSProperties } from "react";

export const styles = {
  // Focus ring styles
  focusRing: {
    outline: `2px solid ${theme.colors.focus_ring}`,
    outlineOffset: "2px",
  } as CSSProperties,

  focusRingDark: {
    outline: `2px solid ${theme.colors.focus_ring_dark}`,
    outlineOffset: "2px",
  } as CSSProperties,

  // Button styles
  button: {
    base: {
      fontFamily: theme.typography.fontStack,
      fontSize: theme.typography.sizes.lg,
      fontWeight: theme.typography.weights.semibold,
      padding: `${theme.spacing.sm} ${theme.spacing.xl}`,
      borderRadius: theme.radius.md,
      border: "none",
      cursor: "pointer",
      transition: `background ${theme.transitions.fast}, border-color ${theme.transitions.fast}`,
      display: "inline-flex",
      alignItems: "center",
      gap: theme.spacing.md,
      lineHeight: theme.typography.lineHeights.tight,
    } as CSSProperties,

    primary: {
      background: theme.colors.light.bg_secondary,
      border: `1px solid ${theme.colors.light.border_primary}`,
      color: theme.colors.light.text_primary,
    } as CSSProperties,

    disabled: {
      opacity: 0.4,
      cursor: "not-allowed",
    } as CSSProperties,
  },

  // Card styles
  card: {
    light: {
      background: theme.colors.light.bg,
      borderRadius: theme.radius.lg,
      padding: `${theme.spacing.xl} ${theme.spacing.xxl}`,
      border: `1px solid ${theme.colors.light.border_primary}`,
    } as CSSProperties,

    dark: {
      background: theme.colors.dark.bg_secondary,
      borderRadius: theme.radius.lg,
      padding: `${theme.spacing.xl} ${theme.spacing.xxl}`,
      border: `1px solid ${theme.colors.dark.border_primary}`,
    } as CSSProperties,
  },

  // Section header
  sectionHeader: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    textTransform: "uppercase",
    letterSpacing: theme.letterSpacing.wider,
    marginBottom: theme.spacing.lg,
  } as CSSProperties,

  // Badge/pill
  badge: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    borderRadius: theme.radius.full,
    padding: `${theme.spacing.sm} ${theme.spacing.xl}`,
    display: "inline-flex",
    alignItems: "center",
    gap: theme.spacing.md,
    lineHeight: theme.typography.lineHeights.tight,
  } as CSSProperties,

  // Progress bar
  progressBar: {
    container: {
      height: "4px",
      background: theme.colors.light.bg_tertiary,
      borderRadius: theme.radius.sm,
      overflow: "hidden",
    } as CSSProperties,

    fill: {
      height: "100%",
      borderRadius: theme.radius.sm,
      transition: `width ${theme.transitions.normal}`,
    } as CSSProperties,
  },

  // Hero band (state container)
  heroBand: (bgColor: string) => ({
    background: bgColor,
    padding: `${theme.spacing.xxxl} ${theme.spacing.xxl}`,
    color: "#fff",
  } as CSSProperties),

  // Label text
  label: {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.medium,
    color: theme.colors.light.text_secondary,
  } as CSSProperties,

  // Help text
  helpText: {
    fontSize: theme.typography.sizes.sm,
    color: theme.colors.light.text_tertiary,
  } as CSSProperties,

  // Input/form fields
  input: {
    base: {
      fontFamily: theme.typography.fontStack,
      fontSize: theme.typography.sizes.base,
      padding: `${theme.spacing.md} ${theme.spacing.lg}`,
      borderRadius: theme.radius.md,
      border: `1px solid ${theme.colors.light.border_primary}`,
      transition: `border-color ${theme.transitions.fast}`,
    } as CSSProperties,

    focus: {
      borderColor: theme.colors.evidence.recognition,
      outline: "none",
    } as CSSProperties,
  },
};

// CSS string utilities for class-based styling
export const cssClasses = {
  // Motion preferences
  reduceMotion: "@media (prefers-reduced-motion: reduce)",
  noReduceMotion: "@media (prefers-reduced-motion: no-preference)",

  // Dark mode
  darkMode: "@media (prefers-color-scheme: dark)",
  lightMode: "@media (prefers-color-scheme: light)",

  // Responsive
  mobile: "@media (max-width: 639px)",
  tablet: "@media (min-width: 640px) and (max-width: 1023px)",
  desktop: "@media (min-width: 1024px)",
};

// Helper to merge styles with motion preference
export const withMotionPreference = (
  normalStyles: CSSProperties,
  reducedMotionStyles?: CSSProperties
): CSSProperties => {
  // Note: In inline styles, we can't apply media queries directly.
  // This is a helper for documentation. Use CSS classes instead.
  return normalStyles;
};
