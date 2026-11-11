# Contributing

How we (5 students) work together. AI-agent rules live in [AGENTS.md](AGENTS.md).

## Setup
```bash
cd engine && uv sync && uv run pytest     # Python engine
cd viewer && npm install && npm run dev   # replay viewer
```
Agent skills (`mentoring-juniors`, `grill-me`, `grilling`, `to-tickets`, `diagnosing-bugs`) are committed in
`.agents/skills/` (pinned in `skills-lock.json`). To update them: `npx skills update`.

## Workflow
Based on [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow), a
[Kanban](https://kanbanguides.org/) board and 2-week sprints.

1. **Every piece of work starts as an issue** (forms: RL task, Infrastructure task, Bug, Experiment). A good issue is
   [INVEST](https://en.wikipedia.org/wiki/INVEST_(mnemonic)): small (≤ 1–3 days), independent, with testable acceptance criteria.
2. **Board** (GitHub Projects): Todo → In progress → In review → Done. **At most 2 items in progress per person.**
   Assign yourself before starting.
3. **Branch** from `main`: `<type>/<issue#>-<slug>`, e.g. `feat/42-mortgage-rules`. Keep it short-lived (merge within days).
4. **Pull request**: small and focused, title in [Conventional Commits](https://www.conventionalcommits.org/) form
   (`feat: add mortgages`), body says `Closes #42`.
5. **Review**: `main` is protected. Every PR needs **1 approval from someone other than the author**, and new pushes
   dismiss old approvals. Review within 24 h. Approve when the PR improves the code overall
   ([Google review guide](https://google.github.io/eng-practices/review/)), not only when it's perfect.
6. **Learning gate**: as the author you must be able to explain every line of your PR, including the AI-written parts.
   Reviewers may ask "why does this work?" in the review.
7. **Squash merge**, delete the branch. CI (`pr-title`, `engine`, `viewer`) must be green.

## Commit / PR title convention
We use [Conventional Commits](https://www.conventionalcommits.org/) (derived from the Angular convention):
`<type>(<optional scope>): <imperative summary>`, e.g. `feat(engine): add mortgages`, `fix(viewer): token offset on corners`.
Types: `feat` `fix` `docs` `test` `refactor` `perf` `build` `ci` `chore` `exp` (experiment code/configs).
Because we squash-merge, **the PR title becomes the commit on `main`**. CI checks the title, so commits inside
your branch can be informal.

## Tickets
- **RL task** (`area:rl`, the learning zone): guided. Goal, the concept you'll understand afterwards, what to read
  first (exact sections), guiding questions, suggested steps, the interface it touches, and a **pair partner** (the
  owner of the connected component, who also reviews your PR).
- **Infrastructure task** (engine, viewer, tooling, docs): Goal, training impact, contract impact, done when.
- **Bug** and **Experiment** as before.

## Delegating to AI (`for-ai`)
Found a viewer bug or a chore you don't want to do yourself? File it (Bug or Infrastructure form, or ask Claude to
file it) and add the `for-ai` label. Anyone with Claude can pick it up by telling Claude to do the issue; the PR still
needs a human review. `for-ai` issues live in the backlog, never take a sprint slot and don't count towards the
2-in-progress limit. Never use `for-ai` on `area:rl` work.

## Tests
Claude writes the tests; nobody hand-writes them. The rules are in [AGENTS.md](AGENTS.md#tests-you-write-them-keep-them-few):
few known-answer tests per component, probe environments for the PPO, one smoke test. In `area:rl` PRs you check one
small test case by hand and say so in the PR. Reviewers only check that expected values don't come from the code itself.

## Sprints
Two weeks, **Wednesday to Wednesday** (our meetings), starting 2026-11-11. Antoni is the sprint lead.
- **Board:** one GitHub Project with a **Status** field (Todo → In progress → In review → Done) and an **Iteration**
  field (the sprint). Views: *Current sprint* (`iteration:@current`), *Backlog*, *By person*.
- **Planning** (Wednesday): the sprint lead sets the next iteration on chosen backlog issues and assigns them.
  Unassigned issues in the current sprint are up for grabs: assign yourself.
- **During the sprint:** the sprint lead checks the board weekly and rebalances anything that hasn't started.
- **Retro** (15 min): what worked, what didn't, one change for the next sprint.

## Experiments
RL work is experiment-driven. Use the **Experiment** issue form: hypothesis, setup (commit, config, seeds),
metric, result, conclusion.
- **Tracking:** every training run logs to Weights & Biases (now CoreWeave Forge, academic plan): team **`slopoly`**,
  project **`slopoly-rl`** (`wandb.init(entity="slopoly", project="slopoly-rl")`), with its full config, seed and git
  commit. Set `slopoly` as your default team in your W&B user settings. Setup: #1.
- **Models:** checkpoints are W&B Artifacts (`<model>:latest`, `:best`) and are never committed to Git. Self-play opponents are referenced by artifact name in the config.
- **Replays:** log a Slopoly replay of an evaluation game every N updates, so we can watch play improve.
- Link the W&B run in the experiment issue's result.

## Definition of Done
- Acceptance criteria met, tests added or updated and passing (`uv run pytest`, `npm run typecheck`)
- Python formatted with Ruff (`uvx ruff format .`, checked in CI; no linter rules enforced)
- Contract changes (`docs/game_state.md`) agreed in the issue and documented
- Reviewed by someone else and merged; the issue is closed by the PR
