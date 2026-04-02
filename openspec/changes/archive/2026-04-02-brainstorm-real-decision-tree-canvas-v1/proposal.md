## Why

当前 browser brainstorming 虽然已经有 branch/workbench 数据模型，但可见产品形态仍然是“左栏列表 + 中间表单 + 右栏详情”的 panel dashboard，而不是你要求的决策树主画布。只要主视觉还是这种布局，用户就不会把它理解成真正的头脑风暴产品，而只会觉得是一个换皮后的表单工具。

同时，真实 runtime 的首轮创建和后续提交存在明显等待时间，但当前前端没有足够清晰的 loading / error 反馈，导致 `Artifact Session` 或第二题提交时很容易被误判成“按钮没反应”。现在需要同时解决“主形态不对”和“交互反馈缺失”这两个阻塞问题，才有资格进入下一轮产品验证。

## What Changes

- Replace the current three-panel dashboard composition with a real decision-tree-first canvas where the branch structure occupies the primary visual surface.
- Render the current active question as a node on the tree itself instead of as a separate central form panel detached from the branch path.
- Show parent-child path, sibling directions, and finished result nodes with explicit tree relationships rather than grouped lists of cards.
- Demote inspector/details into a secondary surface so it no longer competes with the tree canvas for mainstage ownership.
- Keep the “start another topic” entry available, but constrain it to a secondary dock so it cannot reclaim the mainstage during an active or completed session.
- Add visible pending, disabled, and failure feedback for session creation and answer submission so slow real-runtime calls no longer look like inert UI.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `brainstorm-canvas-workspace-ui`: Change the workspace from a panelized workbench into a decision-tree-first spatial canvas with explicit branch relationships and an active node embedded in the tree.
- `brainstorm-mainstage-ui`: Change the mainstage from equal-weight tree/stage/context panels into a tree-dominant canvas where inspector surfaces stay secondary.
- `brainstorm-web-ui`: Change browser interaction behavior so users receive clear loading, disabled, and error feedback during slow session creation and answer submission.
- `structured-brainstorming-flow`: Change host rendering expectations so the browser shows one active node inside the tree canvas while also exposing pending state during backend waits instead of appearing inert.

## Impact

- Affects `skills/brainstorming/scripts/web-app-shell.html` and `skills/brainstorming/scripts/web-mainstage.cjs` significantly because the current DOM and layout are still dashboard/panel oriented.
- Likely affects browser-side host interaction code in `web-app-shell.html` and possibly `structured-host.cjs` styling hooks to support request pending/disabled/error states cleanly.
- Extends `tests/brainstorm-server/web-mainstage-state.test.js` and `tests/brainstorm-server/web-product.test.js` to lock the product shape around a true tree canvas and explicit async feedback.
- Does not introduce a new runtime protocol family or a new persistent tree schema; V1 still derives visible structure from existing session/workflow/provenance data.
