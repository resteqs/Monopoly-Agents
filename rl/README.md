# rl/ (learning zone)

The team writes this part: PPO, networks, reward functions, observation encoders, self-play.
AI agents act as tutors here (see [AGENTS.md](../AGENTS.md)).

Starting points:
- Engine API: `reset`, `legal_mask`, `step`, `current_player` ([engine/README.md](../engine/README.md))
- Starter observation: `monopoly.encode.encode_baseline` ([docs/game_state.md §5](../docs/game_state.md))
- One config per experiment, saved with the run. Set seeds for torch, NumPy and the engine.
- Log to W&B (#1) and save checkpoints as artifacts, never to Git.
