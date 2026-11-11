from helpers import *


def test_needs_full_group_and_even_build():
    eng, s = fresh()
    own(s, 0, [1])
    assert not [a for a in eng.legal_list(s) if a >= 6]
    own(s, 0, [3])
    acts = eng.legal_list(s)
    assert build_a(1) in acts and build_a(3) in acts
    assert not [a for a in acts if a >= 28]
    eng.step(s, build_a(1))
    acts = eng.legal_list(s)
    assert build_a(1) not in acts and build_a(3) in acts
    assert sell_a(1) in acts and sell_a(3) not in acts
    assert s.cash[0] == 1450 and s.houses_left == 31
    eng.step(s, build_a(3))
    acts = eng.legal_list(s)
    assert build_a(1) in acts and sell_a(1) in acts and sell_a(3) in acts


def test_mask_matches_list_and_shape():
    eng, s = fresh()
    mask = eng.legal_mask(s)
    assert mask.dtype == bool and mask.shape == (50,)
    assert mask.nonzero()[0].tolist() == eng.legal_list(s) == [ROLL]


def test_cannot_build_without_cash():
    eng, s = fresh()
    own(s, 0, [37, 39])
    s.cash[0] = 199
    assert not [a for a in eng.legal_list(s) if 6 <= a < 28]
    s.cash[0] = 200
    assert build_a(37) in eng.legal_list(s)


def test_house_supply_limit():
    eng, s = fresh()
    own(s, 0, [1, 3])
    s.houses_left = 0
    assert not [a for a in eng.legal_list(s) if 6 <= a < 28]
    s.houses_left = 1
    assert build_a(1) in eng.legal_list(s)


def test_hotel_flow_and_supply():
    eng, s = fresh()
    own(s, 0, [1, 3])
    s.buildings[1] = 4
    s.buildings[3] = 3
    s.houses_left = 32 - 7
    assert build_a(1) not in eng.legal_list(s)  # even build: 3 first
    eng.step(s, build_a(3))
    assert s.houses_left == 24
    assert build_a(1) in eng.legal_list(s)
    s.hotels_left = 0
    assert build_a(1) not in eng.legal_list(s)
    s.hotels_left = 12
    eng.step(s, build_a(1))
    assert s.buildings[1] == 5 and s.houses_left == 28 and s.hotels_left == 11


def test_sell_even_and_hotel_needs_four_houses():
    eng, s = fresh()
    own(s, 0, [1, 3])
    s.buildings[1] = 5
    s.buildings[3] = 5
    s.houses_left = 3
    assert not [a for a in eng.legal_list(s) if a >= 28]
    s.houses_left = 4
    eng.step(s, sell_a(1))
    assert (
        s.buildings[1] == 4 and s.houses_left == 0 and s.hotels_left == 13
    )  # hand-made state: 12 + 1
    assert s.cash[0] == 1525
    acts = eng.legal_list(s)
    # street 3 still has a hotel but the bank has 0 houses; street 1 is not the highest (even selling)
    assert not [a for a in acts if a >= 28]
