from monopoly import Engine, RulesConfig
from monopoly.actions import BUILD_BASE, SELL_BASE
from monopoly.data import DEFAULT_BOARD, DEFAULT_CARDS

ROLL, END_TURN, BUY, DECLINE, PAY_FINE, USE_CARD = range(6)
STREETS = DEFAULT_BOARD.streets_l


def fresh(seed=0, rules=None):
    eng = Engine(rules or RulesConfig())
    return eng, eng.reset(seed)


def build_a(space):
    return BUILD_BASE + STREETS.index(space)


def sell_a(space):
    return SELL_BASE + STREETS.index(space)


def own(s, p, spaces):
    for sp in spaces:
        s.owner[sp] = p


def stack(s, deck, card_idx):
    """Make `card_idx` the next card of deck ('chance'|'community')."""
    order = s.chance_order if deck == "chance" else s.community_order
    ptr = s.chance_ptr if deck == "chance" else s.community_ptr
    j = list(order).index(card_idx)
    assert j >= ptr
    order[ptr], order[j] = order[j], order[ptr]


def roll(eng, s, d1, d2):
    eng.force_dice([(d1, d2)])
    return eng.step(s, ROLL)[1]


def place_and_roll(eng, s, pos, d1, d2, p=0):
    s.position[p] = pos
    return roll(eng, s, d1, d2)


def ev_types(events):
    return [e["type"] for e in events]


def set_post_roll(s):
    s.phase = 2
    s.doubles = 0


def card_idx(deck, cid):
    return DEFAULT_CARDS.ids[0 if deck == "chance" else 1].index(cid)
