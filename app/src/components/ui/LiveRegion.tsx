import type { ReactNode } from "react";

interface LiveRegionProps {
  children: ReactNode;
  polite?: boolean;
  ariaLive?: "polite" | "assertive";
}

// Accessibility component for screen reader announcements
export function LiveRegion({
  children,
  polite = true,
  ariaLive = "polite",
}: LiveRegionProps) {
  return (
    <div
      role="status"
      aria-live={ariaLive}
      aria-atomic="true"
      style={{
        position: "absolute",
        left: "-9999px",
        width: "1px",
        height: "1px",
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}
