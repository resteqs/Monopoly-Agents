"""Baseline observation encoder (a *starter*; the team owns the real one).

Ego-centric: seat `me` is first, the opponent (2-player v1) second.  Hidden information (deck order, RNG)
is never encoded.  Group layout (concatenated in this order):

core (252 floats)
    own position one-hot (40) | opp position one-hot (40)
    ownership per space [me, opp, bank] (40*3; non-ownable spaces are all zero)
    building level / 5 per space (40)
    cash me, cash opp: cash/1500 clipped to [0, 3]  (2)
    jail_turns/3 me, opp (2) | jail cards me, opp (2) | doubles/3 (1)
    phase one-hot (4) | turn / (max_rounds * 2) (1)
bank (2)
    houses_left/32, hotels_left/12
exposure (41, optional)
    rent I would pay if I stood on each space (40, /2000, 0 if not owned by opponent)
    expected rent of my next roll (1, /2000; ignores cards and doubles)
"""

from __future__ import annotations

import numpy as np

from .data import DEFAULT_BOARD
from .engine import compute_rent
from .state import (
    O_BLD,
    O_CASH,
    O_DOUBLES,
    O_HOTELS,
    O_HOUSES,
    O_JC,
    O_JT,
    O_OWNER,
    O_PHASE,
    O_POS,
    O_TURN,
    State,
)

_B = DEFAULT_BOARD
_OWNABLE = _B.ownable
_P2 = np.array(
    [
        0,
        1 / 36,
        2 / 36,
        3 / 36,
        4 / 36,
        5 / 36,
        6 / 36,
        5 / 36,
        4 / 36,
        3 / 36,
        2 / 36,
        1 / 36,
    ]
)


def encode_baseline(
    s: State, me: int, groups=("core", "bank"), max_rounds: int = 200
) -> np.ndarray:
    opp = (me + 1) % int(s.buf[0])
    parts = []
    if "core" in groups:
        pos = np.zeros(80, dtype=np.float32)
        pos[s.position[me]] = 1
        pos[40 + s.position[opp]] = 1
        own = np.zeros((40, 3), dtype=np.float32)
        o = s.owner
        own[:, 0] = o == me
        own[:, 1] = o == opp
        own[:, 2] = (o == -1) & _OWNABLE
        scal = np.zeros(14, dtype=np.float32)
        scal[0] = min(max(s.cash[me] / 1500, 0), 3)
        scal[1] = min(max(s.cash[opp] / 1500, 0), 3)
        scal[2] = s.jail_turns[me] / 3
        scal[3] = s.jail_turns[opp] / 3
        scal[4] = s.jail_cards[me]
        scal[5] = s.jail_cards[opp]
        scal[6] = s.doubles / 3
        scal[7 + s.phase] = 1
        scal[11] = s.turn / (2 * max_rounds)
        parts += [pos, own.ravel(), (s.buildings / 5).astype(np.float32), scal[:12]]
    if "bank" in groups:
        parts.append(
            np.array(
                [s.houses_left / _B.houses_total, s.hotels_left / _B.hotels_total],
                dtype=np.float32,
            )
        )
    if "exposure" in groups:
        m = s.m
        ex = np.zeros(41, dtype=np.float32)
        for sp in range(40):
            if _OWNABLE[sp] and m[O_OWNER + sp] == opp:
                ex[sp] = compute_rent(_B, m, sp, 7) / 2000
        p0 = m[O_POS + me]
        tot = 0.0
        for k in range(2, 13):
            sp = (p0 + k) % 40
            if _OWNABLE[sp] and m[O_OWNER + sp] == opp:
                tot += _P2[k - 1] * compute_rent(_B, m, sp, k)
        ex[40] = tot / 2000
        parts.append(ex)
    return np.concatenate(parts) if parts else np.zeros(0, dtype=np.float32)
