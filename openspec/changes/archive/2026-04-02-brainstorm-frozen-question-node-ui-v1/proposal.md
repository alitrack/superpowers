## Why

当前后端已经把 question node 持久化为 append-only 历史快照，但浏览器主画布仍会把已提交的 question 渲染成摘要化 round 卡片，导致用户感觉“旧 question 节点被改写了”。这直接破坏分支心智模型，因为用户无法相信某个已生成问题仍然是当时那个可回到的节点。

## What Changes

- Keep previously generated question nodes visually anchored to their original question snapshot after the user submits an answer.
- Render historical and non-active question nodes as read-only question snapshots instead of collapsing them into answer-summary cards.
- Keep exactly one answerable active node in the canvas while allowing historical question nodes to remain inspectable.
- Remove remaining UI fallbacks that infer historical node identity from mutable `currentMessage.questionId` when persisted round data is available.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `brainstorm-mainstage-ui`: historical question nodes must remain visually stable after answer submission while the active node alone accepts input.
- `brainstorm-canvas-workspace-ui`: the decision graph must render persisted question snapshots as read-only historical nodes rather than rewriting them into summary-style cards.

## Impact

- Affects `skills/brainstorming/scripts/web-mainstage.cjs` because round/path nodes currently discard historical question snapshots during workbench derivation.
- Affects `skills/brainstorming/scripts/structured-host.cjs` and `skills/brainstorming/web-client/src/index.jsx` because question rendering needs a read-only snapshot mode that preserves appearance without creating multiple answerable nodes.
- Requires updated regression coverage in `tests/brainstorm-server/web-mainstage-state.test.js` and possibly `tests/brainstorm-server/web-product.test.js` to lock the frozen-node behavior.
