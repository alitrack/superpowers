## Why

当前 `brainstorm-server` 有两条关键偏差。第一，用户“抛出本轮问题”的入口不是稳定主入口，而是受旧 session 和分支状态影响。第二，后端虽然在走结构化 contract，但没有真正以当前仓库里的 `skills/brainstorming/SKILL.md` 作为脑暴主策略来源，仍然主要依赖手写 runtime prompt。

现在需要把这两点纠正到位：Web 版必须始终给用户一个明确的抛题入口，同时后端必须以当前 brainstorming skill 为主脑暴策略，而不是继续做一个“像脑暴”的自定义 demo。

## What Changes

- Add a persistent browser-first brainstorm composer so the user can always start a fresh brainstorming thread by entering a new topic or problem statement.
- Change the browser shell so existing sessions no longer hide the primary “start a new brainstorm” entry path.
- Introduce a skill-backed runtime prompt layer that explicitly grounds Codex turns in the current `skills/brainstorming/SKILL.md` guidance.
- Keep the existing structured browser contract (`question`, `summary`, `artifact_ready`) while making the actual questioning strategy come from the brainstorming skill rather than from a hand-authored pseudo-skill flow.
- Preserve a compatibility fallback so the local fake runtime and unseeded flows still work in tests, but demote them from the primary product path.

## Capabilities

### New Capabilities
- `brainstorm-skill-orchestration`: Covers how the web runtime uses the repository’s current brainstorming skill as the primary facilitation policy for Codex-backed brainstorming sessions.

### Modified Capabilities
- `brainstorm-session-seed-entry`: Change the browser UX so the user’s seed-entry surface is a stable primary affordance rather than a conditional fallback state.
- `structured-brainstorming-runtime`: Change runtime initialization and prompt building so Codex-backed sessions are grounded in the current brainstorming skill instead of only custom runtime prose.
- `structured-brainstorming-flow`: Change browser session flow so existing sessions do not obscure the ability to start a new brainstorm from a fresh user topic.

## Impact

- Affects `skills/brainstorming/scripts/web-app-shell.html`, `codex-runtime-adapter.cjs`, and related tests.
- Adds a skill-loading/prompt-grounding layer for Codex app-server and exec providers.
- Requires regression tests proving both stable entry visibility and skill-backed prompt composition.
