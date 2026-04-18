import type { CSSProperties, ReactNode } from "react";
import { theme } from "../../theme";

interface BadgeProps {
  children: ReactNode;
  color?: string;
  backgroundColor?: string;
  icon?: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function Badge({
  children,
  color,
  backgroundColor,
  icon,
  className,
  style,
}: BadgeProps) {
  const baseStyle: CSSProperties = {
    fontSize: theme.typography.sizes.sm,
    fontWeight: theme.typography.weights.bold,
    borderRadius: theme.radius.full,
    padding: `${theme.spacing.sm} ${theme.spacing.xl}`,
    display: "inline-flex",
    alignItems: "center",
    gap: icon ? theme.spacing.md : undefined,
    lineHeight: theme.typography.lineHeights.tight,
    color: color || theme.colors.light.text_primary,
    backgroundColor: backgroundColor || "rgba(0, 0, 0, 0.05)",
    ...style,
  };

  return (
    <span className={className} style={baseStyle}>
      {icon && <span>{icon}</span>}
      {children}
    </span>
  );
}
