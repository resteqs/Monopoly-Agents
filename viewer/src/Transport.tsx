import type { ReactNode } from 'react';

const ic = (d: ReactNode) => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true">
    {d}
  </svg>
);
const I = {
  first: ic(
    <>
      <rect x="5" y="5" width="2.5" height="14" rx="1" />
      <path d="M19 5.5v13L9.5 12z" />
    </>,
  ),
  prevTurn: ic(<path d="M12 5.5v13L2.5 12zM21.5 5.5v13L12 12z" />),
  back: ic(<path d="M17 5.5v13L7 12z" />),
  play: ic(<path d="M7 4.5v15L19.5 12z" />),
  pause: ic(
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </>,
  ),
  fwd: ic(<path d="M7 5.5v13L17 12z" transform="rotate(180 12 12)" />),
  nextTurn: ic(<path d="M12 5.5v13L21.5 12zM2.5 5.5v13L12 12z" />),
  skip: ic(
    <>
      <path d="M3 6l7 6-7 6zM12 6l7 6-7 6z" />
      <path d="M21 5v14" stroke="currentColor" strokeWidth="2" fill="none" />
    </>,
  ),
  last: ic(
    <>
      <rect x="16.5" y="5" width="2.5" height="14" rx="1" />
      <path d="M5 5.5v13L14.5 12z" />
    </>,
  ),
};

export const SPEEDS = [0.5, 1, 2, 4, 8, 16];

interface Props {
  playing: boolean;
  idx: number;
  total: number;
  turn: number;
  speed: number;
  skipForced: boolean;
  onToggle(): void;
  onFirst(): void;
  onLast(): void;
  onPrev(): void;
  onNext(): void;
  onPrevTurn(): void;
  onNextTurn(): void;
  onSeek(i: number): void;
  onSpeed(s: number): void;
  onSkip(v: boolean): void;
  caption: ReactNode;
  extra?: ReactNode;
  dice?: ReactNode;
  ticks: number[];
}

export function Transport(p: Props) {
  const btn = (label: string, tip: string, icon: ReactNode, fn: () => void, primary = false) => (
    <button
      type="button"
      className={`tbtn${primary ? ' primary' : ''}`}
      onClick={fn}
      title={tip}
      aria-label={label}
    >
      {icon}
    </button>
  );
  const last = Math.max(1, p.total - 1);
  return (
    <div className="transport" role="region" aria-label="Wiedergabe">
      <div className="now">
        <div className="now-dice">{p.dice}</div>
        <div className="now-text" aria-live="polite">
          {p.caption}
        </div>
        {p.extra}
      </div>
      <div className="btns">
        {btn('Zum Anfang', 'Zum Anfang (Pos1)', I.first, p.onFirst)}
        {btn('Voriger Zug', 'Voriger Zug ([)', I.prevTurn, p.onPrevTurn)}
        {btn('Schritt zurück', 'Schritt zurück (←)', I.back, p.onPrev)}
        {btn(
          p.playing ? 'Pause' : 'Abspielen',
          p.playing ? 'Pause (Leertaste)' : 'Abspielen (Leertaste)',
          p.playing ? I.pause : I.play,
          p.onToggle,
          true,
        )}
        {btn('Schritt vor', 'Schritt vor (→)', I.fwd, p.onNext)}
        {btn('Nächster Zug', 'Nächster Zug (])', I.nextTurn, p.onNextTurn)}
        {btn('Zum Ende', 'Zum Ende (Ende)', I.last, p.onLast)}
      </div>
      <div className="timeline" style={{ ['--p' as string]: `${(p.idx / last) * 100}%` }}>
        <div className="ticks" aria-hidden="true">
          {p.ticks.map((t, k) => (
            <i
              key={t}
              className={k % 10 === 0 ? 'major' : undefined}
              style={{ left: `${(t / last) * 100}%` }}
            />
          ))}
        </div>
        <input
          type="range"
          min={0}
          max={p.total - 1}
          value={p.idx}
          onChange={(e) => p.onSeek(Number(e.target.value))}
          aria-label="Zeitleiste"
          title="Zeitleiste"
        />
      </div>
      <div className="pos">
        <span>
          Schritt {p.idx} von {p.total - 1}
        </span>
        <span>Zug {p.turn + 1}</span>
      </div>
      <label className="tempo" title="Geschwindigkeit (↑/↓)">
        <select
          value={p.speed}
          aria-label="Tempo"
          onChange={(e) => p.onSpeed(Number(e.target.value))}
        >
          {SPEEDS.map((s) => (
            <option key={s} value={s}>
              {s}×
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        className="tbtn skip"
        aria-pressed={p.skipForced}
        onClick={() => p.onSkip(!p.skipForced)}
        title="Erzwungene Schritte überspringen (Schritte, die die Engine automatisch ausgeführt hat)"
        aria-label="Erzwungene Schritte überspringen"
      >
        {I.skip}
      </button>
    </div>
  );
}
