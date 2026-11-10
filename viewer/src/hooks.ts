import { useEffect, useState } from 'react';
import type { Step } from './replay';
import type { Plan, Pos } from './motion';

/** Pawn colours avoid every board and property colour: purple, turquoise, silver-grey, lime. */
export const PLAYER_COLORS = ['#7b2fd0', '#00b5a5', '#8c929c', '#9ad62a'];

export const positionsOf = (s: Step) => s.state.players.map((p) => p.position);

/** Displayed token spaces. Follows the plan's hop timeline (causal order: after the dice, after a card ...);
 *  without a plan (seek, instant mode) tokens snap to the step's positions. */
export function useTokenAnim(steps: Step[], pos: Pos, plan: Plan | null): number[] {
  const [disp, setDisp] = useState<number[]>(() => positionsOf(steps[pos.idx]));
  useEffect(() => {
    const target = positionsOf(steps[pos.idx]);
    if (!plan || plan.mode !== 'full' || !plan.hops.length) {
      setDisp(target);
      return;
    }
    const base = positionsOf(steps[pos.from]);
    const movers = new Set(plan.hops.map((h) => h.player));
    setDisp(base.map((b, i) => (movers.has(i) ? b : target[i])));
    const timers = plan.hops.map((h) =>
      window.setTimeout(
        () => setDisp((d) => d.map((v, i) => (i === h.player ? h.space : v))),
        h.at,
      ),
    );
    timers.push(window.setTimeout(() => setDisp(target), plan.total));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [pos.nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  return disp;
}
