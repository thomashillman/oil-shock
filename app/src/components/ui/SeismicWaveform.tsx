import type { CSSProperties } from "react";
import { theme } from "../../theme";
import type { HistoryPoint } from "../StateView";

interface SeismicWaveformProps {
  history: HistoryPoint[];
  height?: number;
  color?: string;
  style?: CSSProperties;
}

export function SeismicWaveform({
  history,
  height = 40,
  color = "rgba(255, 136, 0, 0.8)",
  style,
}: SeismicWaveformProps) {
  if (history.length < 2) return null;

  const pts = [...history].reverse();
  const w = 240;
  const h = height;
  const xStep = w / (pts.length - 1);
  const padding = 4;

  // Create path data for angular/jagged line (no curves)
  const pathData = pts
    .map((p, i) => {
      const x = i * xStep + padding;
      const y = h - p.mismatchScore * (h - padding * 2);
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg
      viewBox={`0 0 ${w + padding * 2} ${h}`}
      style={{
        width: "100%",
        height: `${height}px`,
        overflow: "visible",
        display: "block",
        ...style,
      }}
      aria-hidden
    >
      <defs>
        <filter id="glow-waveform">
          <feGaussianBlur stdDeviation="1" result="coloredBlur" />
          <feMerge>
            <feMergeNode in="coloredBlur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Background fill (tension visualization) */}
      <polygon
        points={`${padding},${h} ${pathData} ${w + padding},${h}`}
        fill={color.replace("0.8", "0.15")}
        opacity="0.6"
      />

      {/* Jagged angular line (seismic data) */}
      <polyline
        points={pathData}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinejoin="miter"
        strokeLinecap="square"
        filter="url(#glow-waveform)"
      />

      {/* Data points (small dots at each measurement) */}
      {pts.map((p, i) => {
        const x = i * xStep + padding;
        const y = h - p.mismatchScore * (h - padding * 2);
        return (
          <circle
            key={i}
            cx={x}
            cy={y}
            r="1.5"
            fill={color}
            opacity={i === 0 ? 1 : 0.6}
          />
        );
      })}

      {/* Threshold line (danger zone) */}
      <line
        x1={padding}
        y1={h * 0.3}
        x2={w + padding}
        y2={h * 0.3}
        stroke="rgba(255, 51, 51, 0.3)"
        strokeWidth="1"
        strokeDasharray="3,2"
      />
    </svg>
  );
}
