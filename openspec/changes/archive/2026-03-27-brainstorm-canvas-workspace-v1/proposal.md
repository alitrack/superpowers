## Why

当前浏览器版 brainstorming 已经从多面板 workbench 收敛成 question-first mainstage，但它还没有形成 `flowith.io` 那种强工作空间感和空间记忆。现在需要在不破坏现有一问一答主线和 runtime contract 的前提下，引入真正的 brainstorming 画布工作区，让用户能在同一个空间里看到当前问题、最近收敛轨迹、候选方向和最终交付物之间的关系，而不是只看到线性舞台。

## What Changes

- Add a dedicated brainstorming canvas workspace shell that presents the current active question as the anchor card inside a spatial board rather than only as a linear mainstage.
- Keep the current one-active-question interaction contract, but render recent steps, selected directions, review checkpoints, and finished deliverables as supporting canvas cards around the active decision.
- Preserve the always-available “start a new brainstorm” entry inside the canvas workspace without resetting the current session.
- Introduce a first-pass canvas interaction model for browsing the current session path, inspecting supporting cards, and moving between focused and overview states.
- Keep this V1 canvas scoped to a single primary path with supporting context cards; do not introduce freeform whiteboard editing or arbitrary multi-branch graph authoring yet.

## Capabilities

### New Capabilities
- `brainstorm-canvas-workspace-ui`: Covers the spatial canvas workspace, anchor-card layout rules, supporting canvas cards, and the transition between focused question mode and overview mode.

### Modified Capabilities
- `brainstorm-mainstage-ui`: The primary brainstorming shell changes from a purely linear mainstage into a canvas-first workspace while preserving one dominant active decision.
- `brainstorm-web-ui`: The browser product now presents structured brainstorming inside a dedicated canvas workspace rather than only a question-first stage with a side context rail.
- `structured-brainstorming-flow`: Host presentation rules expand from lightweight recent context rail behavior to canvas-based supporting context while still keeping exactly one active answerable decision.

## Impact

- Affects `skills/brainstorming/scripts/web-app-shell.html`, `skills/brainstorming/scripts/web-mainstage.cjs`, and likely related browser rendering helpers for session layout state.
- Affects browser product tests under `tests/brainstorm-server/`, especially shell rendering, mainstage state, and smoke coverage.
- Does not require a new backend runtime contract, transport message type, or branching protocol for V1.
