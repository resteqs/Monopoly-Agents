import { spaces } from './boardData';
import cardsJson from '../../engine/monopoly/data/cards_de.json';
import type { GameEvent, ReplayHeader, Step } from './replay';
import { euro, signedEuro } from './format';

interface Card {
  id: string;
  label: string;
}
const decks = cardsJson as unknown as { chance: Card[]; community: Card[] };

export const sp = (i: unknown) =>
  typeof i === 'number' && spaces[i] ? spaces[i].name : `Feld ${String(i)}`;
/** Display name: always "Spieler N"; the replay's own name is the subtitle (psub). */
export const pname = (_h: ReplayHeader, p: unknown) =>
  typeof p === 'number' ? `Spieler ${p + 1}` : '?';
export const psub = (h: ReplayHeader, p: number) => h.players[p]?.name ?? '';

const money = (v: unknown) => (typeof v === 'number' ? euro(v) : '?');

export function cardInfo(e: GameEvent): { deckKey: 'chance' | 'community'; label: string | null } {
  const c = cardLabel(e);
  return { deckKey: c.deck === 'Gemeinschaftskarte' ? 'community' : 'chance', label: c.label };
}

function cardLabel(e: GameEvent): { deck: string; label: string | null } {
  const raw = e.card ?? e.id ?? e.card_id;
  const deckName =
    typeof e.deck === 'string'
      ? e.deck
      : typeof raw === 'string' && raw.startsWith('G')
        ? 'community'
        : 'chance';
  const list = deckName === 'community' ? decks.community : decks.chance;
  let c: Card | undefined;
  if (typeof raw === 'string') c = [...decks.chance, ...decks.community].find((x) => x.id === raw);
  else if (typeof raw === 'number') c = list[raw];
  const label = (typeof e.label === 'string' ? e.label : null) ?? c?.label ?? null;
  return { deck: deckName === 'community' ? 'Gemeinschaftskarte' : 'Ereigniskarte', label };
}

/** Event types whose cash side effect is already described by their own line. */
const COVERED_CASH = new Set([
  'rent',
  'tax',
  'buy',
  'salary',
  'build',
  'sell_building',
  'jail_fine',
  'fine',
  'jail_release',
]);

const ACTIONS: Record<string, string> = {
  ROLL: 'Würfeln',
  END_TURN: 'Zug beenden',
  BUY: 'Kaufen',
  DECLINE_BUY: 'Nicht kaufen',
  PAY_JAIL_FINE: 'Kaution zahlen',
  USE_JAIL_CARD: 'Befreiungskarte',
  BUILD: 'Bauen',
  SELL_BUILDING: 'Haus verkaufen',
};
export function actionLabel(step: Step): string {
  if (!step.action) return 'Start';
  const base = ACTIONS[step.action.type] ?? step.action.type;
  return typeof step.action.space === 'number' ? `${base} (${sp(step.action.space)})` : base;
}

export interface Line {
  text: string;
  player?: number;
  kind?: 'turn' | 'over' | 'raw' | 'cash';
}

/** Human-readable (German) lines for one step. Never throws. */
export function describeStep(step: Step, h: ReplayHeader): Line[] {
  const out: Line[] = [];
  const evs = step.events;
  const types = new Set(evs.map((e) => e.type));
  for (let i = 0; i < evs.length; i++) {
    const e = evs[i];
    const P = pname(h, e.player);
    try {
      switch (e.type) {
        case 'turn_start':
          out.push({
            text: `Zug ${typeof e.turn === 'number' ? e.turn + 1 : ''} – ${P}`,
            player: e.player,
            kind: 'turn',
          });
          break;
        case 'dice': {
          if (e.reason === 'utility_card') {
            out.push({
              text: `${P} würfelt erneut für das Werk: ${String(e.d1)}+${String(e.d2)}`,
              player: e.player,
            });
            break;
          }
          const base = `${P} würfelt ${String(e.d1)}+${String(e.d2)}${e.doubles ? ' (Pasch)' : ''}`;
          const nx = evs[i + 1];
          if (nx && nx.type === 'move' && nx.player === e.player) {
            out.push({
              text: `${base} → ${sp(nx.to)}${nx.passed_go ? ', über Los' : ''}`,
              player: e.player,
            });
            i++;
          } else out.push({ text: base, player: e.player });
          break;
        }
        case 'move':
          out.push({
            text: `${P} zieht von ${sp(e.from)} nach ${sp(e.to)}${e.passed_go ? ' (über Los)' : ''}`,
            player: e.player,
          });
          break;
        case 'salary':
          out.push({ text: `${P} erhält ${money(e.amount)} Gehalt`, player: e.player });
          break;
        case 'buy':
          out.push({
            text: `${P} kauft ${sp(e.space)} für ${money(e.price ?? e.amount ?? (typeof e.space === 'number' ? spaces[e.space]?.price : undefined))}`,
            player: e.player,
          });
          break;
        case 'decline':
          out.push({ text: `${P} kauft ${sp(e.space)} nicht`, player: e.player });
          break;
        case 'rent':
          out.push({
            text: `${P} zahlt ${money(e.amount)} Miete an ${pname(h, e.to)} (${sp(e.space)})`,
            player: e.player,
          });
          break;
        case 'tax':
          out.push({
            text: `${P} zahlt ${money(e.amount)} Steuern (${sp(e.space)})`,
            player: e.player,
          });
          break;
        case 'card': {
          const c = cardLabel(e);
          out.push({
            text: `${P} zieht eine ${c.deck}${c.label ? `: „${c.label}“` : ''}`,
            player: e.player,
          });
          break;
        }
        case 'jail': {
          const why =
            e.reason === 'three_doubles'
              ? 'dritter Pasch'
              : e.reason === 'go_to_jail'
                ? 'Feld „Gehe ins Gefängnis“'
                : e.reason === 'card'
                  ? 'Karte'
                  : String(e.reason ?? '');
          out.push({ text: `${P} kommt ins Gefängnis (${why})`, player: e.player });
          break;
        }
        case 'jail_release': {
          const how: Record<string, string> = {
            doubles: 'durch einen Pasch',
            fine: 'gegen Kaution',
            card: 'mit Befreiungskarte',
            forced_fine: 'durch Zwangs-Kaution',
          };
          out.push({
            text: `${P} kommt frei ${how[String(e.how)] ?? String(e.how ?? '')}`,
            player: e.player,
          });
          break;
        }
        case 'build':
          out.push({
            text: `${P} baut ${e.level === 5 || e.hotel ? 'ein Hotel' : 'ein Haus'} auf ${sp(e.space)}${typeof e.cost === 'number' ? ` (${money(e.cost)})` : ''}`,
            player: e.player,
          });
          break;
        case 'sell_building':
          out.push({
            text: `${P} verkauft ${e.level === 4 ? 'ein Hotel' : 'ein Haus'} auf ${sp(e.space)}${typeof e.refund === 'number' ? ` (+${money(e.refund)})` : ''}`,
            player: e.player,
          });
          break;
        case 'cash': {
          const reason = String(e.reason ?? '');
          if (COVERED_CASH.has(reason) || types.has(reason)) break;
          if (typeof e.delta !== 'number') {
            out.push({ text: JSON.stringify(e), kind: 'raw' });
            break;
          }
          out.push({
            text: `${P}: ${signedEuro(e.delta)}${reason ? ` (${reason})` : ''}`,
            player: e.player,
            kind: 'cash',
          });
          break;
        }
        case 'bankrupt': {
          const cr =
            typeof e.creditor === 'number' ? e.creditor : typeof e.to === 'number' ? e.to : null;
          out.push({
            text: `${P} geht bankrott${cr != null ? ` (Gläubiger: ${pname(h, cr)})` : ''}${typeof e.owed === 'number' ? `, schuldet ${money(e.owed)}` : ''}`,
            player: e.player,
          });
          break;
        }
        case 'game_over':
          out.push({ text: gameOverText(e, h), kind: 'over' });
          break;
        default:
          out.push({ text: JSON.stringify(e), kind: 'raw' });
      }
    } catch {
      out.push({ text: JSON.stringify(e), kind: 'raw' });
    }
  }
  if (!out.length) {
    const P = pname(h, step.player);
    if (!step.action) out.push({ text: 'Spielbeginn' });
    else if (step.action.type === 'DECLINE_BUY')
      out.push({ text: `${P} kauft nicht`, player: step.player ?? undefined });
    else if (step.action.type === 'END_TURN')
      out.push({ text: `${P} beendet den Zug`, player: step.player ?? undefined });
    else out.push({ text: `${P}: ${actionLabel(step)}`, player: step.player ?? undefined });
  }
  return out;
}

export function winnerName(h: ReplayHeader, w: unknown): string {
  return w === -2 || w == null || w === -1 ? 'Unentschieden' : pname(h, w);
}
export function reasonLabel(r: unknown): string {
  return r === 'bankruptcy' ? 'Bankrott' : r === 'turn_limit' ? 'Zuglimit' : String(r ?? '');
}
export function gameOverText(e: GameEvent, h: ReplayHeader): string {
  const draw = e.winner === -2;
  return draw
    ? `Spiel vorbei – Unentschieden (${reasonLabel(e.reason)})`
    : `Spiel vorbei – Sieger: ${winnerName(h, e.winner)} (${reasonLabel(e.reason)})`;
}
