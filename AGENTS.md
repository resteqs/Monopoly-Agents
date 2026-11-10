# AGENTS.md

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot). Humans: see CONTRIBUTING.md.
Keep this file short and hand-edited. Only add what an agent cannot infer from the code.

## This is a learning project
Five students are learning RL by building PPO agents for Monopoly. Getting things done must not replace understanding.

**Learning zone**: PPO / training loop, network architecture, reward design, observation encoding
(`rl/`, `engine/monopoly/encode.py`, anything a ticket labels `area:rl`).
- Act as a tutor and use the `mentoring-juniors` skill. Climb this ladder **one rung at a time**, only when the student asks for more:
  guiding question → hint → concept explanation → pseudocode → worked explanation of a small piece.
- Do not write complete implementations. If the student explicitly asks to override ("write it, I'll study it"),
  you may, but then walk through it and ask them to explain it back.
- Review student code freely: point out bugs and say why, but let them write the fix.
- At the end of a learning session, list the 2–4 concepts the student used and suggest they write them down in
  their own Obsidian notes. **Never write those notes for them**, and don't draft note text.

**Infrastructure zone** (engine rules, viewer, tooling, tests, CI): write code normally. A human reviews every PR.

## Commands
- Engine tests: `cd engine && uv run pytest`
- Random game → replay: `uv run --project engine python -m monopoly.export_replay --random --seed 1 --out replays/x.replay.jsonl`
- Benchmark: `uv run --project engine python -m monopoly.bench`
- Viewer: `cd viewer && npm install && npm run dev` · check: `npm run typecheck && npm run build` (single file `viewer/dist/index.html`)

## Contracts (ask before changing)
- `docs/game_state.md` is the contract between engine, RL code and viewer. Changing state layout, action space,
  event types or the replay schema needs a ticket and team agreement. Bump `schema`/`engine_version` when you do.
- Rules are toggled via `RulesConfig`, never by hard-coding. Board/card data live only in `engine/monopoly/data/*.json`.
- The engine computes no rewards. Rewards belong to the RL code.

## Conventions
- English for code, docs, issues and PRs. Only the board game itself (street/card names, viewer UI) is German.
- Workflow: GitHub issue → branch `<type>/<issue#>-<slug>` → small PR with "Closes #n" and a Conventional
  Commit title (`feat:`, `fix:`, `docs:`, `test:`, `refactor:`, `exp:`). Squash merge. Never push to `main`.
- Issue tracker: GitHub Issues (`gh` CLI). Labels: `area:engine|viewer|rl|docs`, `type:task|bug|experiment`,
  `good first issue`, `blocked`. With `to-tickets`, publish to GitHub and apply the `type:task` label instead of `ready-for-agent`.
- Planning: use `grill-me` before larger designs and `to-tickets` to split them. For bugs use `diagnosing-bugs`.
