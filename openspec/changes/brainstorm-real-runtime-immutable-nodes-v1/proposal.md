## Why

当前 `/app` 仍然没有满足两个产品级硬约束：正式 question 必须来自 Codex 实时生成，且 question node 一旦生成就必须冻结为历史快照，后续只能追加新 node 而不能回写旧 node。只要还允许产品路径无声退到 fake question，或者继续用“从当前 session 状态重建树”的方式显示节点，用户看到的就不是真正的头脑风暴产品。

## What Changes

- Remove silent fake-question fallback from the product `/app` path so browser sessions either run on a real Codex backend or fail explicitly.
- Persist each generated question as an immutable node snapshot at creation time instead of reconstructing the visible tree from mutable current session state.
- Change answer submission and explicit fork behavior so they append new nodes and edges to an immutable node log instead of mutating previously generated question nodes.
- Restore browser tree, active context, and branching from the persisted immutable node log on reload.
- Update browser tests and runtime tests so product mode can no longer regress into fake questions or mutable historical nodes.

## Capabilities

### New Capabilities
- None.

### Modified Capabilities
- `codex-brainstorm-runtime`: Require product-mode questions to come from a real Codex runtime and persist generated question snapshots as immutable node records.
- `codex-brainstorm-backend-selection`: Tighten failure behavior so product sessions fail explicitly when no real backend can continue instead of degrading into fake question generation.
- `structured-brainstorming-flow`: Change host/backend flow semantics so each generated question becomes a frozen historical node and later turns only append new nodes.
- `brainstorm-canvas-workspace-ui`: Change canvas restoration and branching semantics to use immutable node history rather than recomputed transient graph state.
- `brainstorm-mainstage-ui`: Keep the active node driven by the immutable node log while preserving prior generated nodes exactly as they were first shown.
- `brainstorm-web-ui`: Ensure the browser exposes real-runtime failures explicitly and never pretends that fake questions are live product brainstorming.

## Impact

- Affects `skills/brainstorming/scripts/codex-runtime-adapter.cjs`, `web-session-manager.cjs`, and `server.cjs` because backend selection, session creation, submit flow, and reload behavior need to enforce real-runtime-only product questions.
- Affects `skills/brainstorming/scripts/web-mainstage.cjs`, `web-app-shell.html`, and `skills/brainstorming/web-client/src/index.jsx` because the browser tree must render from persisted immutable nodes instead of mutable session snapshots.
- Requires updated regression coverage in `tests/brainstorm-server/` so product mode, branching, reload, and node history are locked to the new semantics.
