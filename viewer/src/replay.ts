import { groups, spaces } from './boardData';

export const SCHEMA = 'monopoly-replay/1';

export interface PlayerInfo {
  name: string;
  kind?: string;
}
export interface ReplayHeader {
  type: 'header';
  schema: string;
  engine_version?: string;
  board?: string;
  seed?: number | string;
  rules?: Record<string, unknown>;
  players: PlayerInfo[];
  [k: string]: unknown;
}
export interface PState {
  cash: number;
  position: number;
  jail_turns: number;
  jail_cards: number;
  bankrupt: boolean;
}
export interface StepState {
  turn: number;
  phase: string;
  current_player: number;
  dice: [number, number];
  doubles: number;
  players: PState[];
  owner: number[];
  buildings: number[];
  mortgaged: number[];
  houses_left?: number;
  hotels_left?: number;
  pot?: number;
  winner?: number;
  [k: string]: unknown;
}
export interface GameEvent {
  type: string;
  player?: number;
  [k: string]: unknown;
}
export interface Step {
  t: number;
  player: number | null;
  action: { type: string; [k: string]: unknown } | null;
  forced: boolean;
  events: GameEvent[];
  state: StepState;
  agent?: unknown;
  [k: string]: unknown;
}
export interface Replay {
  header: ReplayHeader;
  steps: Step[];
}

export class ReplayError extends Error {}

const isObj = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);

function arr40(v: unknown, fill: number): number[] {
  const a = Array.isArray(v) ? v.map((x) => num(x, fill)) : [];
  while (a.length < 40) a.push(fill);
  return a.slice(0, 40);
}

export function parseReplay(text: string): Replay {
  const lines = text.split(/\r?\n/);
  let header: ReplayHeader | null = null;
  const steps: Step[] = [];
  for (let ln = 0; ln < lines.length; ln++) {
    const line = lines[ln].trim();
    if (!line) continue;
    let o: unknown;
    try {
      o = JSON.parse(line);
    } catch {
      throw new ReplayError(`Zeile ${ln + 1} ist kein gültiges JSON.`);
    }
    if (!isObj(o)) throw new ReplayError(`Zeile ${ln + 1} ist kein JSON-Objekt.`);
    if (!header) {
      if (o.type !== 'header')
        throw new ReplayError('Die erste Zeile muss der Header sein (type: "header").');
      if (o.schema !== SCHEMA) {
        throw new ReplayError(
          `Unbekanntes Replay-Schema „${String(o.schema)}“ – erwartet wird „${SCHEMA}“.`,
        );
      }
      const players = Array.isArray(o.players)
        ? o.players.map((p, i) =>
            isObj(p)
              ? { ...p, name: String(p.name ?? `Spieler ${i + 1}`) }
              : { name: `Spieler ${i + 1}` },
          )
        : [];
      header = { ...o, type: 'header', schema: SCHEMA, players } as ReplayHeader;
      continue;
    }
    if (o.type !== 'step') continue;
    const st = o.state;
    if (!isObj(st) || !Array.isArray(st.players))
      throw new ReplayError(
        `Zeile ${ln + 1}: Schritt ohne gültigen Zustand (state.players fehlt).`,
      );
    const state: StepState = {
      ...st,
      turn: num(st.turn),
      phase: String(st.phase ?? ''),
      current_player: num(st.current_player),
      dice: Array.isArray(st.dice) ? [num(st.dice[0]), num(st.dice[1])] : [0, 0],
      doubles: num(st.doubles),
      players: st.players.map((p) => {
        const q = isObj(p) ? p : {};
        return {
          cash: num(q.cash),
          position: num(q.position),
          jail_turns: num(q.jail_turns),
          jail_cards: num(q.jail_cards),
          bankrupt: !!q.bankrupt,
        };
      }),
      owner: arr40(st.owner, -1),
      buildings: arr40(st.buildings, 0),
      mortgaged: arr40(st.mortgaged, 0),
    };
    steps.push({
      ...o,
      type: 'step' as never,
      t: num(o.t, steps.length),
      player: typeof o.player === 'number' ? o.player : null,
      action: isObj(o.action) ? (o.action as Step['action']) : null,
      forced: !!o.forced,
      events: Array.isArray(o.events) ? (o.events.filter(isObj) as GameEvent[]) : [],
      state,
    } as Step);
  }
  if (!header) throw new ReplayError('Die Datei ist leer – kein Header gefunden.');
  if (!steps.length) throw new ReplayError('Das Replay enthält keine Schritte.');
  return { header, steps };
}

export function netWorth(state: StepState, p: number): number {
  const me = state.players[p];
  if (!me) return 0;
  let v = me.cash;
  for (let i = 0; i < 40; i++) {
    if (state.owner[i] !== p) continue;
    const sp = spaces[i];
    v += sp.price ?? 0;
    const g = sp.group ? groups[sp.group] : undefined;
    if (g) v += (state.buildings[i] ?? 0) * g.house_cost;
  }
  return v;
}

/** Step indices that open a new turn (contain a turn_start event, else turn counter changed). */
export function turnStarts(steps: Step[]): number[] {
  const hasEv = steps.some((s) => s.events.some((e) => e.type === 'turn_start'));
  const out: number[] = [];
  steps.forEach((s, i) => {
    if (
      hasEv
        ? s.events.some((e) => e.type === 'turn_start')
        : i > 0 && s.state.turn !== steps[i - 1].state.turn
    )
      out.push(i);
  });
  return out;
}

/** The board space most relevant to a step (for highlighting). */
export function highlightSpace(step: Step): number | null {
  let r: number | null = null;
  for (const e of step.events) {
    if (typeof e.space === 'number') r = e.space;
    else if (e.type === 'move' && typeof e.to === 'number') r = e.to;
  }
  return r;
}
