"""Re-simulate a game and write the viewer format (*.replay.jsonl, docs/game_state.md section 6.1).

python -m monopoly.export_replay replays/random.games.jsonl --index 0 --out replays/demo.replay.jsonl
python -m monopoly.export_replay --random --seed 7 [--policy sensible-random] --out replays/x.replay.jsonl
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

from .engine import Engine
from .random_play import play_game
from .rules import ENGINE_VERSION, RulesConfig

SCHEMA = "monopoly-replay/1"


def replay_lines(
    rules: RulesConfig,
    seed: int,
    actions: list,
    players=None,
    engine: Engine | None = None,
):
    """Yield replay line dicts (header, step 0, one per action)."""
    eng = engine or Engine(rules)
    players = players or [
        {"name": "Random A", "kind": "random"},
        {"name": "Random B", "kind": "random"},
    ]
    s = eng.reset(seed)
    yield {
        "type": "header",
        "schema": SCHEMA,
        "engine_version": ENGINE_VERSION,
        "board": "board_de",
        "board_hash": eng.board.hash,
        "seed": seed,
        "rules": rules.to_dict(),
        "players": players,
    }
    yield {
        "type": "step",
        "t": 0,
        "player": s.current_player,
        "action": None,
        "forced": False,
        "events": [],
        "state": s.to_replay_dict(),
        "agent": None,
    }
    for t, a in enumerate(actions, start=1):
        legal = eng.legal_list(s)
        forced = rules.auto_single_action and len(legal) == 1
        player = s.current_player
        _, events = eng.step(s, a)
        yield {
            "type": "step",
            "t": t,
            "player": player,
            "action": eng.actions.action(a),
            "forced": forced,
            "events": events,
            "state": s.to_replay_dict(),
            "agent": None,
        }


def write_replay(path: Path, rules, seed, actions, players=None) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    n = 0
    with path.open("w") as f:
        for line in replay_lines(rules, seed, actions, players):
            f.write(json.dumps(line, ensure_ascii=False, separators=(",", ":")) + "\n")
            n += 1
    return n


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("games", nargs="?", type=Path, help="games.jsonl training log")
    ap.add_argument("--index", type=int, default=0)
    ap.add_argument("--random", action="store_true", help="play a random game directly")
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument(
        "--policy", default="uniform", choices=["uniform", "sensible-random"]
    )
    ap.add_argument("--max-rounds", type=int, default=200)
    ap.add_argument("--out", type=Path, required=True)
    a = ap.parse_args(argv)
    if a.random:
        rules = RulesConfig(max_rounds=a.max_rounds)
        seed = a.seed
        actions = play_game(Engine(rules), seed, a.policy)
        name = "Sensible Random" if a.policy == "sensible-random" else "Random"
        players = [
            {"name": f"{name} A", "kind": "random"},
            {"name": f"{name} B", "kind": "random"},
        ]
    else:
        if not a.games:
            ap.error("give a games.jsonl file or --random")
        with a.games.open() as f:
            for i, line in enumerate(f):
                if i == a.index:
                    rec = json.loads(line)
                    break
            else:
                ap.error(f"index {a.index} out of range")
        if rec["engine_version"] != ENGINE_VERSION:
            print(
                f"warning: log engine_version {rec['engine_version']} != {ENGINE_VERSION}",
                file=sys.stderr,
            )
        rules = RulesConfig.from_dict(rec["rules"])
        seed, actions, players = rec["seed"], rec["actions"], None
    n = write_replay(a.out, rules, seed, actions, players)
    print(f"wrote {n} lines to {a.out} ({n - 2} steps)", file=sys.stderr)


if __name__ == "__main__":
    main()
