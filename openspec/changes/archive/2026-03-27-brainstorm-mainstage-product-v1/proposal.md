## Why

当前浏览器版 brainstorming 虽然已经具备 seed-first、skill-backed、真实 runtime、finished deliverable 和 full-skill workflow，但主界面仍然更像“很多功能面板的集合”而不是一个一眼就知道当前该做什么的产品主舞台。现在需要把主工作台收敛成真正的问题驱动界面，让用户一进入页面就看到当前唯一活动问题和作答区，而不是先被历史、面板和中间状态分散注意力。

## What Changes

- Redesign the browser brainstorming mainstage so the current active question or approval decision is always the dominant visual focus.
- Keep recent context visible but lightweight by default, showing only the most recent 2-3 completed steps unless the user explicitly expands full history.
- Turn completed `spec + plan` output into a dedicated completion surface inside the same product shell instead of leaving it as one more panel competing with in-progress questioning.
- Demote supporting information such as older sessions, workflow detail, and auxiliary side panels so they remain accessible without competing with the main question stage.
- Preserve the always-available “start a new brainstorm” affordance while keeping the current in-progress or completed session stable.

## Capabilities

### New Capabilities
- `brainstorm-mainstage-ui`: Covers the question-first mainstage, lightweight recent context rail, and dedicated completion presentation for the finished `spec + plan` bundle.

### Modified Capabilities
- `brainstorm-web-ui`: The browser product experience changes from a panel-first shell to a question-first mainstage where the current active decision dominates.
- `structured-brainstorming-flow`: Host presentation rules change so only the current active decision is visually primary, with recent history shown as lightweight supporting context.

## Impact

- Affects `skills/brainstorming/scripts/web-app-shell.html`, related browser-session rendering helpers, and possibly host-side view-state helpers in the brainstorm web product.
- Affects the way completed `summary` / `artifact_ready` states are presented in the browser UI, but does not change the underlying transport contract.
- Requires focused browser/product regression tests for current-question prominence, recent-history visibility rules, and finished-result presentation.
