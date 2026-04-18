import type { CSSProperties, ReactNode } from "react";
import { theme } from "../../theme";
import { useDarkMode } from "../../hooks/useDarkMode";

interface CardProps {
  children: ReactNode;
  padding?: string;
  borderBottom?: boolean;
  className?: string;
  style?: CSSProperties;
}

export function Card({
  children,
  padding,
  borderBottom = false,
  className,
  style,
}: CardProps) {
  const { isDarkMode } = useDarkMode();

  const baseStyle: CSSProperties = {
    background: isDarkMode
      ? theme.colors.dark.bg_secondary
      : theme.colors.light.bg,
    borderRadius: theme.radius.lg,
    padding: padding || `${theme.spacing.xl} ${theme.spacing.xxl}`,
    borderBottom: borderBottom
      ? `1px solid ${isDarkMode ? theme.colors.dark.border_primary : theme.colors.light.border_primary}`
      : "none",
    ...style,
  };

  return (
    <div className={className} style={baseStyle}>
      {children}
    </div>
  );
}
