import type { CSSProperties, ReactNode } from "react";
import { theme } from "../../theme";

interface ButtonProps {
  onClick?: () => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLButtonElement>) => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: "primary" | "secondary";
  size?: "sm" | "md" | "lg";
  children: ReactNode;
  "aria-label"?: string;
  className?: string;
  style?: CSSProperties;
}

export function Button({
  onClick,
  onKeyDown,
  disabled,
  loading,
  variant = "primary",
  size = "md",
  children,
  "aria-label": ariaLabel,
  className,
  style,
}: ButtonProps) {
  const baseStyle: CSSProperties = {
    fontFamily: theme.typography.fontStack,
    fontSize:
      size === "sm"
        ? theme.typography.sizes.sm
        : size === "lg"
          ? theme.typography.sizes.lg
          : theme.typography.sizes.base,
    fontWeight: theme.typography.weights.semibold,
    padding:
      size === "sm"
        ? `${theme.spacing.xs} ${theme.spacing.md}`
        : size === "lg"
          ? `${theme.spacing.md} ${theme.spacing.xxl}`
          : `${theme.spacing.sm} ${theme.spacing.xl}`,
    borderRadius: theme.radius.md,
    border: "none",
    cursor: disabled || loading ? "not-allowed" : "pointer",
    display: "inline-flex",
    alignItems: "center",
    gap: theme.spacing.md,
    lineHeight: theme.typography.lineHeights.tight,
    opacity: disabled || loading ? 0.4 : 1,
    background:
      variant === "primary"
        ? theme.colors.light.bg_secondary
        : "transparent",
    color: theme.colors.light.text_primary,
    borderColor: theme.colors.light.border_primary,
    ...style,
  };

  return (
    <button
      onClick={onClick}
      onKeyDown={onKeyDown}
      disabled={disabled || loading}
      aria-label={ariaLabel}
      className={className}
      style={baseStyle}
    >
      {children}
    </button>
  );
}
