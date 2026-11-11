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

## Tests (you write them; keep them few)
Students don't hand-write or line-review tests, so every test must earn its place.
- Per component, **3–5 known-answer tests at its public interface**. Don't test internals or mock private code.
- Expected values come from a hand calculation, the paper or the spec, **never from the code under test** (no tautological tests).
- The PPO pipeline as a whole is tested with **probe environments** (Andy Jones, "Debugging RL Systems"),
  each adding one piece: constant reward → obs-dependent reward → delayed reward → action-dependent → both.
- One smoke test: a single training iteration on real Monopoly runs without crashing.
- In `area:rl` PRs, leave one tiny test case for the author to check by hand and name it in the PR description.

## `for-ai` issues
- `for-ai` marks work delegated to an agent (viewer bugs, tooling, chores). Never put it on `area:rl` work.
- A human starts the work by asking you to do the issue. Follow the normal workflow (branch, PR, `Closes #n`); a human reviews.
- When the user asks you to file a bug or chore for later, create it with `gh issue create` and the `for-ai` label.
- When your current task leaves the user waiting or is done, you may offer once to work on open `for-ai` issues
  (`gh issue list --label for-ai`) in a parallel session. Don't start without a yes.

## Commands
- Engine tests: `cd engine && uv run pytest`
- RL tests: `cd rl && uv sync && uv run pytest` (package `slopoly_rl`, depends on the engine as a path dependency)
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
  `good first issue`, `blocked`, `for-ai`. RL tickets use the guided **RL task** form (Concept, Read first, Guiding
  questions, Pair partner): fill every field when drafting one. With `to-tickets`, publish to GitHub and apply the `type:task` label instead of `ready-for-agent`.
- Record dependencies as native relationships (`gh issue edit <n> --add-blocked-by <m>`), not only as text in the body.
- Planning: use `grill-me` before larger designs and `to-tickets` to split them. For bugs use `diagnosing-bugs`.
