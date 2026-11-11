/* Motion system. One module owns durations, easings and the choreography queue.
   planStep() turns the events of the step(s) being played into a timeline of beats in causal order
   (dice -> move -> landing effect -> cash), every duration already scaled by playback speed.
   Rendering (Fx.tsx, Board, Seat) only reads the plan; nothing in here touches the DOM. */
import { useSyncExternalStore } from 'react';
import { spaces } from './boardData';
import type { GameEvent, Step } from './replay';

export interface Pos {
  idx: number;
  from: number;
  animate: boolean;
  nonce: number;
}

/** Time per tile hop at 1x. At >= INSTANT_SPEED (or with reduced motion) state changes are instant. */
export const HOP_MS = 240;
export const INSTANT_SPEED = 8;

export const EASE = {
  out: 'cubic-bezier(.2,.7,.2,1)',
  inOut: 'cubic-bezier(.65,0,.35,1)',
  in: 'cubic-bezier(.5,0,.9,.4)',
  pop: 'cubic-bezier(.34,1.56,.64,1)',
  fall: 'cubic-bezier(.3,0,.6,1)',
};

/** Base durations at 1x (ms). */
export const DUR = {
  throw: 780,
  hold: 320,
  swap: 220,
  numHold: 380,
  numFade: 300,
  note: 640,
  noteStagger: 90,
  salary: 900,
  deed: 900,
  slide: 450,
  flip: 380,
  cardHold: 1500,
  cardExit: 480,
  stamp: 1000,
  bankrupt: 1000,
  overLead: 500,
  beat: 260,
  idle: 460,
};

export type MotionMode = 'full' | 'instant';

/** Collapses to instant state at >= 8x or when the OS asks for reduced motion. */
export const motionMode = (speed: number, reduced: boolean): MotionMode =>
  reduced || speed >= INSTANT_SPEED ? 'instant' : 'full';

const mq =
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-reduced-motion: reduce)')
    : null;
export function useReducedMotion(): boolean {
  return useSyncExternalStore(
    (cb) => {
      mq?.addEventListener('change', cb);
      return () => mq?.removeEventListener('change', cb);
    },
    () => !!mq?.matches,
    () => false,
  );
}

export type Party = { seat: number } | 'bank';

export type Beat =
  | {
      k: 'dice';
      at: number;
      dur: number;
      player: number;
      d1: number;
      d2: number;
      pasch: number;
      /** doubles streak this roll just broke (0 = none) */
      miss: number;
      util: boolean;
      brief: boolean;
      throwMs: number;
      holdMs: number;
      swapMs: number;
      numHold: number;
      fadeMs: number;
    }
  | {
      k: 'salary';
      at: number;
      dur: number;
      player: number;
      amount: number;
      count: number;
      stagger: number;
      s: number;
    }
  | {
      k: 'notes';
      at: number;
      dur: number;
      from: Party;
      to: Party;
      amount: number;
      count: number;
      stagger: number;
      s: number;
    }
  | {
      k: 'card';
      at: number;
      dur: number;
      player: number;
      deck: 'chance' | 'community';
      label: string | null;
      toSeat: boolean;
      simple: boolean;
      slide: number;
      flip: number;
      hold: number;
      exit: number;
    }
  | { k: 'stamp'; at: number; dur: number; player: number; kind: 'jail' | 'free'; sub: string }
  | { k: 'bankrupt'; at: number; dur: number; player: number }
  | { k: 'over'; at: number; dur: number };

export interface Hop {
  player: number;
  space: number;
  at: number;
}

export interface Plan {
  nonce: number;
  mode: MotionMode;
  speed: number;
  s: number;
  beats: Beat[];
  hops: Hop[];
  /** ms until the step's choreography is done, including a short beat before the next step */
  total: number;
  /** ms until the last effect has finished (can exceed total, e.g. a card still leaving) */
  end: number;
  /** per player: ms after which the cash counter starts ticking */
  cash: Record<number, number>;
  own: Record<number, number>;
  build: Record<number, { prev: number; delay: number }>;
  deed: Record<number, { at: number; dur: number }>;
  ghost: Record<number, { at: number; spaces: number[] }>;
  hlDelay: number;
  /** when the dice result is known (transport dice and Pasch pips reveal then) */
  diceReveal: number;
  /** ms until the end moment (summary overlay) may appear */
  overAt: number | null;
}

const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const ring = (a: number, b: number) => {
  const d = Math.abs(a - b) % 40;
  return Math.min(d, 40 - d);
};

export function pathBetween(from: number, to: number): number[] {
  const fwd = (to - from + 40) % 40;
  if (fwd > 0 && fwd <= 12) return Array.from({ length: fwd }, (_, k) => (from + 1 + k) % 40);
  const back = (from - to + 40) % 40;
  if (back > 0 && back <= 4)
    return Array.from({ length: back }, (_, k) => (from - 1 - k + 40) % 40);
  return [to];
}

export const noteCount = (amount: number) =>
  amount <= 30
    ? 1
    : amount <= 75
      ? 2
      : amount <= 200
        ? 3
        : amount <= 500
          ? 4
          : amount <= 1000
            ? 5
            : 6;

/** Card holds longer at slow speeds (reading time), shorter when fast. */
export const cardHold = (speed: number) => DUR.cardHold * Math.pow(1 / speed, 0.5);

const isJailFree = (label: string | null) => !!label && /Gefängnis frei/i.test(label);

/** Consecutive doubles shown on the Pasch counter for the dice in this step. */
function paschCount(st: Step, e: GameEvent): number {
  if (!e.doubles) return 0;
  if (st.events.some((x) => x.type === 'jail' && x.reason === 'three_doubles')) return 3;
  return Math.min(3, Math.max(1, st.state.doubles));
}

export function planStep(
  steps: Step[],
  from: number,
  to: number,
  speed: number,
  mode: MotionMode,
  nonce: number,
  card: (e: GameEvent) => { deckKey: 'chance' | 'community'; label: string | null },
): Plan {
  const S = 1 / speed;
  const plan: Plan = {
    nonce,
    mode,
    speed,
    s: S,
    beats: [],
    hops: [],
    total: 0,
    end: 0,
    cash: {},
    own: {},
    build: {},
    deed: {},
    ghost: {},
    hlDelay: 0,
    diceReveal: 0,
    overAt: null,
  };
  const hopMs = HOP_MS * S;
  let cur = 0,
    end = 0,
    movedOnce = false;
  let sumAt: number | null = null;
  const push = (b: Beat) => {
    plan.beats.push(b);
    end = Math.max(end, b.at + b.dur);
  };
  /** Banknote flight between two parties; ticks both cash counters at departure (payer) and arrival (receiver). Returns its duration. */
  const notes = (from: Party, to: Party, amount: number, at: number): number => {
    const n = noteCount(amount);
    const dur = DUR.note * S + (n - 1) * DUR.noteStagger * S;
    push({ k: 'notes', at, dur, from, to, amount, count: n, stagger: DUR.noteStagger * S, s: S });
    if (from !== 'bank') tick(from.seat, at + 80 * S);
    if (to !== 'bank') tick(to.seat, at + dur * 0.85);
    return dur;
  };
  const tick = (p: unknown, t: number) => {
    if (typeof p !== 'number') return;
    if (plan.cash[p] === undefined || t < plan.cash[p]) plan.cash[p] = t;
  };

  for (let s = from + 1; s <= to; s++) {
    const st = steps[s],
      prev = steps[s - 1].state;
    const evs = st.events;
    const used = new Set<number>();
    const los: Record<number, number | null> = {};

    evs.forEach((e, i) => {
      if (used.has(i)) return;
      const p = typeof e.player === 'number' ? e.player : (st.player ?? 0);

      if (mode === 'instant') {
        if (e.type === 'dice' && e.reason !== 'utility_card_none') {
          const d1 = num(e.d1),
            d2 = num(e.d2);
          push({
            k: 'dice',
            at: 0,
            dur: 520,
            player: p,
            d1,
            d2,
            pasch: 0,
            miss: 0,
            util: e.reason === 'utility_card',
            brief: true,
            throwMs: 0,
            holdMs: 0,
            swapMs: 0,
            numHold: 280,
            fadeMs: 240,
          });
        } else if (e.type === 'card') {
          const c = card(e);
          push({
            k: 'card',
            at: 0,
            dur: 700,
            player: p,
            deck: c.deckKey,
            label: c.label,
            toSeat: false,
            simple: true,
            slide: 0,
            flip: 0,
            hold: 460,
            exit: 240,
          });
        } else if (e.type === 'game_over') plan.overAt = 0;
        return;
      }

      switch (e.type) {
        case 'dice': {
          const d1 = num(e.d1),
            d2 = num(e.d2);
          const t = DUR.throw * S,
            h = DUR.hold * S,
            sw = DUR.swap * S,
            nh = DUR.numHold * S,
            f = DUR.numFade * S;
          const pasch = paschCount(st, e);
          const miss =
            !e.doubles && e.reason !== 'utility_card' && prev.current_player === p
              ? prev.doubles
              : 0;
          push({
            k: 'dice',
            at: cur,
            dur: t + h + sw + nh + f,
            player: p,
            d1,
            d2,
            pasch,
            miss: Math.min(2, miss),
            util: e.reason === 'utility_card',
            brief: false,
            throwMs: t,
            holdMs: h,
            swapMs: sw,
            numHold: nh,
            fadeMs: f,
          });
          plan.diceReveal = cur + t + h * 0.5;
          if (sumAt == null) sumAt = cur + t + h + sw; // the sum numeral appears: destination is known
          cur += t + h + sw + nh; // the next beat starts as the numeral begins to fade
          break;
        }
        case 'move': {
          const nx = evs[i + 1];
          const f = num(e.from),
            t = num(e.to);
          const toJail = !!nx && nx.type === 'jail' && nx.player === e.player;
          const path = toJail ? [t] : pathBetween(f, t);
          const slide = path.length === 1 && ring(f, t) > 1;
          path.forEach((sp, k) =>
            plan.hops.push({ player: p, space: sp, at: cur + (slide ? 0 : k * hopMs) }),
          );
          const dur = slide ? hopMs * 2 : path.length * hopMs;
          const z = path.indexOf(0);
          los[p] =
            e.passed_go || t === 0
              ? z >= 0 && !slide
                ? cur + (z + 1) * hopMs
                : cur + dur * 0.5
              : null;
          // outline the destination as soon as it is known (dice sum shown, or move start),
          // so the outline tells the viewer where the pawn is heading
          if (!movedOnce) {
            plan.hlDelay = sumAt ?? cur;
            movedOnce = true;
          }
          cur += dur;
          break;
        }
        case 'salary': {
          const at = los[p] ?? cur;
          const amt = num(e.amount),
            n = noteCount(amt);
          const dur = 200 * S + DUR.note * S + (n - 1) * DUR.noteStagger * S;
          push({
            k: 'salary',
            at,
            dur,
            player: p,
            amount: amt,
            count: n,
            stagger: DUR.noteStagger * S,
            s: S,
          });
          tick(p, at + dur * 0.85);
          break;
        }
        case 'buy': {
          const dur = DUR.deed * S;
          const space = num(e.space);
          const nd = notes(
            { seat: p },
            'bank',
            num(e.price ?? e.amount ?? spaces[space]?.price),
            cur,
          );
          // the deed flies the other way, slightly staggered so both stay readable
          plan.deed[space] = { at: cur + 260 * S, dur: dur * 0.85 };
          plan.own[space] = cur + 260 * S;
          cur += Math.max(nd * 0.6, 260 * S + dur * 0.7);
          break;
        }
        case 'rent': {
          const to2: Party = typeof e.to === 'number' ? { seat: e.to } : 'bank';
          cur += notes({ seat: p }, to2, num(e.amount), cur) * 0.85;
          break;
        }
        case 'tax': {
          cur += notes({ seat: p }, 'bank', num(e.amount), cur) * 0.85;
          break;
        }
        case 'cash': {
          const reason = String(e.reason ?? '');
          if (['rent', 'tax', 'buy', 'salary', 'build', 'sell_building'].includes(reason)) break;
          const d = num(e.delta);
          if (!d) break;
          let to2: Party = 'bank',
            from2: Party = { seat: p };
          if (d > 0) {
            from2 = 'bank';
            to2 = { seat: p };
          }
          if (d < 0) {
            // paired transfer between two players (e.g. "pay each player")
            const j = evs.findIndex(
              (x, jj) =>
                jj > i &&
                !used.has(jj) &&
                x.type === 'cash' &&
                x.reason === reason &&
                num(x.delta) === -d &&
                x.player !== e.player,
            );
            if (j >= 0) {
              to2 = { seat: num(evs[j].player) };
              used.add(j);
            }
          }
          cur += notes(from2, to2, Math.abs(d), cur) * 0.85;
          break;
        }
        case 'card': {
          const c = card(e);
          const hold = cardHold(speed),
            slide = DUR.slide * S,
            flip = DUR.flip * S,
            exit = DUR.cardExit * S;
          push({
            k: 'card',
            at: cur,
            dur: slide + flip + hold + exit,
            player: p,
            deck: c.deckKey,
            label: c.label,
            toSeat: isJailFree(c.label),
            simple: false,
            slide,
            flip,
            hold,
            exit,
          });
          cur += slide + flip + hold * 0.55;
          break;
        }
        case 'jail':
        case 'jail_release': {
          const jail = e.type === 'jail';
          const how: Record<string, string> = {
            doubles: 'Pasch',
            fine: 'Kaution',
            forced_fine: 'Kaution',
            card: 'Karte',
          };
          const why: Record<string, string> = {
            three_doubles: '3. Pasch',
            go_to_jail: 'Gehe ins Gefängnis',
            card: 'Karte',
          };
          const sub = jail ? (why[String(e.reason)] ?? '') : (how[String(e.how)] ?? '');
          const dur = DUR.stamp * S;
          push({ k: 'stamp', at: cur, dur, player: p, kind: jail ? 'jail' : 'free', sub });
          cur += dur * 0.6;
          break;
        }
        case 'build':
        case 'sell_building': {
          const space = num(e.space);
          const dur = 700 * S;
          plan.build[space] = { prev: prev.buildings[space] ?? 0, delay: cur };
          const sale = e.type === 'sell_building';
          const amt = num(sale ? e.refund : e.cost);
          if (amt > 0)
            notes(
              sale ? 'bank' : { seat: p },
              sale ? { seat: p } : 'bank',
              amt,
              sale ? cur + 200 * S : cur,
            );
          cur += dur * (num(e.level) >= 5 ? 1 : 0.7);
          break;
        }
        case 'bankrupt': {
          const dur = DUR.bankrupt * S;
          // remaining cash empties out (to the creditor, else the bank) before the deeds return
          const rest = Math.max(0, st.state.players[p]?.cash ?? 0);
          const cred =
            typeof e.creditor === 'number' ? e.creditor : typeof e.to === 'number' ? e.to : null;
          if (rest > 0)
            cur +=
              notes({ seat: p }, cred != null && cred !== p ? { seat: cred } : 'bank', rest, cur) *
              0.7;
          push({ k: 'bankrupt', at: cur, dur, player: p });
          plan.ghost[p] = {
            at: cur + 250 * S,
            spaces: prev.owner.map((o, k) => (o === p ? k : -1)).filter((k) => k >= 0),
          };
          end = Math.max(end, plan.ghost[p].at + 900);
          cur += dur * 0.7;
          break;
        }
        case 'game_over': {
          const at = cur + DUR.overLead * S;
          push({ k: 'over', at, dur: 600 * S });
          plan.overAt = at + 300 * S;
          cur = at;
          break;
        }
        default:
      }
    });
  }

  plan.total =
    mode === 'instant'
      ? Math.max(DUR.idle + 60, 520) * S
      : Math.max(Math.max(cur, end) + DUR.beat * S, DUR.idle * S);
  plan.end = Math.max(plan.total, end);
  return plan;
}
