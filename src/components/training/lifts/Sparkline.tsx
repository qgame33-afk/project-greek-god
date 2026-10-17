/**
 * A 28-day line for one lift (§3.4.3): stroke only, no axes. Leaf when the line rose by a real
 * margin (≥ 1 lb or 1 rep), stone otherwise; a single session is one dot; none draws nothing (the
 * space stays, so rows line up).
 */
export function Sparkline({ values, label, className }: { values: number[]; label?: string; className?: string }) {
  const W = 64;
  const H = 24;
  const P = 3;
  if (!values.length) return <span aria-hidden className={className} style={{ width: W, height: H, display: "inline-block" }} />;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const pts = values.map((v, i) => [values.length === 1 ? W / 2 : P + (i * (W - 2 * P)) / (values.length - 1), H - P - ((v - lo) / span) * (H - 2 * P)] as const);
  const rose = values.length > 1 && values[values.length - 1] - values[0] >= 1;
  const stroke = rose ? "var(--leaf-400)" : "var(--stone)";
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width={W} height={H} className={className} role={label ? "img" : undefined} aria-label={label} aria-hidden={label ? undefined : true}>
      {pts.length > 1 && <polyline points={pts.map(([x, y]) => `${x.toFixed(1)},${(values.length === 1 ? H / 2 : y).toFixed(1)}`).join(" ")} fill="none" style={{ stroke }} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />}
      <circle cx={lx} cy={values.length === 1 ? H / 2 : ly} r={2} style={{ fill: stroke }} />
    </svg>
  );
}
