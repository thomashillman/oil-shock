import type { CSSProperties, ReactNode } from "react";
import { theme } from "../../theme";
import { useDarkMode } from "../../hooks/useDarkMode";

interface HeadingProps {
  level: 1 | 2 | 3 | 4 | 5 | 6;
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

const sizeMap = {
  1: theme.typography.sizes["7xl"],
  2: theme.typography.sizes["4xl"],
  3: theme.typography.sizes["3xl"],
  4: theme.typography.sizes["2xl"],
  5: theme.typography.sizes.xl,
  6: theme.typography.sizes.lg,
};

const weightMap = {
  1: theme.typography.weights.heavy,
  2: theme.typography.weights.bold,
  3: theme.typography.weights.bold,
  4: theme.typography.weights.semibold,
  5: theme.typography.weights.semibold,
  6: theme.typography.weights.semibold,
};

const HeadingTags = {
  1: "h1" as const,
  2: "h2" as const,
  3: "h3" as const,
  4: "h4" as const,
  5: "h5" as const,
  6: "h6" as const,
};

export function Heading({
  level,
  children,
  className,
  style,
}: HeadingProps) {
  const { isDarkMode } = useDarkMode();
  const Tag = HeadingTags[level];

  const baseStyle: CSSProperties = {
    fontSize: sizeMap[level],
    fontWeight: weightMap[level],
    lineHeight: theme.typography.lineHeights.snug,
    color: isDarkMode
      ? theme.colors.dark.text_primary
      : theme.colors.light.text_primary,
    margin: 0,
    ...style,
  };

  return (
    <Tag className={className} style={baseStyle}>
      {children}
    </Tag>
  );
}
