# monopoly engine (v1, reference implementation)

Simplified 2-player German-edition Monopoly. Contract: [`../docs/game_state.md`](../docs/game_state.md).
Pure Python + NumPy; one game = one `Engine` (it owns the RNG) + one `State` (flat `int32` buffer).

## Setup / tests

```bash
cd engine
uv sync
uv run pytest
```

## CLIs (run from the repo root; paths are relative to the cwd)

```bash
uv run --project engine python -m monopoly.random_play --games 20 --seed 100 --out replays/random.games.jsonl
uv run --project engine python -m monopoly.export_replay replays/random.games.jsonl --index 0 --out replays/demo.replay.jsonl
uv run --project engine python -m monopoly.export_replay --random --seed 3 --policy sensible-random --out replays/demo.replay.jsonl
uv run --project engine python -m monopoly.bench --games 1000
```

`--policy sensible-random` is a UI test-data generator (weighted random), not an agent.
Training logs (`*.games.jsonl`) store **all** action indices (forced steps included): replaying
`seed + actions` through `Engine.step` reproduces the game exactly. The exporter flags forced steps.
Logs only replay on the same `engine_version` + rules.

## API

```python
from monopoly import Engine, RulesConfig

eng = Engine(RulesConfig())
s = eng.reset(seed=42)  # State
mask = eng.legal_mask(s)  # np.bool_[50]
s, events = eng.step(
    s, int(np.flatnonzero(mask)[0])
)  # mutates + returns s; events = list of dicts
p = eng.current_player(s)  # seat to act; eng.is_over(s) / s.winner when finished
```

* `eng.legal_list(s)` is the fast list-of-ints version of `legal_mask`.
* Forced steps (only one legal action): `for a, ev in eng.advance_forced(s): ...`, or `eng.step_auto(s, a)` /
  `eng.reset_auto(seed)` to always land on a state that needs a real decision.
* No rewards in the engine; derive them from `s.winner`, `eng.net_worth(s, p)`, events.
* `monopoly.encode.encode_baseline(s, me, groups=("core","bank","exposure"))` -> `float32[D]` ego-centric starter observation.
* `State` views: `s.cash[p]`, `s.owner[i]`, `s.phase` ... `s.copy()` is one memcpy. `s.to_replay_dict()` is the viewer state.

### Batching with torch

```python
import numpy as np, torch

obs = np.stack(
    [encode_baseline(s, eng.current_player(s)) for s, eng in zip(states, engines)]
)
masks = np.stack([eng.legal_mask(s) for s, eng in zip(states, engines)])
obs_t, mask_t = torch.from_numpy(obs), torch.from_numpy(masks)  # zero-copy
logits = logits.masked_fill(~mask_t, -1e9)
bufs = torch.from_numpy(
    np.stack([s.buf for s in states])
)  # raw engine states, [n_envs, STATE_LEN]
```
Keep one `Engine` per environment (the RNG lives in the engine).
