## Why

当前 browser brainstorming 的主要问题不是“还差一点”，而是产品形态本身偏离了真正的头脑风暴。现有实现仍然把系统预设问题、中心问答面板和辅助侧栏当成主交互，这会把产品体验导向问卷、向导或聊天页，而不是围绕用户主题展开、分支、比较、收敛的节点画布工作台。

现在需要用一个独立 change 明确纠偏：把用户输入主题作为唯一正式起点，把每次推进都落到画布节点上，并让分支、收敛和最终产物都在同一画布中成立。只有这样，后续实现才不会继续围绕错误模型反复打补丁。

## What Changes

- Make the browser brainstorming experience topic-driven so a new session starts from one explicit user-provided brainstorming problem instead of a system-authored first question.
- Replace the central-question workbench pattern with a node-canvas interaction model where the active step, user answers, follow-up prompts, branch explorations, convergence summaries, and final deliverables all exist as canvas nodes.
- Let users continue from any meaningful node through a small set of product actions such as deepening, branching, adding context, or converging, while the backend still controls the formal structured flow.
- Introduce convergence and artifact nodes so finished output is shown as a product result that visibly grows out of the explored branches instead of as an isolated summary panel.
- Keep inspection and session navigation secondary so the canvas remains the primary product surface.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `brainstorm-session-seed-entry`: Change the browser entry experience so the user topic is the single formal start of a new brainstorm and remains the persistent root context of the canvas.
- `brainstorm-canvas-workspace-ui`: Change the workspace from a decision-focused workbench into a topic-rooted node canvas that can show path growth, sibling branches, convergence, and artifact nodes in one surface.
- `brainstorm-mainstage-ui`: Change the dominant mainstage surface so the canvas itself owns focus instead of a detached central question panel or equal-weight dashboard regions.
- `structured-brainstorming-flow`: Change host expectations so each backend step is rendered as the next node on the canvas and the browser never fabricates local question sequencing outside the active branch context.
- `brainstorm-web-artifacts`: Change finished-result presentation so deliverables are materialized as artifact nodes with traceable branch provenance and can be reopened from completed sessions.
- `brainstorm-web-ui`: Change the browser product from a form-driven workbench into a topic-first, node-driven brainstorming experience without exposing protocol mechanics.

## Impact

- Affects `skills/brainstorming/scripts/web-app-shell.html` and `skills/brainstorming/scripts/web-mainstage.cjs` substantially because the current shell still assumes a central active question surface plus supporting panels.
- Likely affects browser-side session state mapping, node derivation, and completion rendering so topic, branch, convergence, and artifact nodes can be derived consistently from existing runtime/session data.
- Requires spec deltas and tests to lock the new topic-entry, node-continuation, branch/convergence, and artifact-node behaviors instead of only validating a dashboard-like workbench.
- Intentionally does not introduce a new public protocol family in V1; the browser should derive the visible node canvas from existing session and workflow data while keeping backend workflow authority intact.
