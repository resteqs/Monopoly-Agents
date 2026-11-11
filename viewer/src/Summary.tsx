import { useEffect, useMemo, useRef } from 'react';
import type { GameEvent, Replay } from './replay';
import { netWorth } from './replay';
import { pname, psub, reasonLabel } from './describe';
import { euro, Rich } from './format';

/** Key figures of a finished game, derived from the replay (format unchanged). */
function stats(replay: Replay, upTo: number) {
  const n = replay.steps[upTo].state.players.length;
  const rentIn: number[] = Array(n).fill(0),
    rentOut: number[] = Array(n).fill(0),
    jail: number[] = Array(n).fill(0),
    pasch: number[] = Array(n).fill(0);
  for (let s = 0; s <= upTo; s++) {
    for (const e of replay.steps[s].events) {
      if (typeof e.player !== 'number') continue;
      if (e.type === 'rent' && typeof e.amount === 'number') {
        rentOut[e.player] += e.amount;
        if (typeof e.to === 'number') rentIn[e.to] += e.amount;
      }
      if (e.type === 'jail') jail[e.player]++;
      if (e.type === 'dice' && e.doubles && e.reason !== 'utility_card') pasch[e.player]++;
    }
  }
  const st = replay.steps[upTo].state;
  const props = Array.from({ length: n }, (_, p) => st.owner.filter((o) => o === p).length);
  const builds = Array.from({ length: n }, (_, p) =>
    st.buildings.reduce((a, b, i) => a + (st.owner[i] === p ? b : 0), 0),
  );
  return { rentIn, rentOut, jail, pasch, props, builds };
}

/** End moment: winner, net worth bars, key figures, replay / close. */
export function Summary({
  replay,
  idx,
  over,
  colors,
  instant,
  delay,
  onClose,
  onReplay,
}: {
  replay: Replay;
  idx: number;
  over: GameEvent;
  colors: string[];
  instant: boolean;
  delay: number;
  onClose(): void;
  onReplay(): void;
}) {
  const { header } = replay;
  const state = replay.steps[idx].state;
  const n = state.players.length;
  const worth: number[] = Array.isArray(over.net_worth)
    ? (over.net_worth as number[])
    : state.players.map((_, i) => netWorth(state, i));
  const max = Math.max(1, ...worth);
  const st = useMemo(() => stats(replay, idx), [replay, idx]);
  const winner = typeof over.winner === 'number' && over.winner >= 0 ? over.winner : null;
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const t = window.setTimeout(
      () => btn.current?.focus({ preventScroll: true }),
      instant ? 0 : delay + 400,
    );
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', key);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', key);
    };
  }, [instant, delay, onClose]);
  const rows: [string, (p: number) => string][] = [
    ['Miete kassiert', (p) => euro(st.rentIn[p])],
    ['Miete gezahlt', (p) => euro(st.rentOut[p])],
    ['Grundstücke', (p) => String(st.props[p])],
    ['Häuser/Hotels', (p) => String(st.builds[p])],
    ['Pasch', (p) => String(st.pasch[p])],
    ['Im Gefängnis', (p) => `${st.jail[p]}×`],
  ];
  return (
    <div
      className={`summary${instant ? ' instant' : ''}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="sum-h"
      style={instant ? undefined : { animationDelay: `${delay}ms` }}
    >
      <p className="eyebrow">Spiel vorbei · {reasonLabel(over.reason)}</p>
      <h2 id="sum-h">{winner != null ? `Sieger: ${pname(header, winner)}` : 'Unentschieden'}</h2>
      {winner != null && psub(header, winner) && <p className="sum-sub">{psub(header, winner)}</p>}
      <ul className="worth" aria-label="Vermögen am Ende">
        {Array.from({ length: n }, (_, p) => (
          <li
            key={p}
            className={p === winner ? 'win' : ''}
            style={{ ['--pc' as string]: colors[p % colors.length] }}
          >
            <span className="nm">{pname(header, p)}</span>
            <span className="bar">
              <i
                style={{
                  width: `${Math.max(2, (worth[p] / max) * 100)}%`,
                  animationDelay: instant ? undefined : `${delay + 250}ms`,
                }}
              />
            </span>
            <b>
              <Rich text={euro(worth[p])} />
            </b>
          </li>
        ))}
      </ul>
      <table className="sum-stats">
        <thead>
          <tr>
            <td />
            {Array.from({ length: n }, (_, p) => (
              <th
                key={p}
                scope="col"
                style={{
                  boxShadow: `inset 0 -3px 0 ${colors[p % colors.length]}, inset 0 -4px 0 #000`,
                }}
              >
                S{p + 1}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(([l, f]) => (
            <tr key={l}>
              <th scope="row">{l}</th>
              {Array.from({ length: n }, (_, p) => (
                <td key={p}>
                  <Rich text={f(p)} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="sum-meta">
        {state.turn + 1} Züge · {replay.steps.length - 1} Schritte
      </p>
      <div className="sum-actions">
        <button type="button" ref={btn} className="primary" onClick={onReplay}>
          Nochmal ansehen
        </button>
        <button type="button" onClick={onClose}>
          Schließen
        </button>
      </div>
    </div>
  );
}
