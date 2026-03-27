## Why

`brainstorm-server` 现在已经能通过真实 Codex backend 在 `/app` 里连续提问，但当前提问方式仍然像 intake form：先收主题，再收目标，再收用户。它不是旧的 demo tree 了，却也还没有做到真正的 brainstorming，无法稳定地产生问题重构、方向发散、方案收敛和可执行 handoff。

现在需要把“真实后端已接通”的下一步做完：把当前结构化访谈式提问升级为真正的 brainstorming engine，让后端不只是收字段，而是推进认知工作。

## What Changes

- Add a dedicated brainstorming strategy layer that tracks the current facilitation phase, the next learning goal, and the converged path instead of asking a fixed intake-style sequence.
- Replace the current bootstrap questioning style with phase-aware prompting that can reframe the problem, generate multiple candidate directions, compare options, and then converge to a recommendation.
- Preserve the browser transport contract (`question`, `summary`, `artifact_ready`) while making the content of those messages reflect real brainstorming work rather than generic form collection.
- Persist enough strategy state per session so a resumed browser session continues the same brainstorming phase and candidate-path context instead of degrading into a fresh generic questionnaire.
- Add evaluation-oriented tests and manual smoke criteria focused on “is this a real brainstorming turn?” rather than only “did a structured question appear?”

## Capabilities

### New Capabilities
- `brainstorming-facilitation-strategy`: Defines the backend phase model for brainstorming sessions, including scoping, reframing, divergence, convergence, and handoff.
- `brainstorming-direction-exploration`: Defines how the backend surfaces multiple viable directions, compares them, and narrows toward a selected path instead of only collecting linear questionnaire fields.

### Modified Capabilities
- `structured-brainstorming-flow`: Change flow behavior from generic intake-style sequencing to high-information-gain questioning driven by brainstorming phase and learning goals.
- `structured-brainstorming-runtime`: Extend the runtime from “provider-backed structured Q&A” to “provider-backed brainstorming facilitator” with resumable strategy state.

## Impact

- Affects `skills/brainstorming/scripts/codex-runtime-adapter.cjs`, `codex-app-server-client.cjs`, `codex-exec-runner.cjs`, and `web-session-manager.cjs`.
- Requires new per-session state for brainstorming phase, active hypothesis/learning goal, and candidate directions under consideration.
- Adds prompt/policy assets or equivalent runtime configuration for true brainstorming behavior, plus regression tests and manual evaluation fixtures for real sessions.
