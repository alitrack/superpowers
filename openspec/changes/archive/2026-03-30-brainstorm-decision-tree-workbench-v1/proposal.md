## Why

当前 browser 版 brainstorming 虽然已经具备 structured flow、完成态结果面板和真实 runtime 接线，但整体仍然更像一个 demo shell：页面核心仍是 anchor card 加 supporting cards 的 detail-view 变体，而不是用户能长期停留、理解分支关系、推进阶段和查看交付物的真正工作台。

现在需要把产品模型从“单张主卡片 + 辅助卡片”推进到“decision-tree workbench”。如果这一层不先做对，后续再继续打磨视觉、结果页或 runtime 接线，用户看到的仍然只是一个会提问的页面，而不是一个能承载正式头脑风暴的产品。

## What Changes

- Rework the browser shell from the current anchor-card/detail-page model into a decision-tree workbench where branch structure is the primary organizing surface.
- Add a visible decision-tree view that keeps the current active node, its parent path, nearby sibling directions, and finished checkpoints in the same workspace.
- Replace the current “new brainstorm” hero-like emphasis with a secondary entry action so it no longer competes with the active session.
- Introduce a workbench layout that combines branch navigation, active-node answering, and supporting context panels instead of only rendering linear supporting cards.
- Surface workflow stage and review checkpoint context in user-facing workbench controls while preserving the one-active-question contract.
- Keep V1 scoped to a structured branch workbench for one active committed path plus visible adjacent context; do not introduce freeform whiteboard editing, arbitrary drag-and-drop graph authoring, or multi-user collaboration in this change.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `brainstorm-canvas-workspace-ui`: Change the workspace from anchor-card plus supporting-card composition to a decision-tree workbench skeleton with explicit branch structure and supporting workbench panels.
- `brainstorm-mainstage-ui`: Change the dominant experience from a card-first canvas mainstage to a workbench where the active branch node stays primary while branch navigation, stage context, and result surfaces remain visible around it.
- `brainstorm-web-ui`: Change the browser product from a polished session page into a true brainstorming workbench where users can start, continue, inspect, and finish a session without the UI collapsing back into a demo-style form shell.
- `structured-brainstorming-flow`: Change host presentation expectations so the browser keeps exactly one active answerable node while also exposing the surrounding branch path, checkpoints, and completion context inside the same workspace.

## Impact

- Affects `skills/brainstorming/scripts/web-app-shell.html`, `skills/brainstorming/scripts/web-mainstage.cjs`, and the browser interaction scripts that currently assume supporting-card-based rendering.
- Likely touches `skills/brainstorming/scripts/web-session-manager.cjs` only for view-model shaping and stage metadata exposure, not for a new protocol family.
- Requires updating `tests/brainstorm-server/` coverage so rendered workbench state, decision-tree visibility, and active-node behavior are exercised.
- Does not introduce a new brainstorming runtime backend, a new transport message family, or Flowith-style freeform infinite canvas editing in this slice.
