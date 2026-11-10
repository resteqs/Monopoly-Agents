from helpers import *


def card_roll(deck, cid, pos_chance=7, p=0, dice=(3, 4), eng_s=None):
    eng, s = eng_s or fresh()
    stack(s, deck, card_idx(deck, cid))
    ev = place_and_roll(
        eng,
        s,
        pos_chance - sum(dice)
        if pos_chance >= sum(dice)
        else pos_chance + 40 - sum(dice),
        *dice,
        p=p,
    )
    return eng, s, ev


def test_cash_cards():
    _, s, _ = card_roll("chance", "C12")
    assert s.cash[0] == 1650
    _, s, _ = card_roll("chance", "C14")
    assert s.cash[0] == 1485


def test_go_to_jail_card():
    _, s, ev = card_roll("chance", "C02")
    assert s.position[0] == 10 and s.jail_turns[0] == 1 and s.phase == 2
    assert {"type": "jail", "player": 0, "reason": "card"} in ev


def test_move_to_with_and_without_salary():
    _, s, _ = card_roll("chance", "C03")  # Los: from 7 passes Los -> +200
    assert s.position[0] == 0 and s.cash[0] == 1700
    _, s, _ = card_roll("chance", "C08")  # Suedbahnhof (5) from 7: passes Los
    assert s.position[0] == 5 and s.cash[0] == 1500 + 200 - 0 and s.phase == 1
    _, s, _ = card_roll("chance", "C09")  # Seestrasse (11) from 7: no salary
    assert s.position[0] == 11 and s.cash[0] == 1500 and s.phase == 1


def test_move_back_three_onto_tax():
    _, s, ev = card_roll("chance", "C04")  # 7 -> 4 Einkommensteuer
    assert s.position[0] == 4 and s.cash[0] == 1300
    assert not any(e.get("passed_go") for e in ev)


def test_move_back_three_onto_community_draws_card():
    eng, s = fresh()
    stack(s, "community", card_idx("community", "G04"))  # +200
    _, s, ev = card_roll("chance", "C04", pos_chance=36, eng_s=(eng, s))
    assert s.position[0] == 33 and s.cash[0] == 1700
    assert [e["id"] for e in ev if e["type"] == "card"] == ["C04", "G04"]


def test_move_back_three_onto_street():
    _, s, _ = card_roll("chance", "C04", pos_chance=22)
    assert s.position[0] == 19 and s.phase == 1


def test_nearest_station_pays_double():
    eng, s = fresh()
    own(s, 1, [15])
    _, s, ev = card_roll("chance", "C05", eng_s=(eng, s))
    assert s.position[0] == 15 and 1500 - s.cash[0] == 50
    eng, s = fresh()
    own(s, 1, [15, 5])
    _, s, _ = card_roll("chance", "C06", eng_s=(eng, s))
    assert 1500 - s.cash[0] == 100


def test_nearest_station_unowned_offers_buy_and_wraps_with_salary():
    _, s, _ = card_roll("chance", "C05", pos_chance=36)
    assert s.position[0] == 5 and s.cash[0] == 1700 and s.phase == 1
    _, s, _ = card_roll("chance", "C05")
    assert s.position[0] == 15 and s.phase == 1 and s.cash[0] == 1500


def test_nearest_utility_ten_times_fresh_dice():
    eng, s = fresh()
    own(s, 1, [12])
    stack(s, "chance", card_idx("chance", "C07"))
    s.position[0] = 0
    eng.force_dice([(3, 4), (2, 3)])
    eng.step(s, ROLL)
    assert s.position[0] == 12 and 1500 - s.cash[0] == 50
    eng, s = fresh()
    _, s, _ = card_roll("chance", "C07", eng_s=(eng, s))
    assert s.phase == 1 and s.position[0] == 12


def test_cash_each_player():
    _, s, _ = card_roll("chance", "C15")
    assert s.cash[0] == 1450 and s.cash[1] == 1550
    _, s, _ = card_roll("community", "G12", pos_chance=2, dice=(1, 1))
    assert s.cash[0] == 1510 and s.cash[1] == 1490


def test_repairs():
    eng, s = fresh()
    own(s, 0, [1, 3, 37])
    s.buildings[1] = 2
    s.buildings[3] = 2
    s.buildings[37] = 5
    s.hotels_left = 11
    s.houses_left = 28
    _, s, _ = card_roll("chance", "C16", eng_s=(eng, s))
    assert 1500 - s.cash[0] == 4 * 25 + 100
    eng, s = fresh()
    own(s, 0, [1, 3, 37])
    s.buildings[1] = 1
    _, s, _ = card_roll("community", "G16", pos_chance=2, dice=(1, 1), eng_s=(eng, s))
    assert 1500 - s.cash[0] == 40


def test_card_payment_bankrupts():
    eng, s = fresh()
    s.cash[0] = 10
    _, s, _ = card_roll("chance", "C14", eng_s=(eng, s))
    assert s.phase == 3 and s.winner == 1


def test_deck_reshuffles_without_held_jail_card():
    eng, s = fresh()
    stack(s, "chance", card_idx("chance", "C01"))
    eng._draw(s, [], 0, 0)
    assert s.chance_jail_card_holder == 0 and s.jail_cards[0] == 1
    ids = []
    for _ in range(45):
        ev = []
        eng._draw(s, ev, 1, 0)
        s.cash[1] = 5000
        s.cash[0] = 5000
        s.phase = 0
        s.winner = -1
        s.bankrupt[:] = 0
        s.position[1] = 0
        ids += [e["id"] for e in ev if e["type"] == "card"]
    assert "C01" not in ids  # a held jail card is not in the deck, reshuffles included
    assert len(ids) == 45
