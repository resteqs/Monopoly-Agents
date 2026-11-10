/* Effect layer: renders the beats of a motion plan (motion.ts) above the table.
   Everything animates transform/opacity through the Web Animations API, started once per beat with its plan delay,
   so a step's choreography runs on the compositor and never touches layout. */
import { useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { CORNER, placement, SIZE } from './boardData';
import { PIPS } from './Dice';
import { euro, Rich } from './format';
import { EASE, type Beat, type Party, type Plan } from './motion';

interface Geo {
  nonce: number;
  bx: number;
  by: number;
  bw: number;
  bank: Pt;
  bankW: number;
  seat: Record<number, { x: number; y: number }>;
  colors: string[];
}
type Pt = { x: number; y: number };

function measure(board: HTMLElement | null, nonce: number, colors: string[]): Geo | null {
  if (!board) return null;
  const r = board.getBoundingClientRect();
  const seat: Geo['seat'] = {};
  document.querySelectorAll<HTMLElement>('[data-seat]').forEach((el) => {
    const t = (el.querySelector('.seat-money') as HTMLElement | null) ?? el;
    const q = t.getBoundingClientRect();
    seat[Number(el.dataset.seat)] = { x: q.left + q.width / 2, y: q.top + q.height / 2 };
  });
  const bk = document.querySelector<HTMLElement>('[data-bank] .bank-box')?.getBoundingClientRect();
  const bank =
    bk && bk.width > 0
      ? { x: bk.left + bk.width / 2, y: bk.top + bk.height * 0.55 }
      : { x: r.right - r.width * 0.06, y: r.bottom + 20 };
  return { nonce, bx: r.left, by: r.top, bw: r.width, bank, bankW: bk?.width ?? 140, seat, colors };
}

const centre = (g: Geo): Pt => ({ x: g.bx + g.bw / 2, y: g.by + g.bw / 2 });
const bankPt = (g: Geo): Pt => g.bank;
const party = (g: Geo, p: Party): Pt => (p === 'bank' ? bankPt(g) : (g.seat[p.seat] ?? centre(g)));
const tileRect = (g: Geo, space: number) => {
  const k = g.bw / SIZE,
    p = placement(space);
  return { x: g.bx + p.x * k, y: g.by + p.y * k, w: p.w * k, h: p.h * k };
};

type Kf = Keyframe[];
type Opt = { delay: number; duration: number; easing?: string };
/** Runs animations for the lifetime of the component, cancelling them on unmount. */
function useWaapi(run: (A: (el: Element | null, kf: Kf, o: Opt) => void) => void) {
  useLayoutEffect(() => {
    const all: Animation[] = [];
    run((el, kf, o) => {
      if (el && el.animate) all.push(el.animate(kf, { fill: 'both', ...o }));
    });
    return () => all.forEach((a) => a.cancel());
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
}

const hidden: CSSProperties = { opacity: 0 };
const at = (p: Pt): CSSProperties => ({
  position: 'fixed',
  left: p.x,
  top: p.y,
  width: 0,
  height: 0,
});

/* ---------- dice ---------- */

const ORIENT: Record<number, string> = {
  1: 'rotateY(0deg)',
  2: 'rotateY(-90deg)',
  5: 'rotateY(90deg)',
  6: 'rotateY(180deg)',
  3: 'rotateX(-90deg)',
  4: 'rotateX(90deg)',
};
const FACE_TF: Record<number, string> = {
  1: '',
  2: 'rotateY(90deg)',
  5: 'rotateY(-90deg)',
  6: 'rotateY(180deg)',
  3: 'rotateX(90deg)',
  4: 'rotateX(-90deg)',
};

function Face({ v, d }: { v: number; d: number }) {
  return (
    <div className="face" style={{ transform: `${FACE_TF[v]} translateZ(${d / 2}px)` }}>
      {PIPS[v].map(([c, r], k) => (
        <i
          key={k}
          className={v === 1 ? 'one' : undefined}
          style={{ left: `${c * 25}%`, top: `${r * 25}%` }}
        />
      ))}
    </div>
  );
}

const clampDie = (v: number) => Math.min(6, Math.max(1, Math.round(v) || 1));

function DiceFx({ b, g }: { b: Extract<Beat, { k: 'dice' }>; g: Geo }) {
  const bw = g.bw,
    c = centre(g);
  const side = b.player % 2 === 0 ? -1 : 1; // thrown towards the acting player's side of the board
  const home: Pt = { x: c.x + side * bw * 0.15, y: c.y + bw * 0.02 };
  const d = Math.max(34, bw * 0.07);
  const from = g.seat[b.player] ?? home;
  const vals = [clampDie(b.d1), clampDie(b.d2)];
  const sum = b.d1 + b.d2;
  const T = b.throwMs,
    tTumble = T + b.holdMs,
    tSwap = tTumble + b.swapMs,
    tNum = tSwap + b.numHold,
    all = b.dur;
  const root = useRef<HTMLDivElement>(null),
    num = useRef<HTMLDivElement>(null),
    pips = useRef<HTMLDivElement>(null),
    shadow = useRef<HTMLDivElement>(null);
  const wraps = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];
  const cubes = [useRef<HTMLDivElement>(null), useRef<HTMLDivElement>(null)];

  useWaapi((A) => {
    if (!b.brief) {
      const G = tSwap;
      A(
        root.current,
        [
          { opacity: 0, offset: 0 },
          { opacity: 1, offset: Math.min(0.1, 80 / G) },
          { opacity: 1, offset: tTumble / G },
          { opacity: 0, offset: 1 },
        ],
        { delay: b.at, duration: G },
      );
      A(
        shadow.current,
        [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: 0.4 },
          { opacity: 1, offset: 0.55 },
          { opacity: 1 },
        ],
        { delay: b.at, duration: T },
      );
      wraps.forEach((w, i) => {
        const rx = (i ? 1 : -1) * d * 0.62,
          ry = (i ? 0.12 : -0.12) * d;
        const sx = from.x - home.x,
          sy = from.y - home.y;
        const tr = (x: number, y: number, s: number) => `translate(${x}px,${y}px) scale(${s})`;
        A(
          w.current,
          [
            { transform: tr(sx, sy, 0.45), offset: 0, easing: 'cubic-bezier(.25,.6,.5,1)' },
            { transform: tr(rx, ry, 1.12), offset: 0.42, easing: 'ease-out' },
            { transform: tr(rx, ry - bw * 0.045, 1.05), offset: 0.6, easing: 'ease-in' },
            { transform: tr(rx, ry, 1), offset: 0.76, easing: 'ease-out' },
            { transform: tr(rx, ry - bw * 0.012, 1), offset: 0.88, easing: 'ease-in' },
            { transform: tr(rx, ry, 1), offset: 1 },
          ],
          { delay: b.at, duration: T },
        );
        const k = i ? -1 : 1,
          o = ORIENT[vals[i]];
        A(
          cubes[i].current,
          [
            {
              transform: `rotateX(${k * -(560 + vals[i] * 40)}deg) rotateY(${k * (470 + vals[i] * 30)}deg) rotateZ(${k * 70}deg) ${o}`,
            },
            { transform: `rotateX(0deg) rotateY(0deg) rotateZ(0deg) ${o}` },
          ],
          { delay: b.at, duration: T, easing: 'cubic-bezier(.15,.55,.25,1)' },
        );
      });
      A(
        pips.current,
        [
          { opacity: 0, offset: 0 },
          { opacity: 0, offset: (T * 0.8) / all },
          { opacity: 1, offset: (T * 0.8 + 140) / all },
          { opacity: 1, offset: tNum / all },
          { opacity: 0, offset: 1 },
        ],
        { delay: b.at, duration: all },
      );
      A(
        num.current,
        [
          { opacity: 0, transform: 'scale(.8)', offset: 0 },
          { opacity: 0, transform: 'scale(.8)', offset: tTumble / all },
          {
            opacity: 1,
            transform: 'scale(1.1)',
            offset: (tTumble + b.swapMs * 0.6) / all,
            easing: EASE.out,
          },
          { opacity: 1, transform: 'scale(1)', offset: tSwap / all },
          { opacity: 1, transform: 'scale(1)', offset: tNum / all },
          { opacity: 0, transform: 'scale(1.08)', offset: 1 },
        ],
        { delay: b.at, duration: all },
      );
    } else {
      A(
        num.current,
        [
          { opacity: 0, offset: 0 },
          { opacity: 1, offset: 0.12 },
          { opacity: 1, offset: 0.7 },
          { opacity: 0, offset: 1 },
        ],
        { delay: b.at, duration: b.numHold + b.fadeMs },
      );
    }
  });

  const px = d * 0.62;
  return (
    <>
      {!b.brief && (
        <div
          ref={root}
          className="fx-dice"
          style={{ ...at(home), ...hidden, perspective: bw * 1.1 }}
        >
          <div
            ref={shadow}
            style={{
              ...hidden,
              position: 'absolute',
              left: -px * 2,
              top: d * 0.5,
              width: px * 4,
              height: d * 0.4,
              background: 'radial-gradient(closest-side, rgba(0,0,0,.42), transparent)',
            }}
          />
          {[0, 1].map((i) => (
            <div
              key={i}
              ref={wraps[i]}
              className={`die-wrap${b.pasch ? ' dbl' : ''}`}
              style={{ left: -d / 2, top: -d / 2, width: d, height: d }}
            >
              <div
                className="die-tilt"
                style={{
                  transform: i
                    ? 'rotateX(-20deg) rotateY(-24deg)'
                    : 'rotateX(-24deg) rotateY(28deg)',
                }}
              >
                <div ref={cubes[i]} className="cube" style={{ width: d, height: d }}>
                  {[1, 2, 3, 4, 5, 6].map((v) => (
                    <Face key={v} v={v} d={d} />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {!b.brief && b.pasch > 0 && (
        <div
          ref={pips}
          className="fx-pasch"
          style={{ ...at({ x: home.x, y: home.y - d * 1.45 }), ...hidden }}
        >
          <div className="fx-pasch-in">
            {[0, 1, 2].map((k) => (
              <i
                key={k}
                className={k < b.pasch ? (k === 2 ? 'on red' : 'on') : ''}
                style={
                  k === b.pasch - 1
                    ? { animation: `pippop 420ms ${b.at + T * 0.82}ms ${EASE.pop} both` }
                    : undefined
                }
              />
            ))}
            <span>{b.pasch >= 3 ? '3. Pasch → Gefängnis' : `${b.pasch}. Pasch`}</span>
          </div>
        </div>
      )}
      <div
        ref={num}
        className={`fx-num${b.util ? ' util' : ''}`}
        style={{ ...at(home), ...hidden, fontSize: Math.max(30, bw * 0.095) }}
      >
        <div className="plaque">
          <span>{sum}</span>
          {b.util && <small>×10</small>}
        </div>
      </div>
    </>
  );
}

/* ---------- cash: banknotes between seats and the bank ----------
   Player <-> player: notes in Monopoly denomination colours, edged in the payer's colour.
   Player <-> bank: plain kit-green notes, and the bank pile on the table bumps when it absorbs or releases them.
   "-M50" leaves the payer, "+M50" lands at the receiver. */

const DENOMS: [number, string][] = [
  [500, '#f7941d'],
  [100, '#ead9a6'],
  [50, '#8ec9ef'],
  [20, '#9fd8a5'],
  [10, '#f2e27a'],
  [5, '#f2a6c8'],
  [1, '#f4f4ee'],
];
/** Denomination colours of the first `count` notes of a greedy breakdown of `amount`. */
function denomColours(amount: number, count: number): [number, string][] {
  const out: [number, string][] = [];
  let rest = Math.max(1, Math.round(amount));
  for (const [v, c] of DENOMS)
    while (rest >= v && out.length < count) {
      out.push([v, c]);
      rest -= v;
    }
  while (out.length < count) out.push([1, '#f4f4ee']);
  return out;
}

function Note({
  fill,
  edge,
  thick,
  v,
}: {
  fill: string;
  edge: string;
  thick?: boolean;
  v: number;
}) {
  return (
    <i className="bn" style={{ background: fill, borderColor: edge, borderWidth: thick ? 3 : 1.5 }}>
      <b className="money">M</b>
      <span>{v}</span>
    </i>
  );
}

function Flight({
  from,
  to,
  delay,
  duration,
  children,
  lift = 56,
}: {
  from: Pt;
  to: Pt;
  delay: number;
  duration: number;
  lift?: number;
  children: ReactNode;
}) {
  const el = useRef<HTMLDivElement>(null);
  useWaapi((A) => {
    const dx = to.x - from.x,
      dy = to.y - from.y,
      l = Math.min(lift, Math.hypot(dx, dy) * 0.25);
    A(
      el.current,
      [
        { transform: 'translate(0px,0px) scale(.5) rotate(-12deg)', opacity: 0, offset: 0 },
        {
          transform: `translate(${dx * 0.04}px,${dy * 0.04 - 8}px) scale(1) rotate(-6deg)`,
          opacity: 1,
          offset: 0.12,
        },
        {
          transform: `translate(${dx * 0.5}px,${dy * 0.5 - l}px) scale(1.1) rotate(8deg)`,
          opacity: 1,
          offset: 0.5,
        },
        {
          transform: `translate(${dx}px,${dy}px) scale(.7) rotate(-6deg)`,
          opacity: 1,
          offset: 0.92,
        },
        { transform: `translate(${dx}px,${dy}px) scale(.6) rotate(0deg)`, opacity: 0, offset: 1 },
      ],
      { delay, duration, easing: EASE.inOut },
    );
  });
  return (
    <div ref={el} style={{ ...at(from), ...hidden }}>
      {children}
    </div>
  );
}

/** Amount label that appears at a seat, rises and fades. */
function Pop({
  p,
  delay,
  s,
  sign,
  amount,
}: {
  p: Pt;
  delay: number;
  s: number;
  sign: '+' | '−';
  amount: number;
}) {
  const el = useRef<HTMLDivElement>(null);
  useWaapi((A) => {
    A(
      el.current,
      [
        { opacity: 0, transform: 'translateY(8px) scale(.7)', offset: 0 },
        { opacity: 1, transform: 'translateY(-6px) scale(1.12)', offset: 0.18, easing: EASE.out },
        { opacity: 1, transform: 'translateY(-14px) scale(1)', offset: 0.65 },
        { opacity: 0, transform: 'translateY(-30px) scale(1)', offset: 1 },
      ],
      { delay, duration: 950 * s },
    );
  });
  return (
    <div
      ref={el}
      className={`fx-pop ${sign === '+' ? 'up' : 'down'}`}
      style={{ left: p.x, top: p.y - 40, ...hidden }}
    >
      <Rich text={`${sign}${euro(amount)}`} />
    </div>
  );
}

/** The pile bumps (and a ring ripples) when it absorbs or releases notes. */
function BankPulse({ g, delay, s }: { g: Geo; delay: number; s: number }) {
  const el = useRef<HTMLDivElement>(null);
  const p = bankPt(g),
    w = g.bankW * 0.9;
  useWaapi((A) => {
    A(
      el.current,
      [
        { opacity: 0.9, transform: 'scale(.6)', offset: 0 },
        { opacity: 0, transform: 'scale(1.3)', offset: 1 },
      ],
      { delay, duration: 650 * s, easing: EASE.out },
    );
    A(
      document.querySelector('[data-bank] .bank-box'),
      [
        { transform: 'scale(1)', offset: 0 },
        { transform: 'scale(1.08)', offset: 0.3, easing: EASE.out },
        { transform: 'scale(1)', offset: 1 },
      ],
      { delay, duration: 520 * s },
    );
  });
  return (
    <div
      ref={el}
      className="fx-pulse"
      style={{ left: p.x - w / 2, top: p.y - w * 0.3, width: w, height: w * 0.6, ...hidden }}
    />
  );
}

interface FlowProps {
  from: Party;
  to: Party;
  amount: number;
  count: number;
  stagger: number;
  s: number;
  at: number;
  g: Geo;
}
function Flow({ from, to, amount, count, stagger, s, at: t0, g }: FlowProps) {
  const a = party(g, from),
    z = party(g, to);
  const flight = DUR_NOTE * s;
  const bankFlow = from === 'bank' || to === 'bank';
  const payerColour = from !== 'bank' ? g.colors[from.seat % g.colors.length] : '#1f3b1c';
  const dn = denomColours(amount, count);
  const fills = bankFlow ? dn.map(([v]): [number, string] => [v, '#cfe4c6']) : dn;
  const arrive = t0 + (count - 1) * stagger + flight * 0.92;
  return (
    <>
      {Array.from({ length: count }, (_, k) => {
        const jx = ((k % 3) - 1) * 7,
          jy = (k % 2) * 4;
        return (
          <Flight
            key={k}
            from={{ x: a.x + jx, y: a.y + jy }}
            to={{ x: z.x + jx, y: z.y + jy }}
            delay={t0 + k * stagger}
            duration={flight}
          >
            <Note
              v={fills[k][0]}
              fill={fills[k][1]}
              edge={bankFlow ? '#1f3b1c' : payerColour}
              thick={!bankFlow}
            />
          </Flight>
        );
      })}
      {from !== 'bank' && <Pop p={a} delay={t0 + 40 * s} s={s} sign="−" amount={amount} />}
      {to !== 'bank' && <Pop p={z} delay={arrive - 100 * s} s={s} sign="+" amount={amount} />}
      {to === 'bank' && <BankPulse g={g} delay={arrive - 60 * s} s={s} />}
      {from === 'bank' && <BankPulse g={g} delay={t0} s={s} />}
    </>
  );
}
const DUR_NOTE = 640;

function NotesFx({ b, g }: { b: Extract<Beat, { k: 'notes' }>; g: Geo }) {
  return (
    <Flow
      from={b.from}
      to={b.to}
      amount={b.amount}
      count={b.count}
      stagger={b.stagger}
      s={b.s}
      at={b.at}
      g={g}
    />
  );
}

/** Passing Los: "+M200" pops at the tile, then notes leave the bank for the seat. */
function SalaryFx({ b, g }: { b: Extract<Beat, { k: 'salary' }>; g: Geo }) {
  const r = tileRect(g, 0),
    pt = { x: r.x + r.w / 2, y: r.y + r.h * 0.4 };
  const el = useRef<HTMLDivElement>(null);
  useWaapi((A) => {
    A(
      el.current,
      [
        { transform: 'translate(0px,0px) scale(.4)', opacity: 0, offset: 0 },
        {
          transform: 'translate(0px,-14px) scale(1.25)',
          opacity: 1,
          offset: 0.3,
          easing: EASE.out,
        },
        { transform: 'translate(0px,-24px) scale(1)', opacity: 1, offset: 0.7 },
        { transform: 'translate(0px,-34px) scale(1)', opacity: 0, offset: 1 },
      ],
      { delay: b.at, duration: 200 * b.s + 520 * b.s },
    );
  });
  return (
    <>
      <div ref={el} style={{ ...at(pt), ...hidden }}>
        <span className="fx-amt big">
          +<Rich text={euro(b.amount)} />
        </span>
      </div>
      <Flow
        from="bank"
        to={{ seat: b.player }}
        amount={b.amount}
        count={b.count}
        stagger={b.stagger}
        s={b.s}
        at={b.at + 200 * b.s}
        g={g}
      />
    </>
  );
}

/* ---------- card from the pile ---------- */

const PILE = {
  community: { x: 407, y: 409, fill: '#abdffa', edge: '#8dbbd6', label: 'Gemeinschaftskarte' },
  chance: { x: 959, y: 959, fill: '#f7941d', edge: '#c9760f', label: 'Ereigniskarte' },
};

function CardFx({ b, g }: { b: Extract<Beat, { k: 'card' }>; g: Geo }) {
  const k = g.bw / SIZE,
    c = centre(g),
    pile = PILE[b.deck];
  const W = g.bw * 0.3,
    H = W * 0.62;
  const px = g.bx + pile.x * k - c.x,
    py = g.by + pile.y * k - c.y;
  const seat = g.seat[b.player];
  const root = useRef<HTMLDivElement>(null),
    flip = useRef<HTMLDivElement>(null);
  useWaapi((A) => {
    const T = b.dur;
    if (b.simple) {
      A(
        root.current,
        [
          { opacity: 0, offset: 0 },
          { opacity: 1, offset: 0.15 },
          { opacity: 1, offset: 0.8 },
          { opacity: 0, offset: 1 },
        ],
        { delay: b.at, duration: T },
      );
      return;
    }
    const aS = b.slide / T,
      aF = (b.slide + b.flip) / T,
      aH = (b.slide + b.flip + b.hold) / T;
    const rest = 'translate(0px,0px) rotate(0deg) scale(1)';
    const exit =
      b.toSeat && seat
        ? {
            transform: `translate(${seat.x - c.x}px,${seat.y - c.y}px) rotate(6deg) scale(.2)`,
            opacity: 0.15,
          }
        : {
            transform: `translate(${px * 0.9}px,${py * 0.9}px) rotate(-45deg) scale(.62)`,
            opacity: 0,
          };
    A(
      root.current,
      [
        {
          transform: `translate(${px}px,${py}px) rotate(-45deg) scale(.62)`,
          opacity: 0,
          offset: 0,
        },
        {
          transform: `translate(${px * 0.8}px,${py * 0.8}px) rotate(-38deg) scale(.66)`,
          opacity: 1,
          offset: aS * 0.12,
          easing: EASE.out,
        },
        { transform: rest, opacity: 1, offset: aS },
        { transform: rest, opacity: 1, offset: aH, easing: EASE.in },
        { ...exit, offset: 1 },
      ],
      { delay: b.at, duration: T },
    );
    A(
      flip.current,
      [
        { transform: 'rotateY(180deg)', offset: 0 },
        { transform: 'rotateY(180deg)', offset: aS * 0.85, easing: EASE.inOut },
        { transform: 'rotateY(0deg)', offset: aF },
        { transform: 'rotateY(0deg)', offset: 1 },
      ],
      { delay: b.at, duration: T },
    );
  });
  const lbl = b.label ?? '';
  const fs = W * (lbl.length > 36 ? 0.058 : 0.07);
  return (
    <div
      ref={root}
      className="fx-card"
      style={{
        ...hidden,
        left: c.x - W / 2,
        top: c.y - H / 2,
        width: W,
        height: H,
        perspective: W * 3,
      }}
    >
      <div ref={flip} className="fx-flip">
        <div className="cside front" style={{ borderColor: pile.edge }}>
          <small style={{ color: pile.edge, fontSize: Math.max(10, W * 0.045) }}>
            {pile.label.toUpperCase()}
          </small>
          <span style={{ fontSize: fs }}>{lbl || '?'}</span>
        </div>
        <div className="cside back" style={{ background: pile.fill, borderColor: pile.edge }}>
          <span style={{ fontSize: W * 0.3 }}>?</span>
        </div>
      </div>
    </div>
  );
}

/* ---------- stamps: jail bars, "FREI", "BANKROTT" ---------- */

function Stamp({
  p,
  w,
  h,
  delay,
  dur,
  tone,
  text,
  sub,
  size,
  dir,
  bars,
}: {
  p: Pt;
  w: number;
  h: number;
  delay: number;
  dur: number;
  tone: 'bad' | 'ok';
  text: string;
  sub?: string;
  size: number;
  dir?: 'down' | 'up';
  bars?: Pt;
}) {
  const el = useRef<HTMLDivElement>(null),
    bar = useRef<HTMLDivElement>(null);
  useWaapi((A) => {
    A(
      el.current,
      [
        { opacity: 0, transform: 'scale(2.4) rotate(-22deg)', offset: 0 },
        { opacity: 1, transform: 'scale(.92) rotate(-9deg)', offset: 0.28, easing: EASE.out },
        { opacity: 1, transform: 'scale(1) rotate(-9deg)', offset: 0.36 },
        { opacity: 1, transform: 'scale(1) rotate(-9deg)', offset: 0.85 },
        { opacity: 0, transform: 'scale(1) rotate(-9deg)', offset: 1 },
      ],
      { delay: delay + (dir ? dur * 0.12 : 0), duration: dur * (dir ? 0.88 : 1) },
    );
    if (dir) {
      const T = dur;
      A(
        bar.current,
        dir === 'down'
          ? [
              { opacity: 1, transform: 'scaleY(0)', offset: 0 },
              { opacity: 1, transform: 'scaleY(1)', offset: 0.22, easing: EASE.pop },
              { opacity: 1, transform: 'scaleY(1)', offset: 0.85 },
              { opacity: 0, transform: 'scaleY(1)', offset: 1 },
            ]
          : [
              { opacity: 1, transform: 'translateY(0)', offset: 0 },
              { opacity: 1, transform: 'translateY(0)', offset: 0.1 },
              { opacity: 1, transform: 'translateY(-105%)', offset: 0.4, easing: EASE.in },
              { opacity: 0, transform: 'translateY(-105%)', offset: 1 },
            ],
        { delay, duration: T },
      );
    }
  });
  return (
    <>
      {dir && bars && (
        <div
          ref={bar}
          className="fx-bars"
          style={{ left: bars.x - w / 2, top: bars.y - h / 2, width: w, height: h, opacity: 0 }}
        >
          {[0, 1, 2, 3, 4].map((k) => (
            <i key={k} />
          ))}
        </div>
      )}
      <div
        ref={el}
        className={`fx-stamp ${tone}`}
        style={{ left: p.x, top: p.y, fontSize: size, opacity: 0 }}
      >
        <b>{text}</b>
        {sub && <small>{sub}</small>}
      </div>
    </>
  );
}

function JailFx({ b, g }: { b: Extract<Beat, { k: 'stamp' }>; g: Geo }) {
  const r = tileRect(g, 10),
    k = r.w / CORNER;
  const cell = { x: r.x + 113 * k + g.bw * 0.035, y: r.y + 70 * k - g.bw * 0.03 }; // stamp leans into the board so it is not cut off
  const bars = { x: r.x + 113 * k, y: r.y + 70 * k };
  const size = Math.max(15, g.bw * 0.021);
  return b.kind === 'jail' ? (
    <Stamp
      p={cell}
      bars={bars}
      w={138 * k}
      h={140 * k}
      delay={b.at}
      dur={b.dur}
      tone="bad"
      text="GEFÄNGNIS"
      sub={b.sub}
      size={size}
      dir="down"
    />
  ) : (
    <Stamp
      p={cell}
      bars={bars}
      w={138 * k}
      h={140 * k}
      delay={b.at}
      dur={b.dur}
      tone="ok"
      text="FREI"
      sub={b.sub ? `durch ${b.sub}` : undefined}
      size={size}
      dir="up"
    />
  );
}

function BeatView({ b, g, plan }: { b: Beat; g: Geo; plan: Plan }) {
  switch (b.k) {
    case 'dice':
      return <DiceFx b={b} g={g} />;
    case 'notes':
      return <NotesFx b={b} g={g} />;
    case 'salary':
      return <SalaryFx b={b} g={g} />;
    case 'card':
      return <CardFx b={b} g={g} />;
    case 'stamp':
      return <JailFx b={b} g={g} />;
    case 'bankrupt': {
      const p = g.seat[b.player] ?? centre(g);
      return (
        <Stamp
          p={p}
          w={0}
          h={0}
          delay={b.at}
          dur={b.dur * (plan.s > 0 ? 1.6 : 1)}
          tone="bad"
          text="BANKROTT"
          size={Math.max(15, g.bw * 0.024)}
        />
      );
    }
    default:
      return null;
  }
}

export default function Fx({
  plan,
  board,
  colors,
}: {
  plan: Plan;
  board: HTMLElement | null;
  colors: string[];
}) {
  const [geo, setGeo] = useState<Geo | null>(null);
  useLayoutEffect(() => {
    setGeo(measure(board, plan.nonce, colors));
  }, [plan.nonce, board]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!geo || geo.nonce !== plan.nonce) return null;
  return (
    <div className="fx" aria-hidden="true">
      {plan.beats.map((b, i) => (
        <BeatView key={`${plan.nonce}-${i}`} b={b} g={geo} plan={plan} />
      ))}
    </div>
  );
}
