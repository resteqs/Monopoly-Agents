from helpers import *


def land(eng, s, space, dice=(3, 4), owner=1):
    return place_and_roll(eng, s, space - sum(dice), *dice)


def test_base_rent():
    eng, s = fresh()
    own(s, 1, [11])
    ev = land(eng, s, 11)
    assert s.cash[0] == 1490 and s.cash[1] == 1510
    assert any(e["type"] == "rent" and e["amount"] == 10 for e in ev)


def test_monopoly_doubles_unimproved_rent():
    eng, s = fresh()
    own(s, 1, [11, 13, 14])
    land(eng, s, 11)
    assert s.cash[0] == 1480


def test_house_and_hotel_rent():
    for lvl, expected in [(1, 50), (2, 150), (3, 450), (4, 625), (5, 750)]:
        eng, s = fresh()
        own(s, 1, [11, 13, 14])
        s.buildings[11] = lvl
        land(eng, s, 11)
        assert 1500 - s.cash[0] == expected, lvl


def test_station_rent_by_count():
    for owned, expected in [
        ([15], 25),
        ([15, 5], 50),
        ([15, 5, 25], 100),
        ([15, 5, 25, 35], 200),
    ]:
        eng, s = fresh()
        own(s, 1, owned)
        land(eng, s, 15)
        assert 1500 - s.cash[0] == expected


def test_utility_rent():
    eng, s = fresh()
    own(s, 1, [12])
    land(eng, s, 12, (3, 4))
    assert 1500 - s.cash[0] == 28
    eng, s = fresh()
    own(s, 1, [12, 28])
    land(eng, s, 12, (3, 4))
    assert 1500 - s.cash[0] == 70


def test_no_rent_on_own_property_and_buy_flow():
    eng, s = fresh()
    own(s, 0, [11])
    land(eng, s, 11)
    assert s.cash[0] == 1500 and s.phase == 2
    eng, s = fresh()
    land(eng, s, 11)
    assert s.phase == 1
    assert list(eng.legal_list(s)) == [BUY, DECLINE]
    eng.step(s, BUY)
    assert s.owner[11] == 0 and s.cash[0] == 1360 and s.phase == 2
    eng, s = fresh()
    land(eng, s, 11)
    s.cash[0] = 100
    assert eng.legal_list(s) == [DECLINE]
    eng.step(s, DECLINE)
    assert s.owner[11] == -1 and s.phase == 2


def test_tax_and_salary():
    eng, s = fresh()
    ev = place_and_roll(eng, s, 1, 1, 2)  # 1 -> 4 Einkommensteuer
    assert s.cash[0] == 1300 and "tax" in ev_types(ev)
    eng, s = fresh()
    ev = place_and_roll(eng, s, 36, 2, 5)  # passes Los, lands on 3
    assert s.cash[0] == 1700 and any(e["type"] == "move" and e["passed_go"] for e in ev)
    eng, s = fresh()
    place_and_roll(eng, s, 33, 3, 4)  # lands exactly on Los: salary once
    assert s.position[0] == 0 and s.cash[0] == 1700


def test_go_to_jail_space():
    eng, s = fresh()
    ev = place_and_roll(eng, s, 23, 3, 4)
    assert s.position[0] == 10 and s.jail_turns[0] == 1
    assert {"type": "jail", "player": 0, "reason": "go_to_jail"} in ev
    assert eng.legal_list(s) == [END_TURN]
