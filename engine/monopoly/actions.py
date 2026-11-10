"""Discrete action space: index <-> named action dict."""

from __future__ import annotations

from .data import DEFAULT_BOARD
from .rules import RulesConfig

ROLL, END_TURN, BUY, DECLINE_BUY, PAY_JAIL_FINE, USE_JAIL_CARD = range(6)
BUILD_BASE = 6
N_STREETS = 22
SELL_BASE = BUILD_BASE + N_STREETS  # 28
N_ACTIONS_V1 = SELL_BASE + N_STREETS  # 50

_SIMPLE = ["ROLL", "END_TURN", "BUY", "DECLINE_BUY", "PAY_JAIL_FINE", "USE_JAIL_CARD"]


class ActionSpace:
    """v1: 50 actions. Index order is fixed by docs/game_state.md section 4."""

    def __init__(self, rules: RulesConfig | None = None, board=None):
        self.rules = rules or RulesConfig()
        self.board = board or DEFAULT_BOARD
        streets = self.board.streets_l
        self._actions: list[dict] = [{"type": t} for t in _SIMPLE]
        self._actions += [{"type": "BUILD", "space": sp} for sp in streets]
        self._actions += [{"type": "SELL_BUILDING", "space": sp} for sp in streets]
        self.n = len(self._actions)
        self._index = {self._key(a): i for i, a in enumerate(self._actions)}

    @staticmethod
    def _key(a: dict):
        return (a["type"], a.get("space"))

    def __len__(self) -> int:
        return self.n

    def action(self, index: int) -> dict:
        return dict(self._actions[index])

    def index(self, action: dict) -> int:
        return self._index[self._key(action)]
