"""Random self-play. Writes the compact training-log format (docs/game_state.md section 6.2).

Policies:
  uniform        - uniformly random legal action
  sensible-random - UI test-data generator (NOT an agent): random but weighted so games look like games.

The log stores ALL action indices (forced steps included), so `seed + actions` reproduces the game by
simply feeding every action to `Engine.step`.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

from .data import DEFAULT_BOARD
from .engine import Engine
from .rules import ENGINE_VERSION, RulesConfig
from .state import O_CASH, O_CUR

_HC = DEFAULT_BOARD.house_cost_l
_STREETS = DEFAULT_BOARD.streets_l


def sensible_choice(rnd: random.Random, s, acts: list) -> int:
    """Weighted random: BUY 0.8, BUILD 0.3 if cash after > 200, SELL only if cash < 100."""
    if len(acts) == 1:
        return acts[0]
    cash = s.m[O_CASH + s.m[O_CUR]]
    if 2 in acts:
        return 2 if rnd.random() < 0.8 else 3
    if 5 in acts:
        return 5
    if 4 in acts and rnd.random() < 0.5:
        return 4
    builds = [a for a in acts if 6 <= a < 28 and cash - _HC[_STREETS[a - 6]] > 200]
    if builds and rnd.random() < 0.3:
        return rnd.choice(builds)
    sells = [a for a in acts if a >= 28]
    if sells and cash < 100 and rnd.random() < 0.5:
        return rnd.choice(sells)
    return 0 if 0 in acts else 1


def play_game(
    engine: Engine, seed: int, policy: str = "uniform", return_state: bool = False
):
    """Play one game; returns the list of ALL action indices (and the final state if asked)."""
    rnd = random.Random(seed)
    s = engine.reset(seed)
    legal = engine.legal_list
    apply_ = engine._apply
    actions: list[int] = []
    sensible = policy == "sensible-random"
    if policy not in ("uniform", "sensible-random"):
        raise ValueError(f"unknown policy {policy}")
    while True:
        acts = legal(s)
        if not acts:
            break
        a = (
            sensible_choice(rnd, s, acts)
            if sensible
            else (acts[0] if len(acts) == 1 else rnd.choice(acts))
        )
        apply_(s, a)
        actions.append(a)
    return (actions, s) if return_state else actions


def game_record(rules: RulesConfig, seed: int, actions: list) -> dict:
    return {
        "engine_version": ENGINE_VERSION,
        "rules": rules.to_dict(),
        "seed": seed,
        "actions": actions,
    }


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--games", type=int, default=10)
    ap.add_argument("--seed", type=int, default=0, help="game i uses seed + i")
    ap.add_argument("--out", type=Path, required=True)
    ap.add_argument(
        "--policy", default="uniform", choices=["uniform", "sensible-random"]
    )
    ap.add_argument("--max-rounds", type=int, default=200)
    a = ap.parse_args(argv)
    rules = RulesConfig(max_rounds=a.max_rounds)
    eng = Engine(rules)
    a.out.parent.mkdir(parents=True, exist_ok=True)
    with a.out.open("w") as f:
        for i in range(a.games):
            seed = a.seed + i
            acts = play_game(eng, seed, a.policy)
            f.write(
                json.dumps(game_record(rules, seed, acts), separators=(",", ":")) + "\n"
            )
    print(f"wrote {a.games} games to {a.out}", file=sys.stderr)


if __name__ == "__main__":
    main()
