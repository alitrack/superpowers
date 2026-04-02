## Why

当前 browser brainstorming 的“决策树”最大的问题不是样式，而是语义失真：

- `topic / history / active / option / result` 都已经被画成节点，但节点含义没有被严格区分；
- 当前 `message.options` 会被前端直接渲染成 `branch` 节点，导致“候选项”和“真实分支”被混为一谈；
- runtime 里目前只有 `candidateDirections / shortlistedDirections / selectedPath` 这类单会话收敛语义，并没有真正的 branch-run session；
- 用户因此无法回答三个最基本的问题：
  - 为什么这里要用树？
  - 每个节点到底代表什么？
  - 如果我要真正跑分支，应该怎么做？

这会直接把产品做成一种“看起来像树的问卷流”。用户看到的不是一个可以理解决策路径、切换支线、收敛结果的 brainstorming workspace，而是一张语义混乱的流程图。

现在必须新增一条 change，把“树的存在理由”“节点语义”“分支 materialization 规则”和“主输入区与树的关系”明确下来，作为后续实现的唯一约束。

## What Changes

- Define an explicit semantic node taxonomy for the brainstorming canvas: `topic`, `decision`, `option`, `branch-run`, and `result`.
- Stop treating all current-question options as branch nodes; render them as candidate options unless they are explicitly materialized as true branch runs.
- Introduce an explicit branch-materialization action for branchable multi-select decisions so users can choose whether selected directions remain a shortlist or become separate branch runs.
- Extend session/runtime state so a single brainstorming session can persist real branch runs with parent decision, current status, current active message, and branch result summary.
- Make tree selection drive the main answer surface so only the active mainline decision or the selected branch run is answerable at one time.
- Preserve a truthful single-thread mode when no branch run has been materialized, so the UI does not pretend parallel execution exists when it does not.

## Capabilities

### New Capabilities

- None.

### Modified Capabilities

- `brainstorm-canvas-workspace-ui`: Change the canvas so node shapes and edges reflect semantic roles rather than treating every option as a branch.
- `brainstorm-mainstage-ui`: Change the mainstage so the current answer surface is bound to the selected decision context or selected branch run.
- `brainstorm-web-ui`: Change browser interactions so users can explicitly materialize selected options into branch runs and switch among them from the tree.
- `structured-brainstorming-flow`: Change the flow contract so shortlisted options, selected path, and materialized branch runs are distinct concepts.
- `codex-brainstorm-runtime`: Change runtime/session persistence so branch runs can exist inside one brainstorming session without collapsing back into a single linear transcript.

## Impact

- Substantially affects [web-mainstage.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/web-mainstage.cjs), which currently maps current options directly into `branch` nodes.
- Affects [codex-runtime-adapter.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/codex-runtime-adapter.cjs) because the strategy state must distinguish shortlist semantics from materialized branch runs.
- Affects [web-session-manager.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/web-session-manager.cjs) because branch-run state, branch selection, and reload behavior must persist inside one session.
- Affects the browser shell and graph client because the canvas needs distinct node components and actions for `decision`, `option`, and `branch-run`.
- Requires new regression coverage so the product can no longer regress into “option nodes masquerading as branch nodes.”
