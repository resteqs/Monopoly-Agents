"""Single-core benchmark of uniform random self-play: python -m monopoly.bench [--games N]"""

from __future__ import annotations

import argparse
import time

from .engine import Engine
from .random_play import play_game
from .rules import RulesConfig


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("--games", type=int, default=300)
    ap.add_argument("--seed", type=int, default=1000)
    ap.add_argument("--policy", default="uniform")
    a = ap.parse_args(argv)
    eng = Engine(RulesConfig())
    steps = 0
    t0 = time.perf_counter()
    for i in range(a.games):
        steps += len(play_game(eng, a.seed + i, a.policy))
    dt = time.perf_counter() - t0
    print(
        f"{a.games} games in {dt:.2f}s: {a.games / dt * 60:.0f} games/min, "
        f"{steps / dt:.0f} steps/s, {steps / a.games:.0f} steps/game"
    )


if __name__ == "__main__":
    main()
