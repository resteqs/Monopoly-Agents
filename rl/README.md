# rl/ (learning zone)

The team writes this part: PPO, networks, reward functions, observation encoders, self-play.
AI agents act as tutors here (see [AGENTS.md](../AGENTS.md)).

Starting points:
- Engine API: `reset`, `legal_mask`, `step`, `current_player` ([engine/README.md](../engine/README.md))
- Starter observation: `monopoly.encode.encode_baseline` ([docs/game_state.md §5](../docs/game_state.md))
- One config per experiment, saved with the run. Set seeds for torch, NumPy and the engine.
- Log to W&B (#1) and save checkpoints as artifacts, never to Git.

## Setup
```bash
cd rl && uv sync && uv run pytest
```
`uv sync` installs the engine (`../engine`, editable, so engine changes show up without reinstalling), NumPy,
`torch==2.15.0` and `wandb`. On Linux/Windows torch comes from the PyTorch CPU index (no CUDA download);
on macOS it is the normal PyPI wheel (CPU + MPS).

## Module map
Package `slopoly_rl/`: one module per component, so owners don't edit the same files. Section names refer to
[docs/rl_interfaces.md](../docs/rl_interfaces.md) (#17).

| Module | Ticket | Interface section |
|---|---|---|
| `collector.py` | #18 | Learner transition, Rollout batch |
| `network.py` | #19 | Policy |
| `reward.py` | #20 | Reward |
| `gae.py` | #20 | Reward, Rollout batch |
| `ppo.py` | #21 | Rollout batch, Policy |
| `evaluation.py` | #22 | Player |
| `probes.py` | #23 | Learner transition |
| `config.py` | #17 | Config |
| `stubs.py` | #17 | stand-ins for every interface, for testing one component in isolation |

Tests go in `tests/` (`test_<module>.py`). W&B: team `slopoly`, project `slopoly-rl`.
