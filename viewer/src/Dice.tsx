export const PIPS: Record<number, [number, number][]> = {
  1: [[2, 2]],
  2: [
    [1, 1],
    [3, 3],
  ],
  3: [
    [1, 1],
    [2, 2],
    [3, 3],
  ],
  4: [
    [1, 1],
    [3, 1],
    [1, 3],
    [3, 3],
  ],
  5: [
    [1, 1],
    [3, 1],
    [2, 2],
    [1, 3],
    [3, 3],
  ],
  6: [
    [1, 1],
    [3, 1],
    [1, 2],
    [3, 2],
    [1, 3],
    [3, 3],
  ],
};

export function DieFace({ value, size = 64 }: { value: number; size?: number }) {
  const v = Math.min(6, Math.max(1, Math.round(value)));
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      role="img"
      aria-label={`Die showing ${v}`}
    >
      <rect x="4" y="4" width="92" height="92" rx="16" fill="#fff" stroke="#111" strokeWidth="5" />
      {PIPS[v].map(([c, r], k) => (
        <circle key={k} cx={c * 25} cy={r * 25} r="8.5" fill="#111" />
      ))}
    </svg>
  );
}

export function Dice({ values, size = 64 }: { values: [number, number]; size?: number }) {
  return (
    <div style={{ display: 'inline-flex', gap: size * 0.2 }}>
      <DieFace value={values[0]} size={size} />
      <DieFace value={values[1]} size={size} />
    </div>
  );
}
