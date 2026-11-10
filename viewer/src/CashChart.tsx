import { memo, useMemo } from 'react';
import type { Step } from './replay';
import { euro, Rich } from './format';

const W = 380,
  H = 150,
  L = 50,
  R = 8,
  T = 8,
  B = 20;

function niceMax(v: number) {
  const p = Math.pow(10, Math.floor(Math.log10(Math.max(v, 1))));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

function ChartImpl({
  steps,
  idx,
  colors,
  onSeek,
}: {
  steps: Step[];
  idx: number;
  colors: string[];
  onSeek(i: number): void;
}) {
  const n = steps[0].state.players.length;
  const model = useMemo(() => {
    // x = turn + fraction of position inside that turn, so it stays monotone and continuous
    const counts = new Map<number, number>(),
      seen = new Map<number, number>();
    steps.forEach((s) => counts.set(s.state.turn, (counts.get(s.state.turn) ?? 0) + 1));
    const xs = steps.map((s) => {
      const k = seen.get(s.state.turn) ?? 0;
      seen.set(s.state.turn, k + 1);
      return s.state.turn + k / (counts.get(s.state.turn) ?? 1);
    });
    let max = 0;
    steps.forEach((s) =>
      s.state.players.forEach((p) => {
        max = Math.max(max, p.cash);
      }),
    );
    return { xs, max: niceMax(max), xmax: Math.max(1, xs[xs.length - 1]) };
  }, [steps]);
  const X = (x: number) => L + (x / model.xmax) * (W - L - R);
  const Y = (v: number) => T + (1 - v / model.max) * (H - T - B);
  const paths = Array.from({ length: n }, (_, p) =>
    steps
      .map(
        (s, i) =>
          `${i ? 'L' : 'M'}${X(model.xs[i]).toFixed(1)} ${Y(s.state.players[p].cash).toFixed(1)}`,
      )
      .join(' '),
  );
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * model.max);
  const step = model.xmax > 120 ? 40 : model.xmax > 50 ? 20 : model.xmax > 20 ? 10 : 5;
  const xTicks: number[] = [];
  for (let t = 0; t <= model.xmax; t += step) xTicks.push(t);
  const cx = X(model.xs[idx]);

  const seek = (e: React.MouseEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    const t = ((x - L) / (W - L - R)) * model.xmax;
    let best = 0,
      bd = Infinity;
    model.xs.forEach((v, i) => {
      const d = Math.abs(v - t);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    onSeek(best);
  };
  return (
    <div>
      <div className="legend">
        {Array.from({ length: n }, (_, p) => (
          <span key={p}>
            <i style={{ background: colors[p] }} />
            Spieler {p + 1}{' '}
            <b>
              <Rich text={euro(steps[idx].state.players[p].cash)} />
            </b>
          </span>
        ))}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label="Kontostand über die Züge"
        onClick={seek}
        style={{ cursor: 'pointer', display: 'block' }}
      >
        {yTicks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={Y(v)} y2={Y(v)} className="grid" />
            <text x={L - 8} y={Y(v) + 4} textAnchor="end" className="tick">
              <tspan className="money-svg">M</tspan>
              {new Intl.NumberFormat('de-DE').format(v)}
            </text>
          </g>
        ))}
        {xTicks.map((t) => (
          <text key={t} x={X(t)} y={H - 6} textAnchor="middle" className="tick">
            {t}
          </text>
        ))}
        <text x={W - R} y={H - 6} textAnchor="end" className="tick axis">
          Zug
        </text>
        {paths.map((d, p) => (
          <g key={p} fill="none" strokeLinejoin="round">
            <path d={d} stroke="#000" strokeWidth="4" />
            <path d={d} stroke={colors[p]} strokeWidth="2" />
          </g>
        ))}
        <line x1={cx} x2={cx} y1={T} y2={H - B} className="cursor" />
        {Array.from({ length: n }, (_, p) => (
          <circle
            key={p}
            cx={cx}
            cy={Y(steps[idx].state.players[p].cash)}
            r="4"
            fill={colors[p]}
            stroke="#000"
            strokeWidth="1.6"
          />
        ))}
      </svg>
    </div>
  );
}
export const CashChart = memo(ChartImpl);
