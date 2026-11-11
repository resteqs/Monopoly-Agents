import json

import numpy as np
from helpers import *

from monopoly import ActionSpace, Engine, RulesConfig
from monopoly.encode import encode_baseline
from monopoly.export_replay import main as export_main, replay_lines
from monopoly.random_play import main as play_main, play_game
from monopoly.state import LAYOUT, STATE_LEN, State


def run(seed, actions):
    eng = Engine(RulesConfig())
    s = eng.reset(seed)
    evs = []
    for a in actions:
        evs.append(eng.step(s, a)[1])
    return s, evs


def test_determinism_same_seed_and_actions():
    for seed in range(5):
        acts = play_game(Engine(RulesConfig()), seed, "uniform")
        s1, e1 = run(seed, acts)
        s2, e2 = run(seed, acts)
        assert np.array_equal(s1.buf, s2.buf) and e1 == e2
        assert s1.phase == 3


def test_legal_mask_never_empty_and_random_games_terminate():
    eng = Engine(RulesConfig())
    for seed in range(30):
        pol = "sensible-random" if seed % 2 else "uniform"
        import random

        rnd = random.Random(seed)
        s = eng.reset(seed)
        n = 0
        while s.phase != 3:
            mask = eng.legal_mask(s)
            assert mask.any()
            eng.step(s, int(rnd.choice(np.flatnonzero(mask))))
            n += 1
            assert n < 20000
        assert s.winner in (-2, 0, 1)
        assert not eng.legal_mask(s).any()


def test_action_space():
    a = ActionSpace(RulesConfig())
    assert a.n == 50
    assert a.action(0) == {"type": "ROLL"} and a.action(5) == {"type": "USE_JAIL_CARD"}
    assert a.action(6) == {"type": "BUILD", "space": 1} and a.action(27) == {
        "type": "BUILD",
        "space": 39,
    }
    assert a.action(28) == {"type": "SELL_BUILDING", "space": 1}
    assert all(a.index(a.action(i)) == i for i in range(50))


def test_state_layout_copy_and_views():
    s = State()
    assert STATE_LEN == s.buf.size and s.buf.dtype == np.int32
    s.cash[2] = 7
    assert s.buf[LAYOUT["cash"][0] + 2] == 7
    c = s.copy()
    c.cash[2] = 9
    assert s.cash[2] == 7
    s.turn = 5
    assert s.buf[LAYOUT["turn"][0]] == 5 and s.m[LAYOUT["turn"][0]] == 5
    batch = np.stack([s.buf, c.buf])
    assert batch.shape == (2, STATE_LEN)


def test_encoder_is_ego_centric():
    eng, s = fresh(3)
    own(s, 0, [1])
    s.position[0], s.position[1] = 5, 12
    a = encode_baseline(s, 0)
    b = encode_baseline(s, 1)
    assert a.dtype == np.float32 and a.shape == b.shape
    assert a[5] == 1 and a[40 + 12] == 1 and b[12] == 1 and b[40 + 5] == 1
    assert (
        encode_baseline(s, 0, groups=("core", "bank", "exposure")).shape[0]
        == a.shape[0] + 41
    )


def test_games_log_export_roundtrip(tmp_path):
    log = tmp_path / "g.games.jsonl"
    play_main(["--games", "3", "--seed", "40", "--out", str(log)])
    recs = [json.loads(l) for l in log.read_text().splitlines()]
    assert len(recs) == 3 and set(recs[0]) == {
        "engine_version",
        "rules",
        "seed",
        "actions",
    }
    out = tmp_path / "r.replay.jsonl"
    export_main([str(log), "--index", "1", "--out", str(out)])
    lines = [json.loads(l) for l in out.read_text().splitlines()]
    rec = recs[1]
    final, _ = run(rec["seed"], rec["actions"])
    assert lines[-1]["state"] == final.to_replay_dict()
    assert lines[-1]["state"]["winner"] == final.winner and final.phase == 3
    h = lines[0]
    assert (
        h["type"] == "header"
        and h["schema"] == "monopoly-replay/1"
        and h["board_hash"].startswith("sha256:")
    )
    assert h["rules"] == RulesConfig().to_dict() and h["seed"] == rec["seed"]
    assert lines[1]["t"] == 0 and lines[1]["action"] is None
    assert [l["t"] for l in lines[1:]] == list(range(len(lines) - 1))
    assert len(lines) == len(rec["actions"]) + 2
    for l in lines[1:]:
        assert l["type"] == "step" and isinstance(l["events"], list)
        st = l["state"]
        assert st["phase"] in ("PRE_ROLL", "BUY_DECISION", "POST_ROLL", "GAME_OVER")
        assert len(st["owner"]) == len(st["buildings"]) == len(st["mortgaged"]) == 40
        assert all(isinstance(p["bankrupt"], bool) for p in st["players"])
        if l["t"]:
            assert set(l["action"]) <= {"type", "space"}
    assert any(l["forced"] for l in lines[2:])
    assert lines[-1]["events"][-1]["type"] == "game_over"


def test_random_shortcut_export(tmp_path):
    out = tmp_path / "x.replay.jsonl"
    export_main(
        ["--random", "--seed", "5", "--policy", "sensible-random", "--out", str(out)]
    )
    lines = [json.loads(l) for l in out.read_text().splitlines()]
    assert lines[0]["players"][0]["name"].startswith("Sensible")
    assert lines[-1]["state"]["phase"] == "GAME_OVER"


def test_advance_forced_and_auto():
    eng, s = fresh(1)
    steps = list(eng.advance_forced(s))
    assert [a for a, _ in steps][0] == ROLL
    assert len(eng.legal_list(s)) != 1 or s.phase == 3
    eng2 = Engine(RulesConfig())
    s2, _ = eng2.reset_auto(1)
    assert np.array_equal(s.buf, s2.buf)
