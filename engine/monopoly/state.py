"""Engine state: one flat int32 buffer with named views (layout per docs/game_state.md section 2)."""

from __future__ import annotations

import numpy as np

MAX_PLAYERS = 4
PRE_ROLL, BUY_DECISION, POST_ROLL, GAME_OVER = range(4)
PHASE_NAMES = ["PRE_ROLL", "BUY_DECISION", "POST_ROLL", "GAME_OVER"]

_FIELDS = [
    ("n_players", 1),
    ("current_player", 1),
    ("phase", 1),
    ("turn", 1),
    ("step", 1),
    ("doubles", 1),
    ("die1", 1),
    ("die2", 1),
    ("houses_left", 1),
    ("hotels_left", 1),
    ("pot", 1),
    ("pending_kind", 1),
    ("pending_space", 1),
    ("winner", 1),
    ("chance_ptr", 1),
    ("community_ptr", 1),
    ("chance_jail_card_holder", 1),
    ("community_jail_card_holder", 1),
    ("cash", MAX_PLAYERS),
    ("position", MAX_PLAYERS),
    ("jail_turns", MAX_PLAYERS),
    ("jail_cards", MAX_PLAYERS),
    ("bankrupt", MAX_PLAYERS),
    ("owner", 40),
    ("buildings", 40),
    ("mortgaged", 40),
    ("chance_order", 16),
    ("community_order", 16),
]
LAYOUT: dict[str, tuple[int, int]] = {}
_off = 0
for _n, _l in _FIELDS:
    LAYOUT[_n] = (_off, _l)
    _off += _l
STATE_LEN = _off

# Offsets for the fast engine (memoryview indexing).
O_NP = LAYOUT["n_players"][0]
O_CUR = LAYOUT["current_player"][0]
O_PHASE = LAYOUT["phase"][0]
O_TURN = LAYOUT["turn"][0]
O_STEP = LAYOUT["step"][0]
O_DOUBLES = LAYOUT["doubles"][0]
O_DIE1 = LAYOUT["die1"][0]
O_DIE2 = LAYOUT["die2"][0]
O_HOUSES = LAYOUT["houses_left"][0]
O_HOTELS = LAYOUT["hotels_left"][0]
O_POT = LAYOUT["pot"][0]
O_PKIND = LAYOUT["pending_kind"][0]
O_PSPACE = LAYOUT["pending_space"][0]
O_WINNER = LAYOUT["winner"][0]
O_PTR = (LAYOUT["chance_ptr"][0], LAYOUT["community_ptr"][0])
O_HOLDER = (
    LAYOUT["chance_jail_card_holder"][0],
    LAYOUT["community_jail_card_holder"][0],
)
O_CASH = LAYOUT["cash"][0]
O_POS = LAYOUT["position"][0]
O_JT = LAYOUT["jail_turns"][0]
O_JC = LAYOUT["jail_cards"][0]
O_BANKRUPT = LAYOUT["bankrupt"][0]
O_OWNER = LAYOUT["owner"][0]
O_BLD = LAYOUT["buildings"][0]
O_MORT = LAYOUT["mortgaged"][0]
O_ORDER = (LAYOUT["chance_order"][0], LAYOUT["community_order"][0])

_SCALARS = [n for n, l in _FIELDS if l == 1]
_ARRAYS = [n for n, l in _FIELDS if l > 1]


def _scalar_prop(off: int) -> property:
    def get(self):
        return int(self.buf[off])

    def set_(self, v):
        self.buf[off] = v

    return property(get, set_)


class State:
    """Flat int32 buffer ``buf`` + named views. Scalars are properties, arrays are numpy views."""

    __slots__ = ("buf", "m") + tuple(_ARRAYS)

    def __init__(self, buf: np.ndarray | None = None):
        if buf is None:
            buf = np.zeros(STATE_LEN, dtype=np.int32)
        assert buf.dtype == np.int32 and buf.shape == (STATE_LEN,)
        self.buf = buf
        self.m = memoryview(buf)  # fast python-int access for the engine
        for n in _ARRAYS:
            o, l = LAYOUT[n]
            setattr(self, n, buf[o : o + l])

    def copy(self) -> "State":
        return State(self.buf.copy())

    def to_replay_dict(self) -> dict:
        n = int(self.buf[O_NP])
        players = [
            {
                "cash": int(self.cash[i]),
                "position": int(self.position[i]),
                "jail_turns": int(self.jail_turns[i]),
                "jail_cards": int(self.jail_cards[i]),
                "bankrupt": bool(self.bankrupt[i]),
            }
            for i in range(n)
        ]
        return {
            "turn": self.turn,
            "phase": PHASE_NAMES[self.phase],
            "current_player": self.current_player,
            "dice": [self.die1, self.die2],
            "doubles": self.doubles,
            "players": players,
            "owner": self.owner.tolist(),
            "buildings": self.buildings.tolist(),
            "mortgaged": self.mortgaged.tolist(),
            "houses_left": self.houses_left,
            "hotels_left": self.hotels_left,
            "pot": self.pot,
            "winner": self.winner,
        }


for _n in _SCALARS:
    setattr(State, _n, _scalar_prop(LAYOUT[_n][0]))
