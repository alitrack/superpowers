# Repository Guidelines

## Project Structure & Module Organization
`skills/<skill-name>/SKILL.md` contains the core workflow library; keep any helper scripts or examples inside the same skill directory. `commands/` holds lightweight command docs, `agents/` contains reusable agent prompts, and `hooks/` stores harness hook configs and launch scripts. Platform packaging lives under `.codex/`, `.opencode/`, `.claude-plugin/`, and `.cursor-plugin/`. Tests are grouped by harness and behavior under `tests/claude-code/`, `tests/opencode/`, `tests/skill-triggering/`, `tests/explicit-skill-requests/`, `tests/brainstorm-server/`, and `tests/subagent-driven-dev/`.

## Build, Test, and Development Commands
There is no single top-level build step; run the smallest validation that matches your change.

- `./tests/claude-code/run-skill-tests.sh` runs the fast Claude Code suite.
- `./tests/claude-code/run-skill-tests.sh --integration` runs the slow end-to-end Claude flow.
- `./tests/opencode/run-tests.sh` validates OpenCode plugin structure; add `--integration` for tool and priority tests.
- `./tests/skill-triggering/run-all.sh` checks automatic skill triggering.
- `./tests/explicit-skill-requests/run-all.sh` checks explicit skill-invocation behavior.
- `npm --prefix tests/brainstorm-server test` runs the brainstorm server Node test after installing that fixture's dependencies.

## Coding Style & Naming Conventions
Match the existing style of the file you touch. Skill directories use kebab-case. Each `SKILL.md` starts with YAML frontmatter containing only `name` and `description`, and descriptions should begin with `Use when...`. Markdown should stay terse, instructional, and easy to scan. Shell scripts should use `#!/usr/bin/env bash`; prefer `set -euo pipefail` for non-trivial scripts. JavaScript follows the current CommonJS style with 2-space indentation. Avoid repo-wide reformatting; no root formatter is enforced.

## Testing Guidelines
Add or update the narrowest test suite that proves the behavior you changed. Shell-based tests are typically named `test-*.sh`, while prompt fixtures live in `tests/*/prompts/`. For skill wording changes, include adversarial or regression-style evidence, not just a happy-path transcript.

## Commit & Pull Request Guidelines
Recent commits use short, imperative subjects such as `Add PR template to filter low-quality submissions`. Keep commits focused on one logical change. PRs must follow `.github/PULL_REQUEST_TEMPLATE.md`: explain the problem, summarize the change, justify why it belongs in core, list alternatives, record harness/model/environment, and confirm human review. Before opening a PR or issue, search existing open and closed threads for duplicates.

## Agent-Specific Notes
When editing or adding skills, use `skills/writing-skills/SKILL.md` as the canonical authoring guide and update the relevant test harness in the same change.
