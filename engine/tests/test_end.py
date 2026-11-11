from helpers import *


def test_rent_bankruptcy_is_immediate():
    eng, s = fresh()
    own(s, 1, [11, 13, 14])
    own(s, 0, [1, 3])
    s.buildings[1] = 3
    s.buildings[3] = 3
    s.houses_left = 26
    s.cash[0] = 5
    ev = place_and_roll(eng, s, 4, 3, 4)
    assert s.phase == 3 and s.winner == 1 and s.bankrupt[0] == 1
    assert (
        s.owner[1] == -1
        and s.owner[3] == -1
        and s.buildings[1] == 0
        and s.houses_left == 32
    )
    assert ev[-1]["type"] == "game_over" and ev[-1]["reason"] == "bankruptcy"
    assert any(
        e["type"] == "bankrupt" and e["player"] == 0 and e["creditor"] == 1 for e in ev
    )
    assert eng.legal_list(s) == [] and not eng.legal_mask(s).any()


def test_tax_bankruptcy_hotel_returns_to_supply():
    eng, s = fresh()
    own(s, 0, [37, 39])
    s.buildings[37] = 5
    s.hotels_left = 11
    s.cash[0] = 50
    place_and_roll(eng, s, 1, 1, 2)
    assert s.winner == 1 and s.hotels_left == 12 and s.owner[37] == -1


def test_cannot_step_after_game_over():
    import pytest

    eng, s = fresh()
    s.cash[0] = 1
    place_and_roll(eng, s, 1, 1, 2)
    with pytest.raises(ValueError):
        eng.step(s, ROLL)


def _limit(eng, s):
    s.turn = eng.rules.max_rounds * 2 - 1
    set_post_roll(s)
    return eng.step(s, END_TURN)[1]


def test_turn_limit_net_worth_winner():
    eng, s = fresh()
    own(s, 0, [39])
    s.buildings[39] = 0
    s.cash[1] = 1500 + 300
    ev = _limit(eng, s)  # p0: 1500+400=1900 > p1: 1800
    assert s.phase == 3 and s.winner == 0
    assert ev[-1] == {
        "type": "game_over",
        "winner": 0,
        "reason": "turn_limit",
        "net_worth": [1900, 1800],
    }
    eng, s = fresh()
    own(s, 0, [37, 39])
    s.buildings[37] = 1
    s.houses_left = 31
    s.cash[0] = 0
    s.cash[1] = 1000
    _limit(eng, s)  # p0: 750 + 200 = 950 < 1000 < 1000
    assert s.winner == 1


def test_turn_limit_draw():
    eng, s = fresh()
    _limit(eng, s)
    assert s.winner == -2 and s.phase == 3


def test_turn_counter_and_alternation():
    eng, s = fresh()
    set_post_roll(s)
    _, ev = eng.step(s, END_TURN)
    assert s.current_player == 1 and s.turn == 1 and s.phase == 0
    assert ev == [{"type": "turn_start", "player": 1, "turn": 1}]
