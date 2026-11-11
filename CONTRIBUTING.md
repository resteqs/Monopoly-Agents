# Contributing

How we (5 students) work together. AI-agent rules live in [AGENTS.md](AGENTS.md).

## Setup
```bash
cd engine && uv sync && uv run pytest     # Python engine
cd rl && uv sync && uv run pytest         # RL code (installs the engine, CPU torch, wandb)
cd viewer && npm install && npm run dev   # replay viewer
```
Agent skills (`mentoring-juniors`, `grill-me`, `grilling`, `to-tickets`, `diagnosing-bugs`) are committed in
`.agents/skills/` (pinned in `skills-lock.json`). To update them: `npx skills update`.

## Workflow
Based on [GitHub Flow](https://docs.github.com/en/get-started/using-github/github-flow), a
[Kanban](https://kanbanguides.org/) board and 2-week sprints.

1. **Every piece of work starts as an issue** (forms: Task, Bug, Experiment). A good issue is
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
7. **Squash merge**, delete the branch. CI (`pr-title`, `engine`, `rl`, `viewer`) must be green.

## Commit / PR title convention
We use [Conventional Commits](https://www.conventionalcommits.org/) (derived from the Angular convention):
`<type>(<optional scope>): <imperative summary>`, e.g. `feat(engine): add mortgages`, `fix(viewer): token offset on corners`.
Types: `feat` `fix` `docs` `test` `refactor` `perf` `build` `ci` `chore` `exp` (experiment code/configs).
Because we squash-merge, **the PR title becomes the commit on `main`**. CI checks the title, so commits inside
your branch can be informal.

## Sprints
Each sprint is a milestone that ends with the update email to our supervisor.
- Planning (15 min): pull issues from Todo into the sprint.
- Retro (15 min): what worked, what didn't, one change for the next sprint.

## Experiments
RL work is experiment-driven. Use the **Experiment** issue form: hypothesis, setup (commit, config, seeds),
metric, result, conclusion.
- **Tracking:** every training run logs to our Weights & Biases team (setup: #1), with its full config, seed and git commit.
- **Models:** checkpoints are W&B Artifacts (`<model>:latest`, `:best`) and are never committed to Git. Self-play opponents are referenced by artifact name in the config.
- **Replays:** log a Slopoly replay of an evaluation game every N updates, so we can watch play improve.
- Link the W&B run in the experiment issue's result.

## Definition of Done
- Acceptance criteria met, tests added or updated and passing (`uv run pytest`, `npm run typecheck`)
- Python formatted with Ruff (`uvx ruff format .`, checked in CI; no linter rules enforced)
- Contract changes (`docs/game_state.md`) agreed in the issue and documented
- Reviewed by someone else and merged; the issue is closed by the PR
