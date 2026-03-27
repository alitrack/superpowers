## Why

当前 web 版 `brainstorm-server` 虽然已经有了真正的 phase-aware brainstorming engine，但会话入口仍然是“空启动”。这会让系统先问一个默认 scope 问题，把 intake 混进正式脑暴流程，导致用户先抛题、系统再围绕该题推进的基本体验没有成立。

现在需要把入口补正：用户先给出脑暴议题或困境，系统再基于这段 seed 进入正式的第一轮脑暴，而不是先生成一个默认 Q1。

## What Changes

- Add a seed-first session entry flow for the browser product so a new brainstorming session starts from a user-provided problem statement instead of an empty session.
- Extend the web session creation API to accept an initial brainstorming prompt and persist that prompt as session seed context.
- Update runtime initialization so sessions with a seed skip the generic “what do you want to brainstorm?” intake turn and start directly at the first real brainstorming move.
- Remove the current auto-create-empty-session behavior on initial page load and replace it with an explicit start surface that asks for the brainstorming topic first.
- Preserve a fallback path for programmatic callers that still create a session without a seed, but treat that as a compatibility fallback rather than the primary UX.

## Capabilities

### New Capabilities
- `brainstorm-session-seed-entry`: Covers seed-first session creation, persisted seed context, and host behavior before the first formal brainstorming question is emitted.

### Modified Capabilities
- `structured-brainstorming-flow`: Change session-start behavior so formal question sequencing begins after the user seed exists, rather than using an empty-session default question as the first visible turn.
- `structured-brainstorming-runtime`: Change runtime initialization so a seeded session can enter the correct facilitation phase immediately instead of always starting with a generic intake question.

## Impact

- Affects `skills/brainstorming/scripts/web-app-shell.html`, `server.cjs`, `web-session-manager.cjs`, and `codex-runtime-adapter.cjs`.
- Adds seed-aware API input and persisted session fields in the local web product.
- Requires regression tests for page-load behavior, seeded session creation, and first-turn quality.
