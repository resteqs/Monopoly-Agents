# Game State, Actions & Replay Format (v1)

This document is the **contract** between the game engine (`engine/`), the RL code (yours),
and the replay viewer (`viewer/`). If you change it, bump the version numbers mentioned below.

## 1. Three layers of "state"

| Layer | What | Consumer | Changes when… |
|---|---|---|---|
| **Engine state** (§2) | Complete truth incl. hidden info (deck order). Fixed-layout `int32` buffer. | Rules engine | Rules change (rare, versioned) |
| **Observation** (§5) | `encode(state, me) -> float32[D]`: what one agent sees, ego-centric, hidden info removed | PPO network | You experiment with features (often) |
| **Replay record** (§6) | Human-readable JSON Lines log | Viewer | Almost never |

Replays are derived from the **engine state**, never from observations, so changing the
encoder never breaks old replays.

## 2. Engine state

The engine state is one flat `np.int32` buffer (`state.buf`) with a fixed layout. The `State` class
exposes named NumPy **views** into it (`s.cash[p]`, `s.owner[i]`, …), so code is readable while
`copy()` is a single memcpy and a batch of games is just `np.stack([s.buf for s in states])`
(shape `[n_envs, STATE_LEN]`), ready for vectorisation or `torch.from_numpy`.

Player slots are always `MAX_PLAYERS = 4`; unused slots are zero and `n_players` says how many are live.
Fields for rules that are switched off in v1 (mortgages, Free-Parking pot, pending auction/trade) exist
from day one and stay `0`, so enabling those rules later doesn't change the layout.

| Field | Shape | Meaning |
|---|---|---|
| `n_players` | 1 | 2 in v1 |
| `current_player` | 1 | seat index whose decision it is |
| `phase` | 1 | see §3 |
| `turn` | 1 | number of completed player turns (game is truncated after `rules.max_rounds` rounds = `max_rounds × n_players` turns) |
| `step` | 1 | number of decisions taken so far |
| `doubles` | 1 | consecutive doubles rolled in the current turn (3 → jail) |
| `die1`, `die2` | 1 each | last roll (0 before the first roll) |
| `houses_left`, `hotels_left` | 1 each | bank supply (32 / 12 at start) |
| `pot` | 1 | Free-Parking pot (only if `rules.free_parking_cash`) |
| `pending_kind`, `pending_space` | 1 each | pending buy decision / future auction or trade (`0` = none, `1` = buy offer) |
| `winner` | 1 | `-1` while running; seat index; `-2` = draw |
| `chance_ptr`, `community_ptr` | 1 each | index of the next card to draw |
| `chance_jail_card_holder`, `community_jail_card_holder` | 1 each | seat that holds the deck's "get out of jail free" card, `-1` = in deck |
| `cash` | 4 | cash per seat |
| `position` | 4 | board index 0–39 |
| `jail_turns` | 4 | `0` = not in jail, `1..3` = turn number in jail |
| `jail_cards` | 4 | number of jail-free cards held |
| `bankrupt` | 4 | 0/1 |
| `owner` | 40 | seat index, `-1` = bank (also `-1` for non-ownable spaces) |
| `buildings` | 40 | `0..4` houses, `5` = hotel |
| `mortgaged` | 40 | 0/1 (always 0 in v1) |
| `chance_order`, `community_order` | 16 each | permutation of card indices (hidden information) |

Static data (names, prices, rents, colour groups, cards) is **not** part of the state. It lives in
`engine/monopoly/data/board_de.json` and `cards_de.json`, which are read by both the engine and the viewer.

Randomness comes from a `numpy.random.Generator(PCG64(seed))` owned by the engine, so a game is
fully determined by `(engine_version, rules, seed, actions)`.

## 3. Turn structure (phases)

One turn is a **sequence of decisions**. Rolling is an explicit action because it means "I'm done
managing, roll now".

```
PRE_ROLL ──ROLL──► (move, resolve space: rent/tax/cards/jail happen automatically as events)
   ▲                 │
   │                 ├─ landed on unowned property ──► BUY_DECISION ──BUY / DECLINE_BUY──┐
   │                 ▼                                                                    │
   │              POST_ROLL ◄───────────────────────────────────────────────────────────┘
   │                 │  rolled doubles (and not jailed): only ROLL (+ build/sell) is legal, END_TURN is not
   └── next player ◄─┴─ END_TURN
```

| Phase | id | Legal actions |
|---|---|---|
| `PRE_ROLL` | 0 | `ROLL`, `BUILD(k)`, `SELL_BUILDING(k)`; in jail also `PAY_JAIL_FINE`, `USE_JAIL_CARD` |
| `BUY_DECISION` | 1 | `BUY` (if cash ≥ price), `DECLINE_BUY` |
| `POST_ROLL` | 2 | `END_TURN` (or `ROLL` again after doubles), `BUILD(k)`, `SELL_BUILDING(k)` |
| `GAME_OVER` | 3 | none |

- **Jail:** `ROLL` while in jail = try for doubles. Doubles → leave and move by the roll (no extra roll).
  Third failed attempt → pay the fine automatically and move. Rent is still collected while in jail.
- **Forced steps:** with `rules.auto_single_action = True`, whenever exactly one action is legal the engine
  takes it itself (the replay still records it, flagged `"forced": true`). Agents are only asked when there is a real choice.

## 4. Actions

Actions are identified by **name + argument**, e.g. `{"type": "BUILD", "space": 39}`. The integer
index used by the network is generated from the rules config (`ActionSpace(rules)`), so adding trades or
auctions later just adds entries. Replays always store the named form.

v1 action space (50 discrete actions):

| Index | Action | Argument |
|---|---|---|
| 0 | `ROLL` | – |
| 1 | `END_TURN` | – |
| 2 | `BUY` | (the pending space) |
| 3 | `DECLINE_BUY` | – |
| 4 | `PAY_JAIL_FINE` | – |
| 5 | `USE_JAIL_CARD` | – |
| 6–27 | `BUILD` | street k = 0..21 (board order: 1, 3, 6, 8, 9, 11, …, 39) |
| 28–49 | `SELL_BUILDING` | street k (half the house cost is refunded) |

`legal_mask(state) -> np.bool_[50]`. Building follows the official rules: own the whole colour group, build evenly,
the bank must have supply, and a hotel replaces 4 houses (returning them to the bank).

## 5. Observation (baseline; the team owns this)

`encode_baseline(state, me, groups=("core", "bank")) -> np.float32[D]` is a *starter* encoder so the
pipeline runs end-to-end. Ego-centric: seat `me` is always written first, so one policy can play any seat.

- `core`: own/opponent position (one-hot 40 each), ownership per space (me / opponent / bank), building
  level / 5, cash / 1500 (clipped), jail turns, jail cards, doubles, phase one-hot, turn / (max_rounds × n_players)
- `bank`: houses_left / 32, hotels_left / 12
- `exposure` (optional): rent I would pay on each space; expected rent of my next roll

Hidden information (deck order, the RNG) is never encoded.

## 6. Replay format

### 6.1 Viewer format — `*.replay.jsonl` (JSON Lines, one object per line)

Line 1 is the header:
```json
{"type": "header", "schema": "monopoly-replay/1", "engine_version": "0.1.0",
 "board": "board_de", "board_hash": "sha256:…", "seed": 42,
 "rules": {"max_rounds": 200, "bankruptcy": "immediate", "mortgages": false, "auctions": false,
           "trading": "off", "free_parking_cash": false, "auto_single_action": true},
 "players": [{"name": "Random A", "kind": "random"}, {"name": "Random B", "kind": "random"}]}
```
Every further line is one step: the decision taken, the events it caused, and the full state after it.
Step `t = 0` has `action: null` and the initial state.
```json
{"type": "step", "t": 17, "player": 0, "action": {"type": "ROLL"}, "forced": false,
 "events": [
   {"type": "dice", "player": 0, "d1": 4, "d2": 3, "doubles": false},
   {"type": "move", "player": 0, "from": 32, "to": 39, "passed_go": false},
   {"type": "rent", "player": 0, "to": 1, "space": 39, "amount": 50},
   {"type": "cash", "player": 0, "delta": -50, "reason": "rent"},
   {"type": "cash", "player": 1, "delta": 50, "reason": "rent"}],
 "state": {"turn": 8, "phase": "POST_ROLL", "current_player": 0, "dice": [4, 3], "doubles": 0,
           "players": [{"cash": 1210, "position": 39, "jail_turns": 0, "jail_cards": 0, "bankrupt": false},
                       {"cash": 1390, "position": 12, "jail_turns": 0, "jail_cards": 0, "bankrupt": false}],
           "owner": [-1, 0, …], "buildings": [0, …], "mortgaged": [0, …],
           "houses_left": 32, "hotels_left": 12, "pot": 0, "winner": -1},
 "agent": null}
```
`agent` is optional, for later: `{"probs": {...}, "value": 0.12, "mask": [...]}`, so you can see what the policy was thinking.

Event types (v1): `turn_start`, `dice`, `move`, `salary`, `buy`, `decline`, `rent`, `tax`, `card`,
`jail` (`reason`: `three_doubles` | `go_to_jail` | `card`), `jail_release` (`how`: `doubles` | `fine` | `card` | `forced_fine`),
`build`, `sell_building`, `cash` (every cash change, with `reason`), `bankrupt`, `game_over`
(`winner`, `reason`: `bankruptcy` | `turn_limit`, `net_worth`). **Viewers must render unknown event
types as plain text**, so newer engines don't break older viewers.

The deck order is not written to replays (no spoilers); `card` events say which card was drawn.

### 6.2 Training log — `*.games.jsonl` (compact)

Logging every training game in full would be too big, so training writes one line per game:
`{"engine_version", "rules", "seed", "actions": [int, …]}` (~1 KB). `python -m monopoly.export_replay`
re-simulates chosen games into the viewer format. These logs only replay correctly on the same
`engine_version` + `rules`, so export the games you care about; the viewer format is the permanent archive.

## 7. Net worth & end of game

- Bankruptcy (v1 `"immediate"`): if a player owes more than their cash, they lose at once; their properties and
  buildings return to the bank. With 2 players the other player wins.
- Turn limit: after `max_rounds` completed rounds (every player had `max_rounds` turns) the game is truncated; the winner is the player with the highest
  net worth = cash + purchase price of owned properties + build cost of buildings. Equal = draw (`winner = -2`).

## 8. Engine notes (clarifications made by the reference engine 0.1.0)

- **Doubles:** after a doubles roll the phase stays `POST_ROLL` (the §3 table, not the diagram's "back to PRE_ROLL");
  `ROLL` is legal and `END_TURN` is not while `doubles > 0` and the player is not in jail (official: you must roll again).
  Leaving jail by doubles gives no extra roll (`doubles` stays 0); being sent to jail ends the turn.
- **Buy offers:** `BUY_DECISION` is always entered on an unowned property; if cash < price only `DECLINE_BUY` is legal
  (a forced step). Declined property stays with the bank.
- **Jail:** `jail_turns` goes 1 -> 2 -> 3 on failed rolls; a failed roll on turn 3 pays the fine (`jail_release`
  `forced_fine`) and moves. `PAY_JAIL_FINE` is legal only with cash >= 50 (`ROLL` is always legal). Sending a player to jail emits a
  `move` event to space 10 followed by `jail`. Building/selling is allowed while in jail.
- **Selling:** refund = floor(house_cost / 2) (hotel also refunds half a house cost). A hotel may only be sold if the
  bank has >= 4 houses (it is replaced by 4 houses); otherwise the action is illegal. Selling is even (highest street first).
- **Cards:** "nearest station/utility" and `move_to` pay the Los salary when the move wraps past Los
  (destination < current position). `move_back 3` never pays salary. A utility card on an owned utility rolls fresh dice
  (a `dice` event with `"reason": "utility_card"`; `state.dice` is updated; no extra roll even if doubles).
  Decks: drawn cards go to a discard; when the deck is empty it is reshuffled with the engine RNG excluding a held
  jail-free card; a used jail-free card goes to the bottom of the (remaining) deck. Drawing a jail-free card emits `card` only.
- **Bankruptcy:** the bankrupt player's remaining cash is *not* transferred to the creditor; properties/buildings/jail
  cards return to the bank. `bankrupt` event carries `creditor` (seat or `null`) and `owed`. A `rent` event is still emitted for the unpayable rent.
  Collect-from-each-player cards bankrupt a player who cannot pay.
- **Turns:** `turn` increments on every `END_TURN` (i.e. per player-turn; the limit is `max_rounds × n_players`); `turn_start` event
  `{player, turn}` is emitted when the next player starts. `game_over` always carries `net_worth` per seat.
- **Action log:** training logs (§6.2) store *all* action indices including forced ones; the exporter marks a step `forced`
  when exactly one action was legal and `auto_single_action` is on.
