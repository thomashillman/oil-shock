import type { CSSProperties, ReactNode } from "react";
import { theme } from "../../theme";

interface SectionProps {
  children: ReactNode;
  padding?: string;
  className?: string;
  style?: CSSProperties;
}

export function Section({
  children,
  padding,
  className,
  style,
}: SectionProps) {
  const baseStyle: CSSProperties = {
    padding: padding || `${theme.spacing.xxl}`,
    ...style,
  };

  return (
    <section className={className} style={baseStyle}>
      {children}
    </section>
  );
}
