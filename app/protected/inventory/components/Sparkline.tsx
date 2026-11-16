// ── Sparkline ──
// Pure inline-SVG price line. No chart dependency; colors come from the
// `className` text color via `currentColor` so it follows the theme.

export function sparklinePath(values: number[], width: number, height: number, pad = 2): string {
  if (values.length === 0) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = values.length > 1 ? (width - pad * 2) / (values.length - 1) : 0;
  return values
    .map((v, i) => {
      const x = pad + i * stepX;
      const y = pad + (1 - (v - min) / span) * (height - pad * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

export function Sparkline({
  values,
  width = 320,
  height = 72,
  className = "",
}: {
  values: number[];
  width?: number;
  height?: number;
  className?: string;
}) {
  const d = sparklinePath(values, width, height);
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className={`block h-20 w-full ${className}`}
      role="img"
      aria-label="Price history"
    >
      <path d={d} fill="none" stroke="currentColor" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}
