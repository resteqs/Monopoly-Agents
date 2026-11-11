import { useLayoutEffect, useRef, useState } from 'react';
import { groups, spaces } from './boardData';
import type { ReplayHeader, StepState } from './replay';
import { netWorth } from './replay';
import { PawnIcon, upper } from './Board';
import { AnimatedMoney } from './AnimatedNumber';
import { euro, Rich } from './format';
import { EASE } from './motion';
import { psub, sp } from './describe';

export type Fly = (space: number) => { rect: DOMRect; at: number; dur: number } | null;

const GROUP_ORDER = Object.keys(groups);

function sections(state: StepState, p: number): { key: string; color: string; items: number[] }[] {
  const out: { key: string; color: string; items: number[] }[] = [];
  for (const g of GROUP_ORDER) {
    const items = groups[g].spaces.filter((i) => state.owner[i] === p);
    if (items.length) out.push({ key: g, color: groups[g].color, items });
  }
  const st = spaces.filter((s) => s.type === 'station' && state.owner[s.i] === p).map((s) => s.i);
  if (st.length) out.push({ key: 'station', color: '#1b1b1b', items: st });
  const ut = spaces.filter((s) => s.type === 'utility' && state.owner[s.i] === p).map((s) => s.i);
  if (ut.length) out.push({ key: 'utility', color: '#8b949e', items: ut });
  return out;
}

function Badge({ n }: { n: number }) {
  if (!n) return null;
  return n >= 5 ? (
    <span className="bld hotel" title="Hotel">
      <i />
    </span>
  ) : (
    <span className="bld" title={`${n} ${n === 1 ? 'Haus' : 'Häuser'}`}>
      <i />
      {n}
    </span>
  );
}

/** Band text colour: dark ink on light property colours, white otherwise. */
function bandInk(c: string): string {
  const m = c.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((k) => parseInt(m.slice(k, k + 2), 16));
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62 ? '#111' : '#fff';
}

const NAME_EM = 0.6; // average width of Jost capitals, in em

/** Name and font size that fit `avail` px on one line; long street names get abbreviated before they shrink. */
function fitName(name: string, avail: number): { text: string; fs: number } {
  const up = upper(name);
  const fs = Math.min(8.5, avail / (up.length * NAME_EM));
  if (fs >= 7.4) return { text: up, fs };
  const short = up.replace(/STRAẞE$/, 'STR.');
  const s2 = Math.min(8.5, avail / (short.length * NAME_EM));
  return { text: short, fs: Math.max(6.4, s2) };
}

export function DeedFace({
  space,
  level,
  mortgaged,
  first = true,
  last = true,
}: {
  space: number;
  level: number;
  mortgaged?: boolean;
  first?: boolean;
  last?: boolean;
}) {
  const s = spaces[space];
  const g = s.group ? groups[s.group] : undefined;
  const head = g?.color ?? (s.type === 'station' ? '#1b1b1b' : '#cfd3cc');
  const rent = s.rent?.[Math.min(level, 5)];
  const { text, fs } = fitName(s.name, 76 - 8 - (level ? 16 : 0));
  return (
    <>
      <div className="deed-band" style={{ background: head, ['--bf' as string]: bandInk(head) }}>
        {first && <span className="deed-kind">Besitzrechtkarte</span>}
        <span className="deed-name" style={{ fontSize: fs }}>
          {text}
        </span>
        <Badge n={level} />
      </div>
      {last && (
        <div className="deed-body">
          {mortgaged ? (
            <b>Hypothek</b>
          ) : (
            <>
              <span>{rent != null ? 'Miete' : 'Preis'}</span>
              <b>
                <Rich text={euro(rent ?? s.price ?? 0)} />
              </b>
            </>
          )}
        </div>
      )}
    </>
  );
}

function DeedCard({
  space,
  level,
  mortgaged,
  fly,
  first,
  last,
}: {
  space: number;
  level: number;
  mortgaged: boolean;
  fly?: Fly;
  first: boolean;
  last: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || !fly) return;
    const f = fly(space);
    if (!f) return;
    const from = f.rect;
    const to = el.getBoundingClientRect();
    const dx = from.left + from.width / 2 - (to.left + to.width / 2);
    const dy = from.top + from.height / 2 - (to.top + to.height / 2);
    const k = from.width / to.width;
    el.style.zIndex = '30';
    // lifts off the tile, arcs over the table and lands in its colour-group stack
    const a = el.animate(
      [
        { transform: `translate(${dx}px,${dy}px) scale(${k}) rotate(0deg)`, opacity: 0, offset: 0 },
        {
          transform: `translate(${dx}px,${dy - 18}px) scale(${k * 1.25}) rotate(-6deg)`,
          opacity: 1,
          offset: 0.16,
        },
        {
          transform: `translate(${dx * 0.45}px,${dy * 0.45 - 46}px) scale(${(k + 1) / 2 + 0.25}) rotate(5deg)`,
          opacity: 1,
          offset: 0.55,
        },
        { transform: 'none', opacity: 1 },
      ],
      { duration: Math.max(60, f.dur), delay: f.at, easing: EASE.out, fill: 'backwards' },
    );
    a.onfinish = () => {
      el.style.zIndex = '';
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const s = spaces[space];
  const rentTip = s.rent
    ? `Miete ${s.rent
        .map((r) => euro(r))
        .join(' / ')
        .replace(/₼/g, 'M')}`
    : '';
  return (
    <div
      ref={ref}
      className={`deed${mortgaged ? ' mort' : ''}${first ? ' first' : ''}`}
      data-space={space}
      title={`${s.name}${rentTip ? ' · ' + rentTip : ''}${mortgaged ? ' · Hypothek' : ''}`}
    >
      <DeedFace space={space} level={level} mortgaged={mortgaged} first={first} last={last} />
    </div>
  );
}

function bankPoint() {
  const r = document.querySelector('[data-bank] .bank-box')?.getBoundingClientRect();
  return r
    ? { x: r.left + r.width / 2, y: r.top + r.height / 2 }
    : { x: innerWidth / 2, y: innerHeight / 2 };
}

function Ghost({
  space,
  rect,
  target,
  delay,
  onDone,
}: {
  space: number;
  rect: DOMRect;
  target: { x: number; y: number };
  delay: number;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current!;
    const dx = target.x - (rect.left + rect.width / 2),
      dy = target.y - (rect.top + rect.height / 2);
    const a = el.animate(
      [
        { transform: 'none', opacity: 1 },
        {
          transform: `translate(${dx * 0.1}px,${dy * 0.1 - 26}px) scale(1.1) rotate(-3deg)`,
          opacity: 1,
          offset: 0.2,
        },
        { transform: `translate(${dx}px,${dy}px) scale(.55) rotate(-14deg)`, opacity: 0 },
      ],
      { duration: 900, delay, easing: EASE.in, fill: 'both' },
    );
    a.onfinish = onDone;
    return () => a.cancel();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div
      ref={ref}
      className="deed ghost"
      style={{
        position: 'fixed',
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        zIndex: 50,
      }}
    >
      <DeedFace space={space} level={0} />
    </div>
  );
}

export interface SeatProps {
  player: number;
  color: string;
  header: ReplayHeader;
  state: StepState;
  current: boolean;
  speed: number;
  positionName: string;
  fly?: Fly;
  ghosts?: { nonce: number; spaces: number[]; at: number } | null;
  cashDelay?: number;
  instant?: boolean;
  flash?: boolean;
  winner?: boolean;
  pasch?: { count: number; delay: number } | null;
}

export function Seat({
  player,
  color,
  header,
  state,
  current,
  speed,
  fly,
  ghosts,
  positionName,
  cashDelay = 0,
  instant,
  flash,
  winner,
  pasch,
}: SeatProps) {
  const me = state.players[player];
  const secs = sections(state, player);
  const rects = useRef(new Map<number, DOMRect>());
  const [ghostItems, setGhostItems] = useState<{ space: number; rect: DOMRect }[]>([]);
  const nonce = ghosts?.nonce;

  useLayoutEffect(() => {
    if (!ghosts) return;
    const items = ghosts.spaces.flatMap((space) => {
      const rect = rects.current.get(space);
      return rect ? [{ space, rect }] : [];
    });
    setGhostItems(items);
  }, [nonce]); // eslint-disable-line react-hooks/exhaustive-deps

  const rootRef = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const m = new Map<number, DOMRect>();
    rootRef.current
      ?.querySelectorAll<HTMLElement>('.deed[data-space]')
      .forEach((el) => m.set(Number(el.dataset.space), el.getBoundingClientRect()));
    rects.current = m;
  });

  if (!me) return null;
  const nw = netWorth(state, player);
  const notes = Math.max(1, Math.min(7, Math.ceil(me.cash / 250)));
  const jailed = me.jail_turns > 0;
  const state_ =
    jailed && !me.bankrupt ? { cls: 'warn', text: `Im Gefängnis (${me.jail_turns}/3)` } : null;
  return (
    <section
      ref={rootRef}
      data-seat={player}
      className={`seat${current ? ' current' : ''}${me.bankrupt ? ' bankrupt' : ''}${winner ? ' winner' : ''}`}
      style={{ ['--pc' as string]: color }}
      aria-label={`Spieler ${player + 1}`}
      aria-current={current && !me.bankrupt ? 'true' : undefined}
    >
      <header className="seat-head">
        <PawnIcon player={player} color={color} size={28} />
        <div className="seat-id">
          <h2>Spieler {player + 1}</h2>
          <p>{psub(header, player)}</p>
        </div>
      </header>

      <div className="seat-money">
        <div className="notes" aria-hidden="true">
          {Array.from({ length: notes }, (_, k) => (
            <span
              key={k}
              style={{
                transform: `translate(${k * 2}px,${-k * 2}px) rotate(${(k % 2 ? 1 : -1) * 1.5}deg)`,
              }}
            >
              {k === notes - 1 && (
                <>
                  <b className="money">M</b>
                  <em>100</em>
                </>
              )}
            </span>
          ))}
        </div>
        <div>
          <div className="cash">
            <AnimatedMoney
              value={me.cash}
              speed={speed}
              delay={cashDelay}
              instant={instant}
              flash={flash}
            />
          </div>
          <div className="sub">
            Vermögen <Rich text={euro(nw)} />
          </div>
        </div>
      </div>
      <div className="sub where">Steht auf {positionName}</div>
      {winner && <div className="state win">Sieger</div>}
      {!!pasch && pasch.count > 0 && (
        <div
          className="pasch"
          aria-label={`${pasch.count}. Pasch`}
          title="Pasch in Folge (beim 3. geht es ins Gefängnis)"
        >
          <span>Pasch</span>
          {[0, 1, 2].map((k) => (
            <i
              key={k}
              className={k < pasch.count ? (k === 2 ? 'on red' : 'on') : ''}
              style={k === pasch.count - 1 ? { animationDelay: `${pasch.delay}ms` } : undefined}
            />
          ))}
        </div>
      )}
      {me.bankrupt && <div className="state bad">Bankrott</div>}
      {state_ && <div className={`state ${state_.cls}`}>{state_.text}</div>}

      <div className="rack">
        {secs.map((g) => (
          <div className="stack" key={g.key}>
            {g.items.map((i, k) => (
              <DeedCard
                key={i}
                space={i}
                level={state.buildings[i] ?? 0}
                mortgaged={!!state.mortgaged[i]}
                first={k === 0}
                last={k === g.items.length - 1}
                fly={fly && ghosts == null ? fly : undefined}
              />
            ))}
          </div>
        ))}
        {Array.from({ length: me.jail_cards }, (_, k) => (
          <div className="stack" key={`j${k}`}>
            <div className="deed freecard" title="Du kommst aus dem Gefängnis frei">
              <div className="deed-band" style={{ background: '#f7941d' }} />
              <div className="deed-name">Du kommst aus dem Gefängnis frei</div>
            </div>
          </div>
        ))}
        {!secs.length && !me.jail_cards && <p className="sub empty">Noch keine Besitzrechte</p>}
      </div>
      {ghostItems.map((g) => (
        <Ghost
          key={g.space}
          space={g.space}
          rect={g.rect}
          target={bankPoint()}
          delay={ghosts?.at ?? 0}
          onDone={() => setGhostItems((x) => x.filter((y) => y !== g))}
        />
      ))}
    </section>
  );
}

export { sp };
