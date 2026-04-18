import type { CSSProperties } from "react";
import { theme } from "../../theme";
import { usePrefersReducedMotion } from "../../hooks/useMediaQuery";
import { useDarkMode } from "../../hooks/useDarkMode";

interface ProgressBarProps {
  value: number;
  color?: string;
  height?: string;
  showLabel?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function ProgressBar({
  value,
  color = theme.colors.evidence.physical,
  height = "4px",
  showLabel,
  className,
  style,
}: ProgressBarProps) {
  const percentage = Math.round(Math.min(Math.max(value, 0), 1) * 100);
  const prefersReducedMotion = usePrefersReducedMotion();
  const { isDarkMode } = useDarkMode();

  const containerStyle: CSSProperties = {
    height,
    background: isDarkMode
      ? theme.colors.dark.bg_tertiary
      : theme.colors.light.bg_tertiary,
    borderRadius: theme.radius.sm,
    overflow: "hidden",
    ...style,
  };

  const fillStyle: CSSProperties = {
    height: "100%",
    width: `${percentage}%`,
    background: color,
    borderRadius: theme.radius.sm,
    transition: prefersReducedMotion ? "none" : `width ${theme.transitions.normal}`,
  };

  return (
    <div>
      <div className={className} style={containerStyle}>
        <div style={fillStyle} />
      </div>
      {showLabel && (
        <div
          style={{
            fontSize: theme.typography.sizes.sm,
            color: isDarkMode
              ? theme.colors.dark.text_secondary
              : theme.colors.light.text_secondary,
            marginTop: theme.spacing.sm,
          }}
        >
          {percentage}%
        </div>
      )}
    </div>
  );
}
