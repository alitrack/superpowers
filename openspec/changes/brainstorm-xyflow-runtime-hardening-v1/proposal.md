## Why

当前 browser brainstorming 仍然没有做出用户要的“真实决策树效果”：虽然已经有 topic、path、active、convergence、artifact 这些语义，但主舞台仍然不是一个可信的节点图产品，分叉、连线、收敛关系都不够直接可见。同时，真实 runtime 在建会话和后续提交时仍可能长时间挂起，导致第二题这类关键流程“看起来无法提交”，产品在最基本交互上都不稳定。

现在需要把“真实树形画布”与“runtime 生存性修复”放到同一条 change 中推进。只修视觉不修卡死，用户仍然走不下去；只修卡死不换画布，产品仍然看不出价值。

## What Changes

- Replace the handcrafted browser tree/workbench rendering with an `@xyflow/react` canvas that uses real nodes and edges instead of pseudo-tree columns.
- Introduce custom node types for topic, completed path step, active question, branch direction, convergence, and artifact so the mainstage visibly reads as a decision tree.
- Keep the single formal question embedded inside the active node while non-active nodes remain inspectable, selectable, and non-answerable.
- Render convergence and artifact results as first-class graph nodes connected to the explored path instead of as detached inspector panels.
- Add bounded timeout, fallback, and recoverable error handling for browser session creation and answer submission so create/submit cannot hang indefinitely without visible recovery.
- Add regression coverage for the “second question cannot submit” class of failures and for create/submit fallback behavior.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `brainstorm-canvas-workspace-ui`: Change the browser workspace from a handcrafted pseudo-tree layout into a real node-and-edge canvas rendered through `xyflow`.
- `brainstorm-mainstage-ui`: Change the mainstage so the visible graph, not a card stack or inspector result panel, owns the primary user attention during both active and completed sessions.
- `brainstorm-web-ui`: Change the browser interaction model so active-question controls, convergence, and artifact results all live inside the graph workspace with user-facing node actions.
- `brainstorm-web-session-management`: Change browser session creation and answer submission so they complete within bounded time, fail over predictably, or surface a recoverable error instead of silently stalling.
- `codex-brainstorm-runtime`: Change real runtime create/submit behavior so provider stalls do not leave browser sessions indefinitely unresolved during the live brainstorming flow.

## Impact

- Adds a new browser-side graph rendering layer and dependency set centered on `react`, `react-dom`, `@xyflow/react`, and a deterministic layout helper such as `dagre`.
- Substantially affects `skills/brainstorming/scripts/web-app-shell.html` and `skills/brainstorming/scripts/web-mainstage.cjs`, which will become a shell plus graph-state adapter rather than the primary handwritten renderer.
- Likely introduces a small bundled browser client for the brainstorming canvas while preserving the current session APIs and runtime/session manager contracts.
- Affects `skills/brainstorming/scripts/web-session-manager.cjs` because create/submit timeout and fallback behavior must become bounded and testable.
- Expands brainstorm-server regression coverage for graph rendering markers, runtime fallback, and the second-question submission path.
