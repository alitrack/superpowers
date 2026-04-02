## Context

上一条画布 change 解决了“能不能把树画出来”的问题，但没有解决“树为什么存在”和“节点到底是什么”的问题。当前代码已经暴露出两个关键事实：

1. [web-mainstage.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/web-mainstage.cjs#L213) 会把 `currentMessage.options` 直接映射成 `kind = 'branch'` 的节点；
2. [codex-runtime-adapter.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/codex-runtime-adapter.cjs#L1026) 到 [codex-runtime-adapter.cjs](/mnt/d/wsl2/codex/superpowers/skills/brainstorming/scripts/codex-runtime-adapter.cjs#L1068) 的状态机，只维护 `candidateDirections / shortlistedDirections / selectedCriterion / selectedPath`，并没有真正的 branch-run runtime。

这意味着当前产品把“候选项”“ shortlist ”和“真实分支”混成了一个视觉概念。结果是：

- 树可以看，但看不懂；
- 节点很多，但职责不清；
- 分支像是存在，但其实并不能真正切换和并跑。

这条 change 的目标不是继续修视觉，而是先把语义模型立住，让树成为“决策与分支的工作台”，而不是装饰性流程图。

## Goals / Non-Goals

**Goals:**

- 明确树存在的产品理由：它必须表达决策来源、候选方向、分支状态和结果收敛。
- 把节点语义拆分为稳定的几类，而不是继续让所有节点长得像同一种 branch。
- 让“option”和“branch-run”成为两个不同概念，避免假分支。
- 让用户在树上切换 branch，上方主输入区只服务当前选中的可回答上下文。
- 在单 session 内支持真实 branch-run 的最小运行模型，至少覆盖“多选方向后显式拉起并行支线”。

**Non-Goals:**

- 不做 Flowith 式自由白板，不允许任意拖线、随意生成节点或无边界编辑。
- 不把所有问题类型都做成可分支；V1 只覆盖 branchable 的多选方向型决策。
- 不暴露 subagent、git、CLI、runtime provenance 这类技术实现给最终用户。
- 不在这条 change 里追求完整视觉 polish；优先级是语义正确、交互自洽、状态可恢复。

## Decisions

### Decision: 树不是装饰，而是“决策 lineage + branch status”主视图

树之所以存在，不是为了证明系统会画节点，而是为了同时回答四个问题：

- 当前正式决策是什么？
- 这个决策是从哪条路径走到这里的？
- 当前有哪些候选方向？
- 哪些候选方向已经被 materialize 成了真正 branch run？

**Why this over 继续把树当可视化装饰?**

- 如果树不能表达 lineage 和 branch state，用户不会从它获得任何比表单更高的价值。
- 一旦树不能驱动操作，它就只能退化回“带连接线的摘要图”。

### Decision: 节点语义固定为五类

V1 固定为五种节点：

- `topic`: 用户真正抛出的问题或任务根节点。
- `decision`: 一轮正式决策节点，例如框定问题、选方向、选标准、选路径。
- `option`: 当前 `decision` 下的候选项，只是候选，不等于 branch。
- `branch-run`: 已经 materialize 的真实支线，拥有自己的状态、当前问题和结果。
- `result`: 最终 recommendation、spec、plan 或 artifact 收敛节点。

**Why this over 继续用 topic/path/branch/active 几种模糊节点?**

- 现在的主要混乱正是因为 `option` 和 `branch` 没有边界。
- 节点分类必须服务“用户怎么理解”和“系统怎么调度”，而不是只服务 CSS 样式。

### Decision: Option 不是 branch，只有被显式 materialize 才是 branch-run

当前轮题目的 `options` 只是“当前 decision 的候选答案”。它们默认只能表示：

- 可以选哪个
- 可以选几个
- 这些选择会如何影响后续路径

但它们默认不应表示：

- 已经拥有独立运行状态的支线
- 可以单独恢复、继续、完成的 branch run

只有在用户明确触发“把这些选择作为分支继续探索”之后，才生成 `branch-run` 节点。

**Why this over 自动把 option 画成 branch?**

- 自动把 option 画成 branch 会制造“系统已经在并行探索”的假象。
- 多选本身既可能表示 shortlist，也可能表示希望并跑，不能混成同一件事。

### Decision: Branch materialization 采用显式动作，而不是多选即自动 fork

对 branchable 的 `pick_many` 决策，V1 采用两段式：

1. 用户先选择多个候选项，形成 shortlist。
2. 用户再显式点击“并行探索这些选项”之类的动作，把 shortlist materialize 成真实 `branch-run`。

**Why this over 多选即自动 fork?**

- 多选本身经常只表示“这些都值得比较”，不代表用户要立即为每条都创建支线。
- 显式动作能把 shortlist 和 branch-run 清晰分开，减少语义误解。
- 这也解决了之前未决的 `auto-trigger on multiselect vs explicit action` 分歧，V1 选择显式动作更稳。

### Decision: 只有一个“当前可回答上下文”

即使存在多个 `branch-run`，任一时刻也只有一个正式可回答上下文：

- 主线当前 `decision`
- 或用户当前选中的某个 `branch-run`

树上点击 branch-run，只是切换“当前上下文”；它不会让多个问题同时可回答。

**Why this over 多个节点同时可回答?**

- 现有 runtime 仍然是单 active message 模型，强行多活会让状态一致性失控。
- 用户也更容易理解“我正在这个支线上继续”，而不是“树上多个输入框都能点”。

### Decision: Branch-run 采用最小运行模型

V1 branch-run 至少要持久化这些字段：

- `branchId`
- `parentDecisionId`
- `sourceOptionId`
- `title`
- `status`: `queued | active | paused | complete`
- `currentMessage`
- `history`
- `resultSummary`

如果并行上限受限，超出的 branch-run 可处于 `queued`，但必须在树上明确显示，不允许无声丢弃。

**Why this over 只在前端临时渲染几个支线卡片?**

- 没有持久状态，就不可能 reload、切换、继续。
- 用户要的是“分支工作台”，不是“临时比较面板”。

### Decision: Focused / overview 的语义围绕 decision context，而不是围绕整图缩放

- `focused`: 看当前 `decision` 或当前 `branch-run` 及其最近 lineage。
- `overview`: 看 topic、主干、已 materialize 的 branch-runs 与结果分布。

这两个模式的区别必须是“看什么关系”，而不是单纯“整图缩小/放大”。

**Why this over 只靠 fitView 缩放?**

- 单纯缩放无法解决“用户不知道哪些节点当前 relevant”。
- focused/overview 应该表达工作语义，而不仅是摄影机语义。

## Risks / Trade-offs

- [Risk: 语义模型一旦扩展到 branch-run，会触发 runtime 复杂度上升] → Mitigation: V1 只支持 branchable 多选决策，不做任意节点 fork。
- [Risk: 显式 materialize 动作让流程变长] → Mitigation: 这是为了换取 shortlist 与真实支线的清晰边界，优先保证产品逻辑自洽。
- [Risk: 单 active context 与并行 branch-run 听起来矛盾] → Mitigation: 并行指的是“状态可并存、可切换、可排队”，不是同时在一个画面上回答多个输入框。
- [Risk: 继续沿用现有单 session schema 会让 branch-run 数据结构别扭] → Mitigation: 先在 session 内引入 branch-runs 集合，不另开新顶层对象家族。

## Migration Plan

1. 先重构 state contract：把 `option`、`shortlist`、`branch-run` 分清，补上 branch-run persistence 字段。
2. 再重构 `web-mainstage.cjs`：停止把 `message.options` 直接映射成 branch 节点。
3. 然后改 UI：引入 `decision node / option node / branch-run node` 的不同视觉和交互。
4. 最后补 tree-driven branch switching、reload 恢复和显式 materialize 流程。

## Open Questions

- branch-run 的并行上限 V1 是 `2` 还是 `3` 更稳？
- branch-run 被 materialize 后，主线是否应自动进入“等待选择某个支线继续”，还是保留最近主线 decision 作为默认上下文？当前倾向后者，但实现前仍需再确认一次。
