/* The bank: a physical pile of banknote stacks on the table (outside the board).
   Cash flights to and from the bank (Fx.tsx) aim at the element marked data-bank. */
const STACKS: {
  v: number;
  fill: string;
  ink: string;
  n: number;
  x: number;
  y: number;
  r: number;
}[] = [
  { v: 500, fill: '#f7941d', ink: '#5a2f00', n: 6, x: 2, y: 30, r: -9 },
  { v: 100, fill: '#ead9a6', ink: '#4a3d12', n: 7, x: 28, y: 14, r: -4 },
  { v: 50, fill: '#8ec9ef', ink: '#10364f', n: 5, x: 56, y: 8, r: 2 },
  { v: 20, fill: '#9fd8a5', ink: '#14411a', n: 6, x: 84, y: 14, r: 7 },
  { v: 10, fill: '#f2e27a', ink: '#4c4308', n: 4, x: 108, y: 28, r: 12 },
  { v: 5, fill: '#f2a6c8', ink: '#5a1736', n: 3, x: 40, y: 38, r: -2 },
  { v: 1, fill: '#f4f4ee', ink: '#333', n: 3, x: 74, y: 40, r: 5 },
];

export function Bank() {
  return (
    <div className="bank" data-bank title="Bank">
      <div className="bank-box">
        <div className="bank-shadow" />
        {STACKS.map((s) => (
          <div
            key={s.v}
            className="bank-stack"
            style={{ left: s.x, top: s.y, transform: `rotate(${s.r}deg)` }}
          >
            {Array.from({ length: s.n }, (_, k) => (
              <i key={k} style={{ background: s.fill, color: s.ink, bottom: k * 2 }}>
                {k === s.n - 1 && (
                  <>
                    <b>M</b>
                    <span>{s.v}</span>
                  </>
                )}
              </i>
            ))}
          </div>
        ))}
      </div>
      <span className="bank-label">Bank</span>
    </div>
  );
}
