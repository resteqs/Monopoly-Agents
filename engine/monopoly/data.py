"""Static board + card data loaded from JSON into constant arrays / lists."""

from __future__ import annotations

import hashlib
import json
from pathlib import Path

import numpy as np

DATA_DIR = Path(__file__).parent / "data"

# space type codes
(
    T_GO,
    T_STREET,
    T_COMMUNITY,
    T_TAX,
    T_STATION,
    T_CHANCE,
    T_JAIL,
    T_UTILITY,
    T_FREE,
    T_GOTOJAIL,
) = range(10)
_TYPE_CODES = {
    "go": T_GO,
    "street": T_STREET,
    "community": T_COMMUNITY,
    "tax": T_TAX,
    "station": T_STATION,
    "chance": T_CHANCE,
    "jail": T_JAIL,
    "utility": T_UTILITY,
    "free_parking": T_FREE,
    "go_to_jail": T_GOTOJAIL,
}
GROUP_STATION = 8
GROUP_UTILITY = 9

# card effect codes
(
    E_JAIL_FREE,
    E_GO_TO_JAIL,
    E_MOVE_TO,
    E_MOVE_BY,
    E_NEAREST,
    E_CASH,
    E_EACH,
    E_REPAIRS,
) = range(8)


class Board:
    """Constant board tables. NumPy arrays for encoders, plain lists (``*_l``) for the fast engine."""

    def __init__(self, path: Path | None = None):
        path = Path(path) if path else DATA_DIR / "board_de.json"
        raw_bytes = path.read_bytes()
        self.hash = "sha256:" + hashlib.sha256(raw_bytes).hexdigest()
        raw = json.loads(raw_bytes)
        self.raw = raw
        self.start_cash = raw["start_cash"]
        self.go_salary = raw["go_salary"]
        self.jail_fine = raw["jail_fine"]
        self.jail_space = raw["jail_space"]
        self.go_to_jail_space = raw["go_to_jail_space"]
        self.max_jail_turns = raw["max_jail_turns"]
        self.houses_total = raw["houses_total"]
        self.hotels_total = raw["hotels_total"]
        self.station_rent = list(raw["station_rent"])
        self.utility_multiplier = list(raw["utility_multiplier"])

        n = 40
        price = [0] * n
        rent = [[0] * 6 for _ in range(n)]
        group = [-1] * n
        house_cost = [0] * n
        stype = [0] * n
        tax = [0] * n
        self.names = [""] * n
        self.group_names = list(raw["groups"].keys())
        gidx = {g: i for i, g in enumerate(self.group_names)}
        for sp in raw["spaces"]:
            i = sp["i"]
            self.names[i] = sp["name"]
            stype[i] = _TYPE_CODES[sp["type"]]
            price[i] = sp.get("price", 0)
            tax[i] = sp.get("amount", 0)
            if sp["type"] == "street":
                rent[i] = list(sp["rent"])
                group[i] = gidx[sp["group"]]
                house_cost[i] = raw["groups"][sp["group"]]["house_cost"]
            elif sp["type"] == "station":
                group[i] = GROUP_STATION
            elif sp["type"] == "utility":
                group[i] = GROUP_UTILITY
        self.price_l, self.rent_l, self.group_l = price, rent, group
        self.house_cost_l, self.type_l, self.tax_l = house_cost, stype, tax
        self.group_spaces_l = [list(g["spaces"]) for g in raw["groups"].values()]
        self.group_spaces_l.append([i for i in range(n) if stype[i] == T_STATION])
        self.group_spaces_l.append([i for i in range(n) if stype[i] == T_UTILITY])
        self.streets_l = [i for i in range(n) if stype[i] == T_STREET]
        self.stations_l = self.group_spaces_l[GROUP_STATION]
        self.utilities_l = self.group_spaces_l[GROUP_UTILITY]
        self.street_k_l = [-1] * n
        for k, sp in enumerate(self.streets_l):
            self.street_k_l[sp] = k

        self.price = np.array(price, dtype=np.int32)
        self.rent = np.array(rent, dtype=np.int32)
        self.group = np.array(group, dtype=np.int32)
        self.house_cost = np.array(house_cost, dtype=np.int32)
        self.space_type = np.array(stype, dtype=np.int32)
        self.tax = np.array(tax, dtype=np.int32)
        self.STREETS = np.array(self.streets_l, dtype=np.int32)
        self.STATIONS = np.array(self.stations_l, dtype=np.int32)
        self.UTILITIES = np.array(self.utilities_l, dtype=np.int32)
        self.ownable = self.price > 0


class Cards:
    """Chance / community decks as tuples ``(effect, a, b)`` + ids/labels."""

    def __init__(self, path: Path | None = None):
        path = Path(path) if path else DATA_DIR / "cards_de.json"
        raw_bytes = path.read_bytes()
        self.hash = "sha256:" + hashlib.sha256(raw_bytes).hexdigest()
        raw = json.loads(raw_bytes)
        self.decks = []  # [chance, community] each list of tuples
        self.ids = []
        self.labels = []
        self.jail_idx = []
        for name in ("chance", "community"):
            cards, ids, labels, jail = [], [], [], -1
            for ci, c in enumerate(raw[name]):
                e = c["effect"]
                if e == "jail_free_card":
                    t = (E_JAIL_FREE, 0, 0)
                    jail = ci
                elif e == "go_to_jail":
                    t = (E_GO_TO_JAIL, 0, 0)
                elif e == "move_to":
                    t = (E_MOVE_TO, c["space"], 1 if c.get("collect_go", True) else 0)
                elif e == "move_by":
                    t = (E_MOVE_BY, c["steps"], 0)
                elif e == "nearest":
                    t = (E_NEAREST, 0 if c["kind"] == "station" else 1, 0)
                elif e == "cash":
                    t = (E_CASH, c["amount"], 0)
                elif e == "cash_each_player":
                    t = (E_EACH, c["amount"], 0)
                elif e == "repairs":
                    t = (E_REPAIRS, c["house"], c["hotel"])
                else:
                    raise ValueError(f"unknown card effect {e}")
                cards.append(t)
                ids.append(c["id"])
                labels.append(c["label"])
            assert len(cards) == 16
            self.decks.append(cards)
            self.ids.append(ids)
            self.labels.append(labels)
            self.jail_idx.append(jail)


DEFAULT_BOARD = Board()
DEFAULT_CARDS = Cards()

# module-level constant arrays (default board)
PRICE = DEFAULT_BOARD.price
RENT = DEFAULT_BOARD.rent
GROUP = DEFAULT_BOARD.group
HOUSE_COST = DEFAULT_BOARD.house_cost
STREETS = DEFAULT_BOARD.STREETS
STATIONS = DEFAULT_BOARD.STATIONS
UTILITIES = DEFAULT_BOARD.UTILITIES
BOARD_HASH = DEFAULT_BOARD.hash
