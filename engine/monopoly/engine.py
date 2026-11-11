"""Rules engine. All game logic lives here; no rewards.

Usage (the 4 calls)::

    eng = Engine(RulesConfig())
    s = eng.reset(seed)
    mask = eng.legal_mask(s)          # np.bool_[50]
    s, events = eng.step(s, action)   # mutates and returns s
    p = eng.current_player(s)

The engine owns the RNG (dice + deck shuffles), so one Engine instance == one running game.
A game is determined by (engine_version, rules, seed, actions).  The training log stores ALL action
indices, including forced ones (steps where exactly one action was legal).
"""

from __future__ import annotations

from typing import Iterator

import numpy as np

from .actions import BUILD_BASE, N_ACTIONS_V1, SELL_BASE, ActionSpace
from .data import (
    DEFAULT_BOARD,
    DEFAULT_CARDS,
    E_CASH,
    E_EACH,
    E_GO_TO_JAIL,
    E_JAIL_FREE,
    E_MOVE_BY,
    E_MOVE_TO,
    E_NEAREST,
    E_REPAIRS,
    T_CHANCE,
    T_COMMUNITY,
    T_GOTOJAIL,
    T_STATION,
    T_STREET,
    T_TAX,
    T_UTILITY,
    Board,
    Cards,
)
from .rules import RulesConfig
from .state import (
    BUY_DECISION,
    GAME_OVER,
    O_BANKRUPT,
    O_BLD,
    O_CASH,
    O_CUR,
    O_DIE1,
    O_DIE2,
    O_DOUBLES,
    O_HOLDER,
    O_HOTELS,
    O_HOUSES,
    O_JC,
    O_JT,
    O_NP,
    O_ORDER,
    O_OWNER,
    O_PHASE,
    O_PKIND,
    O_POS,
    O_PSPACE,
    O_PTR,
    O_STEP,
    O_TURN,
    O_WINNER,
    POST_ROLL,
    PRE_ROLL,
    State,
)

_DECK_NAMES = ("chance", "community")


def compute_rent(
    board: Board, m, space: int, dice_total: int, card: bool = False
) -> int:
    """Rent due for landing on an owned `space` (owner read from state memoryview `m`).

    card=True: "nearest station/utility" card rules (station 2x rent, utility 10x dice).
    """
    t = board.type_l[space]
    o = m[O_OWNER + space]
    if t == T_STREET:
        b = m[O_BLD + space]
        rents = board.rent_l[space]
        if b:
            return rents[b]
        for sp in board.group_spaces_l[board.group_l[space]]:
            if m[O_OWNER + sp] != o:
                return rents[0]
        return 2 * rents[0]
    if t == T_STATION:
        cnt = 0
        for sp in board.stations_l:
            if m[O_OWNER + sp] == o:
                cnt += 1
        r = board.station_rent[cnt - 1]
        return 2 * r if card else r
    if t == T_UTILITY:
        cnt = 0
        for sp in board.utilities_l:
            if m[O_OWNER + sp] == o:
                cnt += 1
        mult = (
            board.utility_multiplier[-1] if card else board.utility_multiplier[cnt - 1]
        )
        return mult * dice_total
    return 0


class Engine:
    def __init__(
        self,
        rules: RulesConfig | None = None,
        board: Board | None = None,
        cards: Cards | None = None,
    ):
        self.rules = rules or RulesConfig()
        self.rules.validate_supported()
        self.board = board or DEFAULT_BOARD
        self.cards = cards or DEFAULT_CARDS
        self.actions = ActionSpace(self.rules, self.board)
        self.n_actions = self.actions.n
        assert self.n_actions == N_ACTIONS_V1
        b = self.board
        self._groups_build = []
        for g in range(8):
            spaces = tuple(b.group_spaces_l[g])
            self._groups_build.append(
                (
                    spaces,
                    tuple(b.street_k_l[sp] for sp in spaces),
                    b.house_cost_l[spaces[0]],
                )
            )
        self.rng: np.random.Generator | None = None
        self._dice: list[int] = []
        self._di = 0

    # ------------------------------------------------------------------ public API
    def reset(self, seed: int, n_players: int = 2) -> State:
        if n_players != 2:
            raise NotImplementedError("v1 supports exactly 2 players")
        self.rng = np.random.Generator(np.random.PCG64(seed))
        b = self.board
        s = State()
        m = s.m
        m[O_NP] = n_players
        m[O_PHASE] = PRE_ROLL
        m[O_HOUSES] = b.houses_total
        m[O_HOTELS] = b.hotels_total
        m[O_WINNER] = -1
        for d in (0, 1):
            m[O_HOLDER[d]] = -1
            order = self.rng.permutation(16).tolist()
            for j in range(16):
                m[O_ORDER[d] + j] = order[j]
        for i in range(n_players):
            m[O_CASH + i] = b.start_cash
        s.owner[:] = -1
        self._dice = []
        self._di = 0
        return s

    def current_player(self, s: State) -> int:
        return s.m[O_CUR]

    def is_over(self, s: State) -> bool:
        return s.m[O_PHASE] == GAME_OVER

    def legal_list(self, s: State) -> list[int]:
        """Legal action indices in ascending order (fast path; legal_mask wraps this)."""
        m = s.m
        ph = m[O_PHASE]
        if ph == GAME_OVER:
            return []
        p = m[O_CUR]
        if ph == BUY_DECISION:
            if m[O_CASH + p] >= self.board.price_l[m[O_PSPACE]]:
                return [2, 3]
            return [3]
        acts: list[int] = []
        if ph == PRE_ROLL:
            acts.append(0)
            if m[O_JT + p] > 0:
                if m[O_CASH + p] >= self.board.jail_fine:
                    acts.append(4)
                if m[O_JC + p] > 0:
                    acts.append(5)
        else:  # POST_ROLL: doubles (and not jailed) -> must roll again
            acts.append(0 if (m[O_DOUBLES] > 0 and m[O_JT + p] == 0) else 1)
        self._building_actions(m, p, acts)
        return acts

    def legal_mask(self, s: State) -> np.ndarray:
        mask = np.zeros(self.n_actions, dtype=np.bool_)
        acts = self.legal_list(s)
        if acts:
            mask[acts] = True
        return mask

    def step(self, s: State, action: int, check: bool = True):
        """Apply one action. Returns (state, events) for exactly that action (no forced follow-ups)."""
        if check:
            if s.m[O_PHASE] == GAME_OVER:
                raise ValueError("game is over")
            if action not in self.legal_list(s):
                raise ValueError(
                    f"illegal action {action} ({self.actions.action(action)}) in phase "
                    f"{s.phase} for player {s.current_player}"
                )
        return s, self._apply(s, action)

    def advance_forced(self, s: State) -> Iterator[tuple[int, list]]:
        """Yield (action, events) while exactly one action is legal (only if rules.auto_single_action)."""
        if not self.rules.auto_single_action:
            return
        while True:
            acts = self.legal_list(s)
            if len(acts) != 1:
                return
            yield acts[0], self._apply(s, acts[0])

    def step_auto(self, s: State, action: int):
        """step() then run all forced follow-up steps. Returns (state, events of all of them)."""
        s, events = self.step(s, action)
        for _a, ev in self.advance_forced(s):
            events.extend(ev)
        return s, events

    def reset_auto(self, seed: int):
        """reset() then run forced steps so the first state needs a real decision (or is over)."""
        s = self.reset(seed)
        events = []
        for _a, ev in self.advance_forced(s):
            events.extend(ev)
        return s, events

    def net_worth(self, s: State, p: int) -> int:
        b = self.board
        m = s.m
        w = m[O_CASH + p]
        for i in range(40):
            if m[O_OWNER + i] == p:
                w += b.price_l[i] + m[O_BLD + i] * b.house_cost_l[i]
        return w

    def rent_for(
        self, s: State, space: int, dice_total: int | None = None, card: bool = False
    ) -> int:
        if dice_total is None:
            dice_total = s.m[O_DIE1] + s.m[O_DIE2]
        return compute_rent(self.board, s.m, space, dice_total, card)

    def force_dice(self, pairs) -> None:
        """Test hook: next rolls come from `pairs` [(d1, d2), ...] before the RNG resumes."""
        flat = [v for pr in pairs for v in pr]
        self._dice = flat + self._dice[self._di :]
        self._di = 0

    # ------------------------------------------------------------------ internals
    def _rand_dice(self) -> tuple[int, int]:
        i = self._di
        if i + 2 > len(self._dice):
            self._dice = self.rng.integers(1, 7, size=1024).tolist()
            i = 0
        self._di = i + 2
        d = self._dice
        return d[i], d[i + 1]

    def _apply(self, s: State, a: int) -> list:
        m = s.m
        ev: list = []
        p = m[O_CUR]
        if a == 0:
            self._roll(s, ev, p)
        elif a == 1:
            self._next_turn(s, ev)
        elif a == 2:
            sp = m[O_PSPACE]
            price = self.board.price_l[sp]
            m[O_OWNER + sp] = p
            m[O_CASH + p] -= price
            m[O_PKIND] = 0
            m[O_PSPACE] = 0
            m[O_PHASE] = POST_ROLL
            ev.append({"type": "buy", "player": p, "space": sp, "price": price})
            ev.append({"type": "cash", "player": p, "delta": -price, "reason": "buy"})
        elif a == 3:
            sp = m[O_PSPACE]
            m[O_PKIND] = 0
            m[O_PSPACE] = 0
            m[O_PHASE] = POST_ROLL
            ev.append({"type": "decline", "player": p, "space": sp})
        elif a == 4:
            m[O_JT + p] = 0
            fine = self.board.jail_fine
            m[O_CASH + p] -= fine
            ev.append({"type": "jail_release", "player": p, "how": "fine"})
            ev.append(
                {"type": "cash", "player": p, "delta": -fine, "reason": "jail_fine"}
            )
        elif a == 5:
            d = 0 if m[O_HOLDER[0]] == p else 1
            m[O_JT + p] = 0
            m[O_JC + p] -= 1
            self._return_jail_card(s, d)
            ev.append({"type": "jail_release", "player": p, "how": "card"})
        elif a < SELL_BASE:
            self._build(s, ev, p, a - BUILD_BASE)
        else:
            self._sell(s, ev, p, a - SELL_BASE)
        m[O_STEP] += 1
        return ev

    # --- building -----------------------------------------------------------------
    def _building_actions(self, m, p: int, acts: list) -> None:
        cash = m[O_CASH + p]
        hl = m[O_HOUSES]
        hotl = m[O_HOTELS]
        sells = None
        for spaces, ks, cost in self._groups_build:
            for sp in spaces:
                if m[O_OWNER + sp] != p:
                    break
            else:
                bs = [m[O_BLD + sp] for sp in spaces]
                mn = min(bs)
                mx = max(bs)
                for k, bl in zip(ks, bs):
                    if (
                        bl == mn
                        and bl < 5
                        and cash >= cost
                        and (hl > 0 if bl < 4 else hotl > 0)
                    ):
                        acts.append(BUILD_BASE + k)
                    if bl == mx and bl > 0 and (bl < 5 or hl >= 4):
                        if sells is None:
                            sells = []
                        sells.append(SELL_BASE + k)
        if sells:
            acts.extend(sells)

    def _build(self, s, ev, p, k):
        m = s.m
        sp = self.board.streets_l[k]
        cost = self.board.house_cost_l[sp]
        lvl = m[O_BLD + sp]
        if lvl < 4:
            m[O_HOUSES] -= 1
        else:
            m[O_HOUSES] += 4
            m[O_HOTELS] -= 1
        m[O_BLD + sp] = lvl + 1
        m[O_CASH + p] -= cost
        ev.append(
            {"type": "build", "player": p, "space": sp, "cost": cost, "level": lvl + 1}
        )
        ev.append({"type": "cash", "player": p, "delta": -cost, "reason": "build"})

    def _sell(self, s, ev, p, k):
        m = s.m
        sp = self.board.streets_l[k]
        refund = self.board.house_cost_l[sp] // 2
        lvl = m[O_BLD + sp]
        if lvl == 5:
            m[O_HOTELS] += 1
            m[O_HOUSES] -= 4
        else:
            m[O_HOUSES] += 1
        m[O_BLD + sp] = lvl - 1
        m[O_CASH + p] += refund
        ev.append(
            {
                "type": "sell_building",
                "player": p,
                "space": sp,
                "refund": refund,
                "level": lvl - 1,
            }
        )
        ev.append(
            {"type": "cash", "player": p, "delta": refund, "reason": "sell_building"}
        )

    # --- turn flow ----------------------------------------------------------------
    def _next_turn(self, s, ev):
        m = s.m
        m[O_DOUBLES] = 0
        turn = m[O_TURN] + 1
        m[O_TURN] = turn
        if turn >= self.rules.max_rounds * m[O_NP]:
            self._game_over_limit(s, ev)
            return
        n = m[O_NP]
        q = (m[O_CUR] + 1) % n
        while m[O_BANKRUPT + q]:
            q = (q + 1) % n
        m[O_CUR] = q
        m[O_PHASE] = PRE_ROLL
        ev.append({"type": "turn_start", "player": q, "turn": turn})

    def _game_over_limit(self, s, ev):
        m = s.m
        n = m[O_NP]
        nw = [self.net_worth(s, i) for i in range(n)]
        best = max(nw)
        winners = [i for i in range(n) if nw[i] == best]
        w = winners[0] if len(winners) == 1 else -2
        m[O_WINNER] = w
        m[O_PHASE] = GAME_OVER
        ev.append(
            {"type": "game_over", "winner": w, "reason": "turn_limit", "net_worth": nw}
        )

    def _roll(self, s, ev, p):
        m = s.m
        d1, d2 = self._rand_dice()
        m[O_DIE1] = d1
        m[O_DIE2] = d2
        dbl = d1 == d2
        tot = d1 + d2
        ev.append({"type": "dice", "player": p, "d1": d1, "d2": d2, "doubles": dbl})
        m[O_PHASE] = POST_ROLL
        jt = m[O_JT + p]
        if jt > 0:
            if dbl:
                m[O_JT + p] = 0
                m[O_DOUBLES] = 0
                ev.append({"type": "jail_release", "player": p, "how": "doubles"})
                self._move_by(s, ev, p, tot, tot)
            elif jt >= self.board.max_jail_turns:
                if self._pay(s, ev, p, self.board.jail_fine, -1, "jail_fine"):
                    m[O_JT + p] = 0
                    ev.append(
                        {"type": "jail_release", "player": p, "how": "forced_fine"}
                    )
                    self._move_by(s, ev, p, tot, tot)
            else:
                m[O_JT + p] = jt + 1
            return
        if dbl:
            nd = m[O_DOUBLES] + 1
            if nd >= 3:
                m[O_DOUBLES] = 0
                self._send_to_jail(s, ev, p, "three_doubles")
                return
            m[O_DOUBLES] = nd
        else:
            m[O_DOUBLES] = 0
        self._move_by(s, ev, p, tot, tot)

    # --- movement -----------------------------------------------------------------
    def _move_by(self, s, ev, p, steps, dice_total):
        old = s.m[O_POS + p]
        raw = old + steps
        self._move(s, ev, p, old, raw % 40, steps > 0 and raw >= 40, dice_total, 0)

    def _move(self, s, ev, p, old, dest, passed, dice_total, card_mode):
        m = s.m
        m[O_POS + p] = dest
        ev.append(
            {"type": "move", "player": p, "from": old, "to": dest, "passed_go": passed}
        )
        if passed:
            sal = self.board.go_salary
            m[O_CASH + p] += sal
            ev.append({"type": "salary", "player": p, "amount": sal})
            ev.append({"type": "cash", "player": p, "delta": sal, "reason": "salary"})
        self._land(s, ev, p, dest, dice_total, card_mode)

    def _send_to_jail(self, s, ev, p, reason):
        m = s.m
        old = m[O_POS + p]
        js = self.board.jail_space
        m[O_POS + p] = js
        m[O_JT + p] = 1
        m[O_DOUBLES] = 0
        ev.append(
            {"type": "move", "player": p, "from": old, "to": js, "passed_go": False}
        )
        ev.append({"type": "jail", "player": p, "reason": reason})
        m[O_PHASE] = POST_ROLL

    def _land(self, s, ev, p, sp, dice_total, card_mode):
        """Resolve landing. card_mode: 0 normal, 1 'nearest' card (2x station / 10x fresh dice)."""
        m = s.m
        b = self.board
        t = b.type_l[sp]
        if t == T_STREET or t == T_STATION or t == T_UTILITY:
            o = m[O_OWNER + sp]
            if o == -1:
                m[O_PKIND] = 1
                m[O_PSPACE] = sp
                m[O_PHASE] = BUY_DECISION
            elif o != p:
                if card_mode and t == T_UTILITY:
                    d1, d2 = self._rand_dice()
                    m[O_DIE1] = d1
                    m[O_DIE2] = d2
                    dice_total = d1 + d2
                    ev.append(
                        {
                            "type": "dice",
                            "player": p,
                            "d1": d1,
                            "d2": d2,
                            "doubles": d1 == d2,
                            "reason": "utility_card",
                        }
                    )
                rent = compute_rent(b, m, sp, dice_total, bool(card_mode))
                ev.append(
                    {"type": "rent", "player": p, "to": o, "space": sp, "amount": rent}
                )
                self._pay(s, ev, p, rent, o, "rent")
        elif t == T_TAX:
            amt = b.tax_l[sp]
            ev.append({"type": "tax", "player": p, "space": sp, "amount": amt})
            self._pay(s, ev, p, amt, -1, "tax")
        elif t == T_GOTOJAIL:
            self._send_to_jail(s, ev, p, "go_to_jail")
        elif t == T_CHANCE:
            self._draw(s, ev, p, 0)
        elif t == T_COMMUNITY:
            self._draw(s, ev, p, 1)

    # --- money --------------------------------------------------------------------
    def _pay(self, s, ev, p, amount, to, reason) -> bool:
        """p pays `amount` to seat `to` (-1 = bank). Bankrupt (immediate) if cash < amount."""
        m = s.m
        if amount <= 0:
            return True
        if m[O_CASH + p] < amount:
            self._bankrupt(s, ev, p, to, amount)
            return False
        m[O_CASH + p] -= amount
        ev.append({"type": "cash", "player": p, "delta": -amount, "reason": reason})
        if to >= 0:
            m[O_CASH + to] += amount
            ev.append({"type": "cash", "player": to, "delta": amount, "reason": reason})
        return True

    def _bankrupt(self, s, ev, p, creditor, owed):
        m = s.m
        m[O_BANKRUPT + p] = 1
        m[O_JT + p] = 0
        for i in range(40):
            if m[O_OWNER + i] == p:
                m[O_OWNER + i] = -1
                bl = m[O_BLD + i]
                if bl == 5:
                    m[O_HOTELS] += 1
                elif bl:
                    m[O_HOUSES] += bl
                m[O_BLD + i] = 0
        for d in (0, 1):
            if m[O_HOLDER[d]] == p:
                self._return_jail_card(s, d)
        m[O_JC + p] = 0
        ev.append(
            {
                "type": "bankrupt",
                "player": p,
                "creditor": creditor if creditor >= 0 else None,
                "owed": owed,
            }
        )
        n = m[O_NP]
        alive = [i for i in range(n) if not m[O_BANKRUPT + i]]
        if len(alive) == 1:
            m[O_WINNER] = alive[0]
            m[O_PHASE] = GAME_OVER
            ev.append(
                {
                    "type": "game_over",
                    "winner": alive[0],
                    "reason": "bankruptcy",
                    "net_worth": [
                        self.net_worth(s, i) if not m[O_BANKRUPT + i] else 0
                        for i in range(n)
                    ],
                }
            )
        elif p == m[O_CUR]:
            self._next_turn(s, ev)

    # --- cards --------------------------------------------------------------------
    def _draw(self, s, ev, p, d):
        m = s.m
        base = O_ORDER[d]
        ptr = m[O_PTR[d]]
        if ptr >= 16 or m[base + ptr] < 0:
            self._reshuffle(s, d)
            ptr = 0
        c = m[base + ptr]
        m[O_PTR[d]] = ptr + 1
        eff, a, bb = self.cards.decks[d][c]
        ev.append(
            {
                "type": "card",
                "player": p,
                "deck": _DECK_NAMES[d],
                "id": self.cards.ids[d][c],
                "label": self.cards.labels[d][c],
            }
        )
        if eff == E_JAIL_FREE:
            m[O_HOLDER[d]] = p
            m[O_JC + p] += 1
        elif eff == E_GO_TO_JAIL:
            self._send_to_jail(s, ev, p, "card")
        elif eff == E_MOVE_TO:
            old = m[O_POS + p]
            self._move(s, ev, p, old, a, bool(bb) and a < old, m[O_DIE1] + m[O_DIE2], 0)
        elif eff == E_MOVE_BY:
            self._move_by(s, ev, p, a, m[O_DIE1] + m[O_DIE2])
        elif eff == E_NEAREST:
            old = m[O_POS + p]
            lst = self.board.utilities_l if a == 1 else self.board.stations_l
            dest = next((x for x in lst if x > old), lst[0])
            self._move(s, ev, p, old, dest, dest < old, m[O_DIE1] + m[O_DIE2], 1)
        elif eff == E_CASH:
            if a >= 0:
                m[O_CASH + p] += a
                ev.append({"type": "cash", "player": p, "delta": a, "reason": "card"})
            else:
                self._pay(s, ev, p, -a, -1, "card")
        elif eff == E_EACH:
            n = m[O_NP]
            for q in range(n):
                if q == p or m[O_BANKRUPT + q] or m[O_PHASE] == GAME_OVER:
                    continue
                if a >= 0:
                    self._pay(s, ev, q, a, p, "card")
                else:
                    if not self._pay(s, ev, p, -a, q, "card"):
                        break
        elif eff == E_REPAIRS:
            nh = nhot = 0
            for i in range(40):
                if m[O_OWNER + i] == p:
                    bl = m[O_BLD + i]
                    if bl == 5:
                        nhot += 1
                    else:
                        nh += bl
            self._pay(s, ev, p, nh * a + nhot * bb, -1, "card")

    def _reshuffle(self, s, d):
        m = s.m
        held = m[O_HOLDER[d]] != -1
        jail = self.cards.jail_idx[d]
        cards = [c for c in range(16) if not (held and c == jail)]
        order = self.rng.permutation(len(cards)).tolist()
        base = O_ORDER[d]
        for j in range(16):
            m[base + j] = cards[order[j]] if j < len(cards) else -1
        m[O_PTR[d]] = 0

    def _return_jail_card(self, s, d):
        """Jail-free card goes back to the bottom of its deck."""
        m = s.m
        base = O_ORDER[d]
        ptr = m[O_PTR[d]]
        rem = []
        i = ptr
        while i < 16 and m[base + i] >= 0:
            rem.append(m[base + i])
            i += 1
        rem.append(self.cards.jail_idx[d])
        for j in range(16):
            m[base + j] = rem[j] if j < len(rem) else -1
        m[O_PTR[d]] = 0
        m[O_HOLDER[d]] = -1
