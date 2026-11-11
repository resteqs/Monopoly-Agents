from helpers import *


def own_all_streets(s, p=0):
    own(s, p, [i for i in range(40) if DEFAULT_BOARD.price_l[i]])


def test_three_doubles_to_jail():
    eng, s = fresh()
    own_all_streets(s)
    stack(s, "community", card_idx("community", "G09"))
    eng.force_dice([(1, 1), (2, 2), (3, 3)])
    eng.step(s, ROLL)  # -> 2 community
    assert s.position[0] == 2 and s.doubles == 1
    assert ROLL in eng.legal_list(s) and END_TURN not in eng.legal_list(s)
    eng.step(s, ROLL)  # -> 6
    assert s.position[0] == 6 and s.doubles == 2
    _, ev = eng.step(s, ROLL)
    assert s.position[0] == 10 and s.jail_turns[0] == 1 and s.doubles == 0
    assert {"type": "jail", "player": 0, "reason": "three_doubles"} in ev
    assert eng.legal_list(s)[0] == END_TURN and ROLL not in eng.legal_list(s)
    eng.step(s, END_TURN)
    assert s.current_player == 1 and s.turn == 1


def test_pay_fine_then_roll_normally():
    eng, s = fresh()
    s.position[0] = 10
    s.jail_turns[0] = 2
    assert eng.legal_list(s) == [ROLL, PAY_FINE]
    _, ev = eng.step(s, PAY_FINE)
    assert s.cash[0] == 1450 and s.jail_turns[0] == 0 and s.phase == 0
    assert {"type": "jail_release", "player": 0, "how": "fine"} in ev
    stack(s, "community", card_idx("community", "G09"))
    roll(eng, s, 3, 4)
    assert s.position[0] == 17 and s.cash[0] == 1475


def test_use_jail_card_returns_to_deck_bottom():
    eng, s = fresh()
    stack(s, "chance", card_idx("chance", "C01"))
    place_and_roll(eng, s, 0, 3, 4)  # chance at 7
    assert s.chance_jail_card_holder == 0 and s.jail_cards[0] == 1
    s.position[0] = 10
    s.jail_turns[0] = 1
    s.phase = 0
    assert eng.legal_list(s) == [ROLL, PAY_FINE, USE_CARD]
    _, ev = eng.step(s, USE_CARD)
    assert (
        s.jail_turns[0] == 0
        and s.jail_cards[0] == 0
        and s.chance_jail_card_holder == -1
    )
    assert {"type": "jail_release", "player": 0, "how": "card"} in ev
    remaining = [c for c in s.chance_order[s.chance_ptr :] if c >= 0]
    assert remaining[-1] == 0


def test_forced_fine_on_third_turn():
    eng, s = fresh()
    s.position[0] = 10
    s.jail_turns[0] = 3
    ev = roll(eng, s, 1, 2)
    assert s.cash[0] == 1450 and s.jail_turns[0] == 0 and s.position[0] == 13
    assert {"type": "jail_release", "player": 0, "how": "forced_fine"} in ev
    assert s.phase == 1  # Hafenstrasse unowned


def test_forced_fine_bankrupts_when_broke():
    eng, s = fresh()
    s.position[0] = 10
    s.jail_turns[0] = 3
    s.cash[0] = 20
    roll(eng, s, 1, 2)
    assert s.phase == 3 and s.winner == 1


def test_failed_roll_stays_in_jail_and_counts_up():
    eng, s = fresh()
    s.position[0] = 10
    s.jail_turns[0] = 1
    roll(eng, s, 1, 2)
    assert s.position[0] == 10 and s.jail_turns[0] == 2 and s.phase == 2
    assert eng.legal_list(s) == [END_TURN]


def test_doubles_free_and_move_without_extra_roll():
    eng, s = fresh()
    s.position[0] = 10
    s.jail_turns[0] = 2
    ev = roll(eng, s, 2, 2)
    assert s.jail_turns[0] == 0 and s.position[0] == 14
    assert {"type": "jail_release", "player": 0, "how": "doubles"} in ev
    eng.step(s, DECLINE)
    assert eng.legal_list(s) == [END_TURN]


def test_rent_collected_while_in_jail():
    eng, s = fresh()
    own(s, 1, [11])
    s.position[1] = 10
    s.jail_turns[1] = 2
    place_and_roll(eng, s, 4, 3, 4)
    assert s.cash[1] == 1510 and s.cash[0] == 1490
